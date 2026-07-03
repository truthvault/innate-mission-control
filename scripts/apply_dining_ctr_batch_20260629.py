#!/usr/bin/env python3
from __future__ import annotations

import datetime
import difflib
import hashlib
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
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_dining_collection_ctr_batch_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)

TITLE_KEY = 'snippets/innate-seo-title-override.liquid'
DESC_KEY = 'snippets/innate-seo-description-override.liquid'
HEADER_KEY = 'sections/innate-dining-header.liquid'
TEMPLATE_KEY = 'templates/collection.dining.json'
ASSET_KEYS = [TITLE_KEY, DESC_KEY, HEADER_KEY, TEMPLATE_KEY]

EXPECTED = {
    'title': 'Dining Tables NZ | Custom Timber Tables Made to Order | Innate',
    'description': 'Custom dining tables made in Christchurch from solid NZ timber. Browse round, oval and rectangular styles, choose size, timber and base, then ask for a quote. NZ-wide delivery.',
    'h1': 'Dining tables made to order',
    'subhead': 'Made in Christchurch from traceable NZ timber and delivered NZ-wide, each table is sized around your room, seating and daily use.',
    'copy_1': 'Browse round, oval, rectangular and custom dining table styles, then choose the size, timber, colour, finish and base that suits your room.',
    'copy_2': 'We work with New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or send a rough table brief for a custom dining table made to fit your space.',
    'hero_cta': 'Start a table quote',
    'lead_time': 'Current lead time: 6-8 weeks',
    'lower_heading': 'Start with a rough table brief.',
    'lower_cta': 'Send my table quote',
}

OLD_VISIBLE = {
    'title': 'Dining Tables NZ | Custom Solid Timber Tables | Innate',
    'description': 'Compare custom dining tables made in Christchurch from solid timber. Choose shape, size, timber, finish and base style, then send us a brief for your room. Delivered NZ-wide.',
    'subhead': 'Made in our Christchurch workshop from traceable NZ timber, each table is sized around your room, seating and daily use.',
    'copy_1': 'Choose the size, shape, timber, colour, finish and base that suits your room and the way you use it.',
    'copy_2': 'We work with premium New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or get in touch if you need a custom dining table made to fit your space.',
    'hero_cta': 'Start a dining table enquiry',
    'lead_time': 'Current lead time: 6 weeks',
    'lower_heading': 'Send us a rough brief.',
    'lower_cta': 'Send my table enquiry',
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


def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def clean_text(s: str) -> str:
    s = re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>', ' ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()


def patch_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        if new in text:
            return text
        raise SystemExit(f'Missing anchor for {label}')
    return text.replace(old, new, 1)


def asset_matches(key: str, expected: str, actual: str) -> bool:
    if key == TEMPLATE_KEY:
        return json.loads(expected) == json.loads(actual)
    return expected == actual


def public_page(path: str):
    url = 'https://innatefurniture.co.nz' + path + '?dining_ctr_verify=' + str(int(time.time()))
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
        'old_visible_contains': {k: (v in body or v in raw) for k, v in OLD_VISIBLE.items() if k not in ['title', 'description']},
        'body_excerpt': body[:2500],
    }


themes = req('GET', '/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} is not main')

before_public = public_page(URL_PATH)
before_assets = {key: get_asset(key) for key in ASSET_KEYS}

(BACKUP / 'before_public_dining.json').write_text(json.dumps(before_public, indent=2), encoding='utf-8')
for key, value in before_assets.items():
    (BACKUP / ('before_' + key.replace('/', '__'))).write_text(value, encoding='utf-8')

title_after = patch_once(
    before_assets[TITLE_KEY],
    "echo 'Dining Tables NZ | Custom Solid Timber Tables | Innate'",
    f"echo '{EXPECTED['title']}'",
    'dining SEO title',
)
desc_after = patch_once(
    before_assets[DESC_KEY],
    "echo 'Compare custom dining tables made in Christchurch from solid timber. Choose shape, size, timber, finish and base style, then send us a brief for your room. Delivered NZ-wide.'",
    f"echo '{EXPECTED['description']}'",
    'dining SEO description',
)

header_after = before_assets[HEADER_KEY]
header_after = patch_once(header_after, OLD_VISIBLE['subhead'], EXPECTED['subhead'], 'dining hero subhead')
header_after = patch_once(header_after, OLD_VISIBLE['copy_1'], EXPECTED['copy_1'], 'dining hero copy 1')
header_after = patch_once(header_after, OLD_VISIBLE['copy_2'], EXPECTED['copy_2'], 'dining hero copy 2')
header_after = patch_once(header_after, OLD_VISIBLE['hero_cta'], EXPECTED['hero_cta'], 'dining hero CTA')

template = json.loads(before_assets[TEMPLATE_KEY])
settings = template['sections']['main-collection']['settings']
settings['dining_proof_3'] = EXPECTED['lead_time']
settings['dining_cta_heading'] = EXPECTED['lower_heading']
settings['dining_form_button'] = EXPECTED['lower_cta']
template_after = json.dumps(template, indent=2, ensure_ascii=False) + '\n'

after_assets = {
    TITLE_KEY: title_after,
    DESC_KEY: desc_after,
    HEADER_KEY: header_after,
    TEMPLATE_KEY: template_after,
}

for key, value in after_assets.items():
    (BACKUP / ('after_' + key.replace('/', '__'))).write_text(value, encoding='utf-8')
    diff = '\n'.join(difflib.unified_diff(
        before_assets[key].splitlines(),
        value.splitlines(),
        fromfile=f'before/{key}',
        tofile=f'after/{key}',
        lineterm='',
    ))
    (BACKUP / ('diff_' + key.replace('/', '__') + '.diff')).write_text(diff + '\n', encoding='utf-8')

for key, value in after_assets.items():
    put_asset(key, value)

readbacks = {key: get_asset(key) for key in ASSET_KEYS}
readback_ok = {key: asset_matches(key, after_assets[key], readbacks[key]) for key in ASSET_KEYS}
if not all(readback_ok.values()):
    raise SystemExit(f'Readback mismatch: {readback_ok}')

time.sleep(2)
after_public = public_page(URL_PATH)
(BACKUP / 'after_public_dining.json').write_text(json.dumps(after_public, indent=2), encoding='utf-8')

verification = {
    'status_ok': after_public['status'] == 200,
    'theme_ok': after_public['themeOk'],
    'title_ok': after_public['title'] == EXPECTED['title'],
    'description_ok': after_public['description'] == EXPECTED['description'],
    'h1_unchanged_ok': after_public['h1'] == [EXPECTED['h1']],
    'expected_contains': after_public['expected_contains'],
    'old_visible_contains': after_public['old_visible_contains'],
    'readback_ok': readback_ok,
}
ok = (
    verification['status_ok']
    and verification['theme_ok']
    and verification['title_ok']
    and verification['description_ok']
    and verification['h1_unchanged_ok']
    and all(verification['expected_contains'].values())
    and not any(verification['old_visible_contains'].values())
    and all(readback_ok.values())
)

summary = {
    'ok': ok,
    'timestamp': STAMP,
    'store': store,
    'theme_id': LIVE_THEME_ID,
    'theme_role': live.get('role'),
    'theme_name': live.get('name'),
    'url_path': URL_PATH,
    'assets_changed': ASSET_KEYS,
    'backup_dir': str(BACKUP),
    'sha_before': {key: sha(before_assets[key]) for key in ASSET_KEYS},
    'sha_after': {key: sha(readbacks[key]) for key in ASSET_KEYS},
    'verification': verification,
    'template_readback_note': 'Shopify Admin readback may escape forward slashes in JSON strings; parsed JSON settings are compared semantically.',
}
(BACKUP / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not ok:
    raise SystemExit('Verification failed')
