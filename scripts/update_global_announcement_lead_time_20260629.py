#!/usr/bin/env python3
from __future__ import annotations

import datetime
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
ASSET_KEY = 'sections/header-group.json'
OLD_TEXT = 'Custom furniture lead time: approx. 6 weeks. Need it sooner? Let us know.'
NEW_TEXT = 'Custom furniture lead time: approx. 6-8 weeks. Need it sooner? Let us know.'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_global_announcement_lead_time_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

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
    url = 'https://innatefurniture.co.nz' + path + '?global_bar_verify=' + str(int(time.time()))
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
    body = clean_text(raw)
    return {
        'path': path,
        'status': status,
        'final': final,
        'themeOk': f'theme;desc="{LIVE_THEME_ID}"' in server or f'theme;desc={LIVE_THEME_ID}' in server,
        'new_text_present': NEW_TEXT in body or NEW_TEXT in raw,
        'old_text_present': OLD_TEXT in body or OLD_TEXT in raw,
    }


themes = req('GET', '/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} is not main')

before = get_asset(ASSET_KEY)
(BACKUP / 'before_header-group.json').write_text(before, encoding='utf-8')
data = json.loads(before)
settings = data['sections']['announcement_bar_Phfawm']['settings']
if settings.get('top_banner_text') != OLD_TEXT:
    raise SystemExit(f"Unexpected current banner text: {settings.get('top_banner_text')!r}")
settings['top_banner_text'] = NEW_TEXT
after = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
(BACKUP / 'after_header-group.json').write_text(after, encoding='utf-8')
(BACKUP / 'diff_header-group.json.diff').write_text(
    '\n'.join(difflib.unified_diff(before.splitlines(), after.splitlines(), fromfile='before/header-group.json', tofile='after/header-group.json', lineterm='')) + '\n',
    encoding='utf-8',
)

put_asset(ASSET_KEY, after)
readback = get_asset(ASSET_KEY)
readback_ok = json.loads(readback) == json.loads(after)

checks = []
for path in ['/', '/collections/dining-tables', '/pages/hospitality-furniture']:
    checks.append(public_page(path))

ok = readback_ok and all(c['status'] == 200 and c['themeOk'] and c['new_text_present'] and not c['old_text_present'] for c in checks)
summary = {
    'ok': ok,
    'theme_id': LIVE_THEME_ID,
    'theme_role': live.get('role'),
    'asset_changed': ASSET_KEY,
    'old_text': OLD_TEXT,
    'new_text': NEW_TEXT,
    'backup_dir': str(BACKUP),
    'readback_ok': readback_ok,
    'public_checks': checks,
}
(BACKUP / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not ok:
    raise SystemExit('Verification failed')
