#!/usr/bin/env python3
from __future__ import annotations

import datetime
import html
import json
import os
import pathlib
import re
import time
import urllib.parse
import urllib.request

COLLECTION_ID = 288648855611
HANDLE = 'dining-tables'
LIVE_THEME_ID = 141308166203
URL_PATH = '/collections/dining-tables'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_dining_collection_admin_body_{COLLECTION_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

EXPECTED_BODY_HTML = '''<h3>Custom dining tables made to order</h3>
<p>Made in Christchurch from traceable NZ timber and delivered NZ-wide, each table starts with your room, seating and daily use.</p>
<p>Browse round, oval, rectangular and custom dining table styles, then choose the size, timber, colour, finish and base that suits your room.</p>
<p>Order timber samples, visit the showroom by appointment, or send a rough table brief for a custom dining table made to fit your space.</p>'''

EXPECTED_PUBLIC = {
    'title': 'Dining Tables NZ | Custom Timber Tables Made to Order | Innate',
    'description': 'Custom dining tables made in Christchurch from solid NZ timber. Browse round, oval and rectangular styles, choose size, timber and base, then ask for a quote. NZ-wide delivery.',
    'h1': 'Dining tables made to order',
    'subhead': 'Made in Christchurch from traceable NZ timber and delivered NZ-wide, each table is sized around your room, seating and daily use.',
    'copy_1': 'Browse round, oval, rectangular and custom dining table styles, then choose the size, timber, colour, finish and base that suits your room.',
    'copy_2': 'We work with New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or send a rough table brief for a custom dining table made to fit your space.',
    'hero_cta': 'Start a table quote',
    'lead_time_faq': 'Current dining-table lead time is 6-8 weeks. If you have a deadline, let us know early and we’ll tell you what is realistic.',
}

OLD_PUBLIC = {
    'subhead': 'Made in our Christchurch workshop from traceable NZ timber, each table is sized around your room, seating and daily use.',
    'copy_1': 'Choose the size, shape, timber, colour, finish and base that suits your room and the way you use it.',
    'copy_2': 'We work with premium New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or get in touch if you need a custom dining table made to fit your space.',
    'hero_cta': 'Start a dining table enquiry',
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


def clean_text(s: str) -> str:
    s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()


def public_page(path: str):
    url = 'https://innatefurniture.co.nz' + path + '?dining_admin_verify=' + str(int(time.time()))
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
        'expected_contains': {k: (v in body or v in raw) for k, v in EXPECTED_PUBLIC.items() if k not in ['title', 'description']},
        'old_visible_contains': {k: (v in body or v in raw) for k, v in OLD_PUBLIC.items()},
        'body_excerpt': body[:2500],
    }


before = req('GET', f'/custom_collections/{COLLECTION_ID}.json')['custom_collection']
if before.get('handle') != HANDLE:
    raise SystemExit(f'Unexpected collection handle: {before.get("handle")}')
(BACKUP / 'before_collection_record.json').write_text(json.dumps(before, indent=2), encoding='utf-8')
(BACKUP / 'before_body_html.html').write_text(before.get('body_html') or '', encoding='utf-8')

payload = {
    'custom_collection': {
        'id': COLLECTION_ID,
        'body_html': EXPECTED_BODY_HTML,
    }
}
updated = req('PUT', f'/custom_collections/{COLLECTION_ID}.json', payload)['custom_collection']
(BACKUP / 'after_collection_record.json').write_text(json.dumps(updated, indent=2), encoding='utf-8')
(BACKUP / 'after_body_html.html').write_text(updated.get('body_html') or '', encoding='utf-8')

readback = req('GET', f'/custom_collections/{COLLECTION_ID}.json')['custom_collection']
readback_ok = (readback.get('body_html') or '').strip() == EXPECTED_BODY_HTML.strip()

public_checks = []
for delay in [2, 20, 60]:
    time.sleep(delay)
    public_checks.append(public_page(URL_PATH))
    latest = public_checks[-1]
    if (
        latest['status'] == 200
        and latest['themeOk']
        and latest['title'] == EXPECTED_PUBLIC['title']
        and latest['description'] == EXPECTED_PUBLIC['description']
        and latest['h1'] == [EXPECTED_PUBLIC['h1']]
        and all(latest['expected_contains'].values())
        and not any(latest['old_visible_contains'].values())
    ):
        break

verification = {
    'readback_ok': readback_ok,
    'public_checks': public_checks,
    'latest_public_ok': bool(public_checks) and (
        public_checks[-1]['status'] == 200
        and public_checks[-1]['themeOk']
        and public_checks[-1]['title'] == EXPECTED_PUBLIC['title']
        and public_checks[-1]['description'] == EXPECTED_PUBLIC['description']
        and public_checks[-1]['h1'] == [EXPECTED_PUBLIC['h1']]
        and all(public_checks[-1]['expected_contains'].values())
        and not any(public_checks[-1]['old_visible_contains'].values())
    ),
}
summary = {
    'ok': readback_ok and verification['latest_public_ok'],
    'store': store,
    'collection_id': COLLECTION_ID,
    'handle': HANDLE,
    'backup_dir': str(BACKUP),
    'updated_fields': ['custom_collection.body_html'],
    'verification': verification,
}
(BACKUP / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not summary['ok']:
    raise SystemExit('Collection body updated, but public body cache has not fully refreshed yet')
