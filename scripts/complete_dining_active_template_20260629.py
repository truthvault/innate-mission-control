#!/usr/bin/env python3
from __future__ import annotations

import difflib
import html
import json
import os
import pathlib
import re
import time
import urllib.parse
import urllib.request

LIVE_THEME_ID = 141308166203
URL_PATH = '/collections/dining-tables'
TEMPLATE_KEY = 'templates/collection.special-prices.json'
BACKUP = pathlib.Path('/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_130327_live_dining_collection_ctr_batch_141308166203')
BACKUP.mkdir(parents=True, exist_ok=True)

EXPECTED = {
    'title': 'Dining Tables NZ | Custom Timber Tables Made to Order | Innate',
    'description': 'Custom dining tables made in Christchurch from solid NZ timber. Browse round, oval and rectangular styles, choose size, timber and base, then ask for a quote. NZ-wide delivery.',
    'h1': 'Dining tables made to order',
    'subhead': 'Made in Christchurch from traceable NZ timber and delivered NZ-wide, each table is sized around your room, seating and daily use.',
    'copy_1': 'Browse round, oval, rectangular and custom dining table styles, then choose the size, timber, colour, finish and base that suits your room.',
    'copy_2': 'We work with New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or send a rough table brief for a custom dining table made to fit your space.',
    'hero_cta': 'Start a table quote',
    'proof_lead_time_title': '6-8 week lead time',
    'lower_heading': 'Start with a rough table brief.',
    'lower_form_heading': 'Start with a rough table brief.',
    'lower_cta': 'Send my table quote',
    'lead_time_faq': 'Current dining-table lead time is 6-8 weeks. If you have a deadline, let us know early and we’ll tell you what is realistic.',
}

OLD = {
    'subhead': 'Made in our Christchurch workshop from traceable NZ timber, each table is sized around your room, seating and daily use.',
    'copy_1': 'Choose the size, shape, timber, colour, finish and base that suits your room and the way you use it.',
    'copy_2': 'We work with premium New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or get in touch if you need a custom dining table made to fit your space.',
    'hero_cta': 'Start a dining table enquiry',
    'proof_lead_time_title': '6 week lead time',
    'lower_heading': 'Start with what you know',
    'lower_cta': 'Send enquiry',
    'lead_time_faq': 'Current dining-table lead time is 6 weeks. If you have a deadline, let us know early and we’ll tell you what is realistic.',
}

for envp in [
    '/Users/mack-mini/.hermes/profiles/website/.env',
    '/Users/mack-mini/.env',
    '/Users/mack-mini/.hermes/.env',
]:
    p = pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

store = (os.environ.get('SHOPIFY_STORE') or '').replace('https://', '').rstrip('/')
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
    url = 'https://innatefurniture.co.nz' + path + '?dining_active_template_verify=' + str(int(time.time()))
    r = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
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
        'serverTiming': server,
        'themeOk': f'theme;desc="{LIVE_THEME_ID}"' in server or f'theme;desc={LIVE_THEME_ID}' in server,
        'title': clean_text(mt.group(1)) if mt else None,
        'description': html.unescape(md.group(2).strip()) if md else None,
        'h1': h1,
        'expected_contains': {k: (v in body or v in raw) for k, v in EXPECTED.items() if k not in ['title', 'description']},
        'old_visible_contains': {k: (v in body or v in raw) for k, v in OLD.items()},
    }


before = get_asset(TEMPLATE_KEY)
(BACKUP / 'before_active_templates__collection.special-prices.json').write_text(before, encoding='utf-8')
template = json.loads(before)

header = template['sections']['dining_header']['settings']
header['subhead'] = EXPECTED['subhead']
header['copy_1'] = EXPECTED['copy_1']
header['copy_2'] = EXPECTED['copy_2']
header['primary_label'] = EXPECTED['hero_cta']

blocks = template['sections']['dining_header'].get('blocks', {})
for block in blocks.values():
    settings = block.get('settings', {})
    if settings.get('title') == OLD['proof_lead_time_title']:
        settings['title'] = EXPECTED['proof_lead_time_title']

enquiry = template['sections']['dining_enquiry']['settings']
enquiry['heading'] = EXPECTED['lower_heading']
enquiry['form_heading'] = EXPECTED['lower_form_heading']
enquiry['button_label'] = EXPECTED['lower_cta']

faq_blocks = template['sections']['dining_faqs'].get('blocks', {})
for block in faq_blocks.values():
    settings = block.get('settings', {})
    if settings.get('body') == f"<p>{OLD['lead_time_faq']}</p>":
        settings['body'] = f"<p>{EXPECTED['lead_time_faq']}</p>"

after = json.dumps(template, indent=2, ensure_ascii=False) + '\n'
(BACKUP / 'after_active_templates__collection.special-prices.json').write_text(after, encoding='utf-8')
(BACKUP / 'diff_active_templates__collection.special-prices.json.diff').write_text(
    '\n'.join(difflib.unified_diff(before.splitlines(), after.splitlines(), fromfile=f'before/{TEMPLATE_KEY}', tofile=f'after/{TEMPLATE_KEY}', lineterm='')) + '\n',
    encoding='utf-8',
)

put_asset(TEMPLATE_KEY, after)
readback = get_asset(TEMPLATE_KEY)
readback_ok = json.loads(readback) == json.loads(after)

checks = []
for delay in [2, 20, 60]:
    time.sleep(delay)
    checks.append(public_page(URL_PATH))
    latest = checks[-1]
    if (
        latest['status'] == 200
        and latest['themeOk']
        and latest['title'] == EXPECTED['title']
        and latest['description'] == EXPECTED['description']
        and latest['h1'] == [EXPECTED['h1']]
        and all(latest['expected_contains'].values())
        and not any(latest['old_visible_contains'].values())
    ):
        break

latest = checks[-1]
ok = (
    readback_ok
    and latest['status'] == 200
    and latest['themeOk']
    and latest['title'] == EXPECTED['title']
    and latest['description'] == EXPECTED['description']
    and latest['h1'] == [EXPECTED['h1']]
    and all(latest['expected_contains'].values())
    and not any(latest['old_visible_contains'].values())
)

summary_path = BACKUP / 'summary.json'
summary = json.loads(summary_path.read_text()) if summary_path.exists() else {}
summary.update({
    'ok': ok,
    'active_template_key': TEMPLATE_KEY,
    'active_template_readback_ok': readback_ok,
    'active_template_public_checks': checks,
})
summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not ok:
    raise SystemExit('Active template verification failed')
