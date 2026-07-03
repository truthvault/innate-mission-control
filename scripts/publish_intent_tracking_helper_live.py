#!/usr/bin/env python3
from __future__ import annotations
import datetime, hashlib, json, os, pathlib, urllib.parse, urllib.request

LIVE_THEME_ID = 141308166203
PREVIEW_THEME_ID = 141408796731
ASSET_KEY = 'assets/innate-intent-tracking.js'
LAYOUT_KEY = 'layout/theme.liquid'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_intent_tracking_helper_{LIVE_THEME_ID}')
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
    raise SystemExit('Missing Shopify store/token environment')
base = f'https://{store}/admin/api/2025-01'
headers = {'X-Shopify-Access-Token': token, 'Content-Type': 'application/json'}

def req(method: str, path: str, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}

def get_asset(theme_id: int, key: str, missing_ok=False) -> str:
    q = urllib.parse.urlencode({'asset[key]': key})
    try:
        return req('GET', f'/themes/{theme_id}/assets.json?{q}')['asset']['value']
    except Exception:
        if missing_ok:
            return ''
        raise

def put_asset(theme_id: int, key: str, value: str):
    return req('PUT', f'/themes/{theme_id}/assets.json', {'asset': {'key': key, 'value': value}})

themes = req('GET', '/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
preview = next((t for t in themes if int(t['id']) == PREVIEW_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} missing or not main')
if not preview or preview.get('role') == 'main':
    raise SystemExit(f'Preview theme {PREVIEW_THEME_ID} missing or unsafe role')

preview_helper = get_asset(PREVIEW_THEME_ID, ASSET_KEY)
live_layout_before = get_asset(LIVE_THEME_ID, LAYOUT_KEY)
live_helper_before = get_asset(LIVE_THEME_ID, ASSET_KEY, missing_ok=True)
(BACKUP / 'before_theme.liquid').write_text(live_layout_before, encoding='utf-8')
(BACKUP / 'before_innate-intent-tracking.js').write_text(live_helper_before, encoding='utf-8')
(BACKUP / 'source_preview_innate-intent-tracking.js').write_text(preview_helper, encoding='utf-8')

include = "{{ 'innate-intent-tracking.js' | asset_url | script_tag }}"
if include not in live_layout_before:
    marker = '</body>'
    if marker not in live_layout_before:
        raise SystemExit('Could not find </body> in live layout')
    live_layout_after = live_layout_before.replace(marker, '  ' + include + '\n' + marker, 1)
else:
    live_layout_after = live_layout_before

put_asset(LIVE_THEME_ID, ASSET_KEY, preview_helper)
put_asset(LIVE_THEME_ID, LAYOUT_KEY, live_layout_after)
read_helper = get_asset(LIVE_THEME_ID, ASSET_KEY)
read_layout = get_asset(LIVE_THEME_ID, LAYOUT_KEY)
(BACKUP / 'after_theme.liquid').write_text(live_layout_after, encoding='utf-8')
(BACKUP / 'readback_theme.liquid').write_text(read_layout, encoding='utf-8')
(BACKUP / 'readback_innate-intent-tracking.js').write_text(read_helper, encoding='utf-8')
markers = ['innateIntentTrack', 'clarity', 'page_context_view', 'product_variant_selected', 'contact_enquiry_started', 'collection_filter_used', 'timber_swatch_selected']
missing = [m for m in markers if m not in read_helper]
print(json.dumps({
    'ok': not missing and include in read_layout and read_helper == preview_helper,
    'live_theme_id': LIVE_THEME_ID,
    'live_theme_name': live.get('name'),
    'live_theme_role': live.get('role'),
    'preview_theme_id': PREVIEW_THEME_ID,
    'asset': ASSET_KEY,
    'layout': LAYOUT_KEY,
    'backup': str(BACKUP),
    'asset_sha256': hashlib.sha256(read_helper.encode()).hexdigest(),
    'matches_preview_asset': read_helper == preview_helper,
    'include_present': include in read_layout,
    'layout_changed': live_layout_after != live_layout_before,
    'had_existing_live_helper_asset': bool(live_helper_before),
    'missing_markers': missing
}, indent=2))
