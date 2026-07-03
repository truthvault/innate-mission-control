#!/usr/bin/env python3
from __future__ import annotations
import datetime, html, json, os, pathlib, re, time, urllib.parse, urllib.request

API_VERSION = '2025-01'
LIVE_THEME_ID = '141308166203'
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP_DIR = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-products/{STAMP}_bar_leaner_ctr_batch')
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token:
    raise SystemExit('Missing Shopify env')
BASE=f'https://{store}/admin/api/{API_VERSION}'
HEADERS={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
PUBLIC_BASE='https://innatefurniture.co.nz'

APPROVED = {
    'bar-leaner': {
        'title': None,
        'seo_title': 'Bar Leaner NZ | Custom Timber & Steel | Innate',
        'seo_description': 'Custom timber and steel bar leaner made in Christchurch for homes, offices, cafés and shared spaces. Choose timber, length and finish. NZ-wide delivery.',
        'body_html': '''<p>A made-to-order timber and steel bar leaner for homes, office kitchens, clubrooms, cafés and shared hospitality spaces. Choose the timber, length and finish, or talk to us about custom dimensions for your room or project.</p>

<h3>Details</h3>
<ul>
  <li><strong>Timber:</strong> choose from West Coast Rimu, Northland Tōtara or West Coast Beech.</li>
  <li><strong>Length options:</strong> 180, 200, 220, 240, 260, 280 and 300 cm.</li>
  <li><strong>Size in images:</strong> 220 x 80 x 105 cm.</li>
  <li><strong>Frame:</strong> powdercoated steel, black as standard, with other colours available on request.</li>
  <li><strong>Custom options:</strong> length, width, height, timber colour, finish and steel colour can be discussed before production.</li>
</ul>

<p><a href="/collections/home-living/products/product-sample">Order timber samples</a> or <a href="/pages/contact">contact us</a> if you need a bar leaner made to a specific size.</p>'''
    },
    'exterior-bar-leaner': {
        'title': 'Outdoor Hardwood Bar Leaner',
        'seo_title': 'Outdoor Bar Leaner NZ | Hardwood & Steel | Innate',
        'seo_description': 'Outdoor hardwood bar leaner made to order for patios, cafés, clubrooms and covered outdoor spaces. Custom sizes, steel frame and NZ-wide delivery.',
        'body_html': '''<p>A made-to-order outdoor hardwood and steel bar leaner for patios, hospitality areas, clubrooms, courtyards and covered outdoor spaces. The hardwood top brings natural warmth, while the steel frame gives the leaner strength and a clean architectural look.</p>

<p>Each bar leaner can be customised to suit your space, including the length, width, height, timber layout, steel finish and edge detailing. For commercial projects, we can also make matching stools, dining tables and outdoor furniture packages.</p>

<h3>Features</h3>
<ul>
  <li><strong>Made for outdoor use:</strong> hardwood timber top with a robust steel frame for outdoor and semi-outdoor areas.</li>
  <li><strong>Custom sizing:</strong> available in almost any length, width and height.</li>
  <li><strong>Commercial suitable:</strong> a strong option for hospitality, bars, clubs, offices and shared outdoor areas.</li>
  <li><strong>Optional tray edge detail:</strong> add a black steel tray edge for a more framed look and to hide the ends of the timber boards.</li>
  <li><strong>Custom finishes:</strong> timber colour, steel colour and detailing can be tailored to your project.</li>
</ul>

<p>Outdoor timber is a natural material and will require normal care and maintenance, especially in exposed or high-use environments. If low maintenance is the main priority, ask us about porcelain outdoor top options.</p>

<p><strong>Size in images</strong><br>Table: 200 x 80 x 105 cm</p>

<p>Hardwood runs lengthways unless otherwise requested.</p>

<p><a href="/pages/contact">Contact us to order a free hardwood timber sample.</a></p>'''
    }
}

def api(path, method='GET', payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(BASE+path, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=90) as resp:
        body=resp.read().decode('utf-8')
        return json.loads(body) if body else {}

def get_product(handle):
    qs=urllib.parse.urlencode({'handle':handle})
    products=api('/products.json?'+qs).get('products',[])
    if not products: raise RuntimeError(f'Product not found: {handle}')
    p=products[0]
    p['metafields']=api(f'/products/{p["id"]}/metafields.json?limit=250').get('metafields',[])
    return p

def set_metafield(product_id, current_mfs, key, value):
    existing = next((m for m in current_mfs if m.get('namespace')=='global' and m.get('key')==key), None)
    payload={'metafield': {'namespace':'global','key':key,'value':value,'type':'single_line_text_field'}}
    if existing:
        return api(f'/metafields/{existing["id"]}.json', 'PUT', payload)
    return api(f'/products/{product_id}/metafields.json', 'POST', payload)

def public_html(handle):
    url=f'{PUBLIC_BASE}/products/{handle}?bar_leaner_verify={int(time.time())}'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw=resp.read().decode('utf-8','replace')
        return resp.status, resp.headers, raw

def product_js(handle):
    url=f'{PUBLIC_BASE}/products/{handle}.js?bar_leaner_verify={int(time.time())}'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode('utf-8','replace'))

def norm_text(raw):
    return re.sub(r'\s+',' ', html.unescape(re.sub('<[^>]+>',' ',raw))).strip()

before = {}
for handle in APPROVED:
    p=get_product(handle)
    before[handle]=p
    (BACKUP_DIR/f'before_{handle}_product_full.json').write_text(json.dumps(p, indent=2), encoding='utf-8')
(BACKUP_DIR/'approved_payload.json').write_text(json.dumps(APPROVED, indent=2), encoding='utf-8')

# Apply scoped changes only: product title/body_html and global title_tag/description_tag metafields.
for handle, change in APPROVED.items():
    p=before[handle]
    product_payload={'id': p['id'], 'body_html': change['body_html']}
    if change['title']:
        product_payload['title']=change['title']
    api(f'/products/{p["id"]}.json', 'PUT', {'product': product_payload})
    current_mfs=get_product(handle)['metafields']
    set_metafield(p['id'], current_mfs, 'title_tag', change['seo_title'])
    current_mfs=get_product(handle)['metafields']
    set_metafield(p['id'], current_mfs, 'description_tag', change['seo_description'])

verification = {'backup_dir': str(BACKUP_DIR), 'theme_id_required': LIVE_THEME_ID, 'products': {}}
for handle, change in APPROVED.items():
    p=get_product(handle)
    (BACKUP_DIR/f'after_{handle}_product_full.json').write_text(json.dumps(p, indent=2), encoding='utf-8')
    mfs = {(m.get('namespace'),m.get('key')): m.get('value') for m in p.get('metafields',[])}
    status, headers, raw = public_html(handle)
    js = product_js(handle)
    title_match=re.search(r'<title>(.*?)</title>', raw, re.S|re.I)
    page_title=html.unescape(re.sub(r'\s+',' ',title_match.group(1)).strip()) if title_match else ''
    desc_match=re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=(["\'])(.*?)\1', raw, re.S|re.I)
    page_desc=html.unescape(desc_match.group(2).strip()) if desc_match else ''
    h1_match=re.search(r'<h1[^>]*>(.*?)</h1>', raw, re.S|re.I)
    h1=html.unescape(re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',h1_match.group(1))).strip()) if h1_match else ''
    server_timing=headers.get('server-timing','')
    text=norm_text(raw)
    expected_phrases = [change['seo_title'], change['seo_description']]
    if handle == 'bar-leaner':
        expected_phrases += ['A made-to-order timber and steel bar leaner for homes, office kitchens, clubrooms, cafés and shared hospitality spaces', 'Order timber samples']
    else:
        expected_phrases += ['Outdoor Hardwood Bar Leaner', 'A made-to-order outdoor hardwood and steel bar leaner for patios', 'Outdoor timber is a natural material and will require normal care and maintenance']
    checks = {
        'admin_body_exact': p.get('body_html') == change['body_html'],
        'admin_title_expected': (not change['title']) or p.get('title') == change['title'],
        'admin_seo_title_exact': mfs.get(('global','title_tag')) == change['seo_title'],
        'admin_seo_description_exact': mfs.get(('global','description_tag')) == change['seo_description'],
        'public_status_200': status == 200,
        'public_theme_header_has_live_theme': LIVE_THEME_ID in server_timing,
        'public_title_exact': page_title == change['seo_title'],
        'public_description_exact': page_desc == change['seo_description'],
        'public_expected_phrases_present': all((phrase in raw or phrase in text or html.escape(phrase) in raw) for phrase in expected_phrases),
        'product_js_title_expected': (not change['title']) or js.get('title') == change['title'],
        'product_js_description_phrase_present': ('made-to-order' in norm_text(js.get('description',''))),
    }
    verification['products'][handle]={
        'url': f'{PUBLIC_BASE}/products/{handle}',
        'product_id': p['id'],
        'status': p.get('status'),
        'admin_title': p.get('title'),
        'public_title': page_title,
        'public_description': page_desc,
        'public_h1': h1,
        'checks': checks,
    }
    if not all(checks.values()):
        raise SystemExit(f'Verification failed for {handle}: '+json.dumps(checks,indent=2))

(BACKUP_DIR/'verification.json').write_text(json.dumps(verification, indent=2), encoding='utf-8')
print(json.dumps(verification, indent=2))
