#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, hashlib, html, json, os, pathlib, re, time, urllib.parse, urllib.request

LIVE_THEME_ID = 141308166203
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_boardroom_ctr_batch_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

TITLE_KEY = 'snippets/innate-seo-title-override.liquid'
DESC_KEY = 'snippets/innate-seo-description-override.liquid'
TEMPLATE_KEY = 'templates/page.boardroom-tables.json'
URL_PATH = '/pages/boardroom-tables'

EXPECTED = {
    'title': 'Boardroom Tables NZ | Custom Timber & Power/Data | Innate',
    'description': 'Custom boardroom tables made in Christchurch for NZ offices. Solid timber meeting and conference tables, power/data planning, room-size advice and NZ-wide delivery.',
    'h1': 'Custom timber boardroom tables',
    'hero_subhead': 'Made in Christchurch for NZ offices, studios and commercial spaces. We design around your room size, seating count, timber choice, base style and power or data requirements.',
    'secondary_cta': 'Send room dimensions, seating target or plans. We’ll help shape the table around the space.',
    'make_it_yours': 'Pick a shape, timber and finish, or send us the room dimensions and seating target first. We’ll recommend a practical size, base direction and quote path before anything is made.',
    'cta_label': 'Start a boardroom table quote',
    'faq_size': 'The right size depends on the room, chair width, circulation space and how many people need to sit comfortably. As a starting point, send us the room dimensions and target seating count. We can recommend a table length, width and shape before quoting.',
    'faq_power': 'Yes. We can plan for power, USB, cable access and AV requirements where the room and table design allow. Tell us what needs to run through the table and we’ll factor it into the quote and construction details.',
}

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

def clean_text(s: str) -> str:
    s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()

def public_page(path: str):
    url = 'https://innatefurniture.co.nz' + path + '?boardroom_ctr_verify=' + str(int(time.time()))
    r = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    })
    with urllib.request.urlopen(r, timeout=45) as resp:
        raw = resp.read().decode('utf-8', 'replace')
        server = resp.headers.get('server-timing', '')
        status = resp.status
        final = resp.geturl()
    mt = re.search(r'<title>(.*?)</title>', raw, re.S | re.I)
    md = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=(["\'])(.*?)\1', raw, re.S | re.I)
    h1 = [clean_text(x) for x in re.findall(r'<h1[^>]*>([\s\S]*?)</h1>', raw, re.I)]
    body = clean_text(raw)
    return {
        'status': status,
        'final': final,
        'title': clean_text(mt.group(1)) if mt else None,
        'description': html.unescape(md.group(2).strip()) if md else None,
        'h1': h1,
        'body_sample': body[:2000],
        'serverTiming': server,
        'themeOk': f'theme;desc="{LIVE_THEME_ID}"' in server or f'theme;desc={LIVE_THEME_ID}' in server,
        'contains': {k: (v in body or v in raw) for k, v in EXPECTED.items() if k not in ['title','description']},
    }

def patch_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'Missing anchor for {label}')

# Confirm live theme.
themes = req('GET', '/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} not main')

before_public = public_page(URL_PATH)
title_before = get_asset(TITLE_KEY)
desc_before = get_asset(DESC_KEY)
template_before = get_asset(TEMPLATE_KEY)
(BACKUP / 'before_public_boardroom.json').write_text(json.dumps(before_public, indent=2), encoding='utf-8')
(BACKUP / 'before_innate-seo-title-override.liquid').write_text(title_before, encoding='utf-8')
(BACKUP / 'before_innate-seo-description-override.liquid').write_text(desc_before, encoding='utf-8')
(BACKUP / 'before_page.boardroom-tables.json').write_text(template_before, encoding='utf-8')

# Snippet title/meta changes.
title_after = patch_once(
    title_before,
    "echo 'Boardroom Tables NZ | Custom Timber Meeting Tables | Innate'",
    f"echo '{EXPECTED['title']}'",
    'boardroom SEO title'
)
desc_after = patch_once(
    desc_before,
    "echo 'Custom boardroom and meeting tables made in Christchurch for offices, studios and commercial spaces. Solid timber, steel bases, power/data planning and NZ-wide delivery.'",
    f"echo '{EXPECTED['description']}'",
    'boardroom SEO description'
)

# Template JSON setting changes only: keeps page editable in Shopify.
template = json.loads(template_before)
hero = template['sections']['hero_main']['settings']
hero['headline'] = f"<p>{EXPECTED['h1']}</p>"
hero['subhead'] = f"<p>{EXPECTED['hero_subhead']}</p>"
hero['secondary_cta_label'] = EXPECTED['secondary_cta']

landing_top = template['sections']['landing_top']['settings']
landing_top['cta_sub'] = f"<p>{EXPECTED['make_it_yours']}</p>"
landing_top['cta_label'] = EXPECTED['cta_label']

faq_blocks = template['sections']['faq_boardroom']['blocks']
faq_blocks['q_size']['settings']['content'] = f"<p>{EXPECTED['faq_size']}</p>"
faq_blocks['q_power']['settings']['content'] = f"<p>{EXPECTED['faq_power']}</p>"

template_after = json.dumps(template, ensure_ascii=False, indent=2)

(BACKUP / 'after_innate-seo-title-override.liquid').write_text(title_after, encoding='utf-8')
(BACKUP / 'after_innate-seo-description-override.liquid').write_text(desc_after, encoding='utf-8')
(BACKUP / 'after_page.boardroom-tables.json').write_text(template_after, encoding='utf-8')
(BACKUP / 'diff_title.patch').write_text('\n'.join(difflib.unified_diff(title_before.splitlines(), title_after.splitlines(), fromfile='before/'+TITLE_KEY, tofile='after/'+TITLE_KEY, lineterm='')), encoding='utf-8')
(BACKUP / 'diff_description.patch').write_text('\n'.join(difflib.unified_diff(desc_before.splitlines(), desc_after.splitlines(), fromfile='before/'+DESC_KEY, tofile='after/'+DESC_KEY, lineterm='')), encoding='utf-8')
(BACKUP / 'diff_template.patch').write_text('\n'.join(difflib.unified_diff(template_before.splitlines(), template_after.splitlines(), fromfile='before/'+TEMPLATE_KEY, tofile='after/'+TEMPLATE_KEY, lineterm='')), encoding='utf-8')

# Live writes, approved exact boardroom CTR batch.
put_asset(TITLE_KEY, title_after)
put_asset(DESC_KEY, desc_after)
put_asset(TEMPLATE_KEY, template_after)

read_title = get_asset(TITLE_KEY)
read_desc = get_asset(DESC_KEY)
read_template = get_asset(TEMPLATE_KEY)
(BACKUP / 'readback_innate-seo-title-override.liquid').write_text(read_title, encoding='utf-8')
(BACKUP / 'readback_innate-seo-description-override.liquid').write_text(read_desc, encoding='utf-8')
(BACKUP / 'readback_page.boardroom-tables.json').write_text(read_template, encoding='utf-8')
if read_title != title_after or read_desc != desc_after or json.loads(read_template) != json.loads(template_after):
    raise SystemExit('Theme asset readback mismatch')

time.sleep(2)
after_public = public_page(URL_PATH)
(BACKUP / 'after_public_boardroom.json').write_text(json.dumps(after_public, indent=2), encoding='utf-8')

verify = {
    'status_ok': after_public['status'] == 200,
    'theme_ok': after_public['themeOk'],
    'title_ok': after_public['title'] == EXPECTED['title'],
    'description_ok': after_public['description'] == EXPECTED['description'],
    'h1_ok': EXPECTED['h1'] in after_public['h1'],
    'expected_body_phrases': after_public['contains'],
}
verify['all_expected_body_phrases_ok'] = all(verify['expected_body_phrases'].values())
verify['ok'] = all([verify['status_ok'], verify['title_ok'], verify['description_ok'], verify['h1_ok'], verify['all_expected_body_phrases_ok']])
summary = {
    'ok': verify['ok'],
    'live_theme_id': LIVE_THEME_ID,
    'live_theme_role': live.get('role'),
    'live_theme_name': live.get('name'),
    'assets_changed': [TITLE_KEY, DESC_KEY, TEMPLATE_KEY],
    'backup': str(BACKUP),
    'hashes': {
        TITLE_KEY: hashlib.sha256(read_title.encode()).hexdigest(),
        DESC_KEY: hashlib.sha256(read_desc.encode()).hexdigest(),
        TEMPLATE_KEY: hashlib.sha256(read_template.encode()).hexdigest(),
    },
    'verify': verify,
    'before_public': before_public,
    'after_public': after_public,
}
(BACKUP / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not verify['ok']:
    raise SystemExit(2)
