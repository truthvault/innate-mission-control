#!/usr/bin/env python3
from __future__ import annotations

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
BACKUP = pathlib.Path('/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_130327_live_dining_collection_ctr_batch_141308166203')
BACKUP.mkdir(parents=True, exist_ok=True)

COLLECTION_KEY = 'snippets/collection.liquid'
MAIN_COLLECTION_KEY = 'sections/main-collection.liquid'
ASSET_KEYS = [COLLECTION_KEY, MAIN_COLLECTION_KEY]

EXPECTED = {
    'title': 'Dining Tables NZ | Custom Timber Tables Made to Order | Innate',
    'description': 'Custom dining tables made in Christchurch from solid NZ timber. Browse round, oval and rectangular styles, choose size, timber and base, then ask for a quote. NZ-wide delivery.',
    'h1': 'Dining tables made to order',
    'subhead': 'Made in Christchurch from traceable NZ timber and delivered NZ-wide, each table is sized around your room, seating and daily use.',
    'copy_1': 'Browse round, oval, rectangular and custom dining table styles, then choose the size, timber, colour, finish and base that suits your room.',
    'copy_2': 'We work with New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or send a rough table brief for a custom dining table made to fit your space.',
    'hero_cta': 'Start a table quote',
    'lower_heading': 'Start with a rough table brief.',
    'lower_intro_heading': 'Start with a rough table brief.',
    'lower_text': 'You don’t need a finished spec. Send the rough direction and we’ll help narrow the size, timber, colour, shape and base.',
    'lower_intro_text': 'A rough direction is enough — we’ll help narrow the size, timber, shape and base.',
    'lower_cta': 'Send my table quote',
    'lead_time_schema': 'Current lead time: 6-8 weeks',
    'lead_time_faq': 'Current dining-table lead time is 6-8 weeks. If you have a deadline, let us know early and we’ll tell you what is realistic.',
}

OLD = {
    'subhead': 'Made in our Christchurch workshop from traceable NZ timber, each table is sized around your room, seating and daily use.',
    'copy_1': 'Choose the size, shape, timber, colour, finish and base that suits your room and the way you use it.',
    'copy_2': 'We work with premium New Zealand timbers including West Coast Beech, West Coast Rimu and Northland Tōtara, alongside locally made NZ steel bases where the design calls for it. Order timber samples, visit the showroom by appointment, or get in touch if you need a custom dining table made to fit your space.',
    'hero_cta': 'Start a dining table enquiry',
    'lower_heading': 'Start with what you know',
    'lower_text': 'You don’t need a finished spec. Send the rough direction and we’ll help narrow the size, timber, colour, shape and base.',
    'lower_intro_text': 'A rough direction is enough — we’ll help narrow the size, timber, shape and base.',
    'lower_cta_js': "button.textContent = 'Send enquiry';",
    'lower_cta_button': '<button type="submit" class="d16-btn">Send enquiry</button>',
    'lead_time_schema': 'Current lead time: 6 weeks',
    'lead_time_faq': 'Current dining-table lead time is 6 weeks. If you have a deadline, let us know early and we’ll tell you what is realistic.',
    'lead_time_faq_alt': 'The current custom dining table lead time is around 6 weeks. If timing matters, mention it in your enquiry and we’ll let you know what is realistic.',
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


def public_page(path: str):
    url = 'https://innatefurniture.co.nz' + path + '?dining_ctr_complete_verify=' + str(int(time.time()))
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
        'expected_contains': {k: (v in body or v in raw) for k, v in EXPECTED.items() if k not in ['title', 'description', 'lower_intro_heading', 'lead_time_schema']},
        'old_visible_contains': {
            'subhead': OLD['subhead'] in body or OLD['subhead'] in raw,
            'copy_1': OLD['copy_1'] in body or OLD['copy_1'] in raw,
            'copy_2': OLD['copy_2'] in body or OLD['copy_2'] in raw,
            'hero_cta': OLD['hero_cta'] in body or OLD['hero_cta'] in raw,
            'lead_time_faq': OLD['lead_time_faq'] in body or OLD['lead_time_faq'] in raw,
            'lead_time_faq_alt': OLD['lead_time_faq_alt'] in body or OLD['lead_time_faq_alt'] in raw,
        },
    }


themes = req('GET', '/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} is not main')

before_assets = {key: get_asset(key) for key in ASSET_KEYS}
for key, value in before_assets.items():
    (BACKUP / ('before_complete_' + key.replace('/', '__'))).write_text(value, encoding='utf-8')

collection_after = before_assets[COLLECTION_KEY]
collection_after = patch_once(collection_after, OLD['subhead'], EXPECTED['subhead'], 'visible hero subhead')
collection_after = patch_once(collection_after, OLD['copy_1'], EXPECTED['copy_1'], 'visible hero copy 1')
collection_after = patch_once(collection_after, OLD['copy_2'], EXPECTED['copy_2'], 'visible hero copy 2')
collection_after = patch_once(collection_after, OLD['hero_cta'], EXPECTED['hero_cta'], 'visible hero CTA')
collection_after = patch_once(collection_after, '<h2 class="d16-display">Start with what you know</h2>', f"<h2 class=\"d16-display\">{EXPECTED['lower_heading']}</h2>", 'lower CTA heading')
collection_after = patch_once(collection_after, '<h3>Start with what you know</h3>', f"<h3>{EXPECTED['lower_intro_heading']}</h3>", 'lower form heading')
collection_after = patch_once(collection_after, OLD['lower_cta_js'], "button.textContent = 'Send my table quote';", 'lower form JS button label')
collection_after = patch_once(collection_after, OLD['lower_cta_button'], f"<button type=\"submit\" class=\"d16-btn\">{EXPECTED['lower_cta']}</button>", 'lower form button label')
collection_after = patch_once(collection_after, OLD['lead_time_faq_alt'], EXPECTED['lead_time_faq'], 'dining FAQ lead time fallback')
collection_after = patch_once(collection_after, OLD['lead_time_faq'], EXPECTED['lead_time_faq'], 'dining FAQ lead time')

main_after = patch_once(before_assets[MAIN_COLLECTION_KEY], OLD['lead_time_schema'], EXPECTED['lead_time_schema'], 'main collection lead time default')

after_assets = {
    COLLECTION_KEY: collection_after,
    MAIN_COLLECTION_KEY: main_after,
}

for key, value in after_assets.items():
    (BACKUP / ('after_complete_' + key.replace('/', '__'))).write_text(value, encoding='utf-8')
    diff = '\n'.join(difflib.unified_diff(
        before_assets[key].splitlines(),
        value.splitlines(),
        fromfile=f'before/{key}',
        tofile=f'after/{key}',
        lineterm='',
    ))
    (BACKUP / ('diff_complete_' + key.replace('/', '__') + '.diff')).write_text(diff + '\n', encoding='utf-8')

for key, value in after_assets.items():
    put_asset(key, value)

readbacks = {key: get_asset(key) for key in ASSET_KEYS}
readback_ok = {key: readbacks[key] == after_assets[key] for key in ASSET_KEYS}
if not all(readback_ok.values()):
    raise SystemExit(f'Readback mismatch: {readback_ok}')

time.sleep(2)
after_public = public_page(URL_PATH)
(BACKUP / 'after_public_dining_complete.json').write_text(json.dumps(after_public, indent=2), encoding='utf-8')

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

previous_summary_path = BACKUP / 'summary.json'
previous_summary = json.loads(previous_summary_path.read_text()) if previous_summary_path.exists() else {}
summary = {
    **previous_summary,
    'ok': ok,
    'completed_after_partial_verification': verification,
    'completed_assets_changed': [COLLECTION_KEY, MAIN_COLLECTION_KEY],
    'completed_sha_after': {key: sha(readbacks[key]) for key in ASSET_KEYS},
}
previous_summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not ok:
    raise SystemExit('Completion verification failed')
