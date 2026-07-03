#!/usr/bin/env python3
from __future__ import annotations
import datetime, hashlib, html, json, os, pathlib, re, subprocess, tempfile, time, urllib.parse, urllib.request

LIVE_THEME_ID = 141308166203
TEMPLATE_KEY = 'templates/page.hospitality-furniture.json'
SECTION_KEY = 'sections/page-hospitality-furniture.liquid'
OLD_IMAGE = 'shopify://shop_images/Kokomo.heic'
NEW_FILENAME = 'Kokomo-hospitality-hero.jpg'
NEW_IMAGE = f'shopify://shop_images/{NEW_FILENAME}'
SOURCE_IMAGE_URL = 'https://innatefurniture.co.nz/cdn/shop/files/Kokomo.heic?v=1698195654&width=2400'
OLD_COPY = 'Natural materials are not maintenance-free, so we set clear care expectations before anything is built.'
NEW_COPY = 'Natural materials need normal care, so we set clear expectations before anything is built.'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_hospitality_option2_live_{LIVE_THEME_ID}')
EVIDENCE = pathlib.Path(f'/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/hospitality-option2-live-{STAMP}')
for p in (BACKUP, EVIDENCE): p.mkdir(parents=True, exist_ok=True)

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
REST_BASE = f'https://{store}/admin/api/2025-01'
GQL_URL = f'{REST_BASE}/graphql.json'
HEADERS = {'X-Shopify-Access-Token': token, 'Content-Type': 'application/json'}

def req(method: str, path: str, data=None):
    body = None if data is None else json.dumps(data).encode()
    request = urllib.request.Request(REST_BASE + path, data=body, headers=HEADERS, method=method)
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read().decode()
        return json.loads(raw) if raw else {}

def gql(query: str, variables: dict | None = None):
    request = urllib.request.Request(GQL_URL, data=json.dumps({'query': query, 'variables': variables or {}}).encode(), headers=HEADERS, method='POST')
    with urllib.request.urlopen(request, timeout=90) as response:
        out = json.loads(response.read().decode())
    if out.get('errors'):
        raise RuntimeError(json.dumps(out['errors'], indent=2))
    return out

def get_asset(theme_id: int, key: str) -> str:
    q = urllib.parse.urlencode({'asset[key]': key})
    return req('GET', f'/themes/{theme_id}/assets.json?{q}')['asset']['value']

def put_asset(theme_id: int, key: str, value: str):
    return req('PUT', f'/themes/{theme_id}/assets.json', {'asset': {'key': key, 'value': value}})

def query_file(filename: str):
    q = '''query($query:String!){ files(first:10, query:$query){ edges{ node{ id alt createdAt fileStatus ... on MediaImage { image{ url width height } } } } } }'''
    return gql(q, {'query': f'filename:{filename}'})['data']['files']['edges']

def ensure_file() -> dict:
    existing = query_file(NEW_FILENAME)
    if existing:
        return {'created': False, 'node': existing[0]['node']}

    # Download Shopify's transformed JPEG rendition of the current HEIC image, then upload it
    # as a Shopify Files JPG via staged upload. This avoids File API's extension mismatch
    # rejection when originalSource ends in .heic but the desired permanent filename is .jpg.
    tmp = pathlib.Path(tempfile.gettempdir()) / NEW_FILENAME
    request = urllib.request.Request(SOURCE_IMAGE_URL, headers={'User-Agent': 'Mozilla/5.0 hospitality-option2-upload'})
    with urllib.request.urlopen(request, timeout=90) as resp:
        data = resp.read()
        ctype = resp.headers.get('content-type', '')
    if not data or 'image' not in ctype:
        raise RuntimeError(f'Could not fetch JPEG source image, content-type={ctype!r}, bytes={len(data)}')
    tmp.write_bytes(data)
    (BACKUP / NEW_FILENAME).write_bytes(data)

    staged_q = '''mutation($input:[StagedUploadInput!]!){ stagedUploadsCreate(input:$input){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ field message } } }'''
    staged_vars = {'input': [{'filename': NEW_FILENAME, 'mimeType': 'image/jpeg', 'httpMethod': 'POST', 'resource': 'FILE'}]}
    staged = gql(staged_q, staged_vars)['data']['stagedUploadsCreate']
    if staged.get('userErrors'):
        raise RuntimeError('stagedUploadsCreate errors: ' + json.dumps(staged['userErrors'], indent=2))
    target = staged['stagedTargets'][0]
    cmd = ['curl', '-fsS', '-X', 'POST', target['url']]
    for param in target['parameters']:
        cmd.extend(['-F', f"{param['name']}={param['value']}"])
    cmd.extend(['-F', f'file=@{tmp};type=image/jpeg'])
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    m = '''mutation($files:[FileCreateInput!]!){ fileCreate(files:$files){ files{ id alt createdAt fileStatus ... on MediaImage { image{ url width height } } } userErrors{ field message code } } }'''
    variables = {'files': [{
        'originalSource': target['resourceUrl'],
        'contentType': 'IMAGE',
        'filename': NEW_FILENAME,
        'alt': 'Restaurant seating area with dark tables, chairs, benches and pendant light'
    }]}
    out = gql(m, variables)['data']['fileCreate']
    if out.get('userErrors'):
        raise RuntimeError('fileCreate errors: ' + json.dumps(out['userErrors'], indent=2))
    node = out['files'][0]
    # Poll until READY/image URL appears.
    for _ in range(30):
        edges = query_file(NEW_FILENAME)
        if edges:
            node = edges[0]['node']
            if node.get('fileStatus') == 'READY' and node.get('image', {}).get('url'):
                return {'created': True, 'node': node}
        time.sleep(2)
    return {'created': True, 'node': node, 'warning': 'file did not report READY before timeout'}

def head(url: str) -> dict:
    r = urllib.request.Request(url, method='HEAD', headers={'User-Agent':'Mozilla/5.0 hospitality-option2-check'})
    with urllib.request.urlopen(r, timeout=40) as resp:
        return {'url': url, 'status': resp.status, 'content_type': resp.headers.get('content-type'), 'content_length': resp.headers.get('content-length')}

themes = req('GET','/themes.json')['themes']
live = next((t for t in themes if int(t['id']) == LIVE_THEME_ID), None)
if not live or live.get('role') != 'main':
    raise SystemExit(f'Live theme {LIVE_THEME_ID} missing or not main')

template_before = get_asset(LIVE_THEME_ID, TEMPLATE_KEY)
section_before = get_asset(LIVE_THEME_ID, SECTION_KEY)
(BACKUP / 'page.hospitality-furniture.before.json').write_text(template_before, encoding='utf-8')
(BACKUP / 'page-hospitality-furniture.before.liquid').write_text(section_before, encoding='utf-8')

file_info = ensure_file()
(BACKUP / 'created_or_selected_file.json').write_text(json.dumps(file_info, indent=2), encoding='utf-8')

template = json.loads(template_before)
settings = template['sections']['hospitality_furniture']['settings']
if settings.get('hero_image') != OLD_IMAGE and settings.get('hero_image') != NEW_IMAGE:
    raise SystemExit(f"Unexpected current hero_image: {settings.get('hero_image')}")
settings['hero_image'] = NEW_IMAGE
template_after = json.dumps(template, ensure_ascii=False, indent=2) + '\n'
if OLD_COPY in section_before:
    section_after = section_before.replace(OLD_COPY, NEW_COPY, 1)
elif NEW_COPY in section_before:
    section_after = section_before
else:
    raise SystemExit('Neither old nor new copy sentence found exactly')

put_asset(LIVE_THEME_ID, TEMPLATE_KEY, template_after)
put_asset(LIVE_THEME_ID, SECTION_KEY, section_after)
read_template = get_asset(LIVE_THEME_ID, TEMPLATE_KEY)
read_section = get_asset(LIVE_THEME_ID, SECTION_KEY)
(BACKUP / 'page.hospitality-furniture.after.json').write_text(template_after, encoding='utf-8')
(BACKUP / 'page-hospitality-furniture.after.liquid').write_text(section_after, encoding='utf-8')
(BACKUP / 'page.hospitality-furniture.readback.json').write_text(read_template, encoding='utf-8')
(BACKUP / 'page-hospitality-furniture.readback.liquid').write_text(read_section, encoding='utf-8')

# Raw public verification
cb = int(time.time())
page_url = f'https://innatefurniture.co.nz/pages/hospitality-furniture?option2_verify={cb}'
request = urllib.request.Request(page_url, headers={'User-Agent':'Mozilla/5.0 hospitality-option2-check', 'Cache-Control':'no-cache'})
with urllib.request.urlopen(request, timeout=90) as resp:
    raw = resp.read().decode('utf-8', errors='replace')
    server_timing = resp.headers.get('server-timing','')
    final_url = resp.geturl(); status = resp.status
(EVIDENCE / 'raw-public.html').write_text(raw, encoding='utf-8')
new_file_url_matches = sorted(set(re.findall(r'(?:https?:)?//[^"\']*Kokomo-hospitality-hero\.jpg[^"\']*', raw)))
# Normalize protocol-relative URLs for HEAD
head_urls = []
for u in new_file_url_matches[:8]:
    head_urls.append('https:' + u if u.startswith('//') else u)
# also key existing images
for needle in ['innate-commercial-gin-gin-new-regent.jpg']:
    m = re.search(r'(https?:)?//[^"\']*' + re.escape(needle) + r'[^"\']*', raw)
    if m:
        u = m.group(0); head_urls.append('https:' + u if u.startswith('//') else u)
image_heads = []
for u in sorted(set(head_urls)):
    try: image_heads.append(head(u))
    except Exception as e: image_heads.append({'url': u, 'error': str(e)})
summary = {
    'ok': (
        json.loads(read_template)['sections']['hospitality_furniture']['settings'].get('hero_image') == NEW_IMAGE and
        NEW_COPY in read_section and OLD_COPY not in read_section and
        'Kokomo-hospitality-hero.jpg' in raw and 'Kokomo.heic' not in raw and
        'maintenance-free' not in raw and NEW_COPY in raw and
        all(x.get('status') == 200 and x.get('content_type','').startswith('image/') for x in image_heads if 'Kokomo-hospitality-hero.jpg' in x.get('url',''))
    ),
    'live_theme_id': LIVE_THEME_ID,
    'live_theme_role': live.get('role'),
    'live_theme_name': live.get('name'),
    'template_key': TEMPLATE_KEY,
    'section_key': SECTION_KEY,
    'backup': str(BACKUP),
    'evidence': str(EVIDENCE),
    'file_created': file_info.get('created'),
    'file_status': file_info.get('node',{}).get('fileStatus'),
    'file_image_url': file_info.get('node',{}).get('image',{}).get('url'),
    'old_image': OLD_IMAGE,
    'new_image': NEW_IMAGE,
    'readback_template_sha256': hashlib.sha256(read_template.encode()).hexdigest(),
    'readback_section_sha256': hashlib.sha256(read_section.encode()).hexdigest(),
    'raw_status': status,
    'raw_final_url': final_url,
    'raw_server_timing': server_timing,
    'raw_counts': {
        'Kokomo.heic': raw.count('Kokomo.heic'),
        'Kokomo-hospitality-hero.jpg': raw.count('Kokomo-hospitality-hero.jpg'),
        'maintenance-free': raw.count('maintenance-free'),
        'new_copy': raw.count(NEW_COPY),
    },
    'image_heads': image_heads,
    'changed': {
        'template_hero_image': True,
        'section_wording': True,
        'products_prices_checkout_navigation': False
    }
}
(EVIDENCE / 'implementation-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not summary['ok']:
    raise SystemExit('Implementation verification failed; see summary')
