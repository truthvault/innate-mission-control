#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, html, json, os, pathlib, re, time, urllib.parse, urllib.request

LIVE_THEME_ID = 141308166203
KEY = 'templates/page.boardroom-tables.json'
OLD = 'Made in Christchurch for NZ offices, studios and commercial spaces. We design around your room size, seating count, timber choice, base style and power or data requirements.'
NEW = 'Made in Christchurch and delivered NZ-wide for offices, studios and commercial spaces. We design around your room size, seating count, timber choice, base style and power or data requirements.'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_boardroom_nzwide_microfix_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p = pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store = (os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token = os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token:
    raise SystemExit('Missing Shopify env')
base = f'https://{store}/admin/api/2025-01'
headers = {'X-Shopify-Access-Token': token, 'Content-Type': 'application/json'}

def req(method: str, path: str, data=None):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=90) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}

def get_asset(key: str) -> str:
    q = urllib.parse.urlencode({'asset[key]': key})
    return req('GET', f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']

def put_asset(key: str, value: str):
    return req('PUT', f'/themes/{LIVE_THEME_ID}/assets.json', {'asset': {'key': key, 'value': value}})

def public_fetch():
    url = 'https://innatefurniture.co.nz/pages/boardroom-tables?boardroom_nzwide_verify=' + str(int(time.time()))
    r = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/125 Safari/537.36','Cache-Control':'no-cache'})
    with urllib.request.urlopen(r, timeout=45) as resp:
        raw = resp.read().decode('utf-8', 'replace')
        server = resp.headers.get('server-timing','')
        status = resp.status
    text = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
    text = re.sub(r'\s+', ' ', text)
    title = re.search(r'<title>(.*?)</title>', raw, re.S|re.I)
    return {'status': status, 'theme_ok': f'theme;desc="{LIVE_THEME_ID}"' in server, 'title': html.unescape(re.sub(r'\s+',' ',title.group(1)).strip()) if title else None, 'new_present': NEW in text, 'old_present': OLD in text, 'h1_present': 'Custom timber boardroom tables' in text, 'cta_present': 'Send room dimensions or plans' in text, 'raw_sample': text[:1200]}

themes = req('GET','/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} not main')

before_public = public_fetch()
before = get_asset(KEY)
(BACKUP/'before_public.json').write_text(json.dumps(before_public, indent=2), encoding='utf-8')
(BACKUP/'before_page.boardroom-tables.json').write_text(before, encoding='utf-8')

template = json.loads(before)
hero = template['sections']['hero_main']['settings']
if hero.get('subhead') not in (f'<p>{OLD}</p>', f'<p>{NEW}</p>'):
    raise SystemExit('Unexpected hero subhead; refusing to guess')
hero['subhead'] = f'<p>{NEW}</p>'
after = json.dumps(template, ensure_ascii=False, indent=2)
(BACKUP/'after_page.boardroom-tables.json').write_text(after, encoding='utf-8')
(BACKUP/'diff_template.patch').write_text('\n'.join(difflib.unified_diff(before.splitlines(), after.splitlines(), fromfile='before/'+KEY, tofile='after/'+KEY, lineterm='')), encoding='utf-8')

put_asset(KEY, after)
readback = get_asset(KEY)
(BACKUP/'readback_page.boardroom-tables.json').write_text(readback, encoding='utf-8')
if json.loads(readback) != json.loads(after):
    raise SystemExit('Readback mismatch')
time.sleep(2)
after_public = public_fetch()
(BACKUP/'after_public.json').write_text(json.dumps(after_public, indent=2), encoding='utf-8')
summary = {
    'ok': after_public['status'] == 200 and after_public['theme_ok'] and after_public['new_present'] and after_public['h1_present'] and after_public['cta_present'],
    'live_theme_id': LIVE_THEME_ID,
    'theme_role': live.get('role'),
    'changed': [KEY],
    'backup': str(BACKUP),
    'before_public': before_public,
    'after_public': after_public,
}
(BACKUP/'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not summary['ok']:
    raise SystemExit(2)
