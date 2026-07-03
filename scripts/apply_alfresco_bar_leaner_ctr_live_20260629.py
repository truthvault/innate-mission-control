#!/usr/bin/env python3
from __future__ import annotations
import datetime, html, json, os, pathlib, re, time, urllib.parse, urllib.request

API_VERSION='2025-01'
LIVE_THEME_ID='141308166203'
HANDLE='alfresco-bar-leaner'
PUBLIC_BASE='https://innatefurniture.co.nz'
STAMP=datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP_DIR=pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-products/{STAMP}_alfresco_bar_leaner_ctr')
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

APPROVED={
    'title': 'Alfresco Bar Leaner',
    'seo_title': 'Alfresco Bar Leaner NZ | Porcelain & Steel | Innate',
    'seo_description': 'Porcelain and steel outdoor bar leaner made in Christchurch for patios, courtyards and hospitality spaces. Lower-care surface, custom sizes and NZ-wide delivery.',
}

# Keep the existing approved body copy because Admin already contains the Alfresco-specific porcelain/steel outdoor copy.


def api(path, method='GET', payload=None):
    data=json.dumps(payload).encode('utf-8') if payload is not None else None
    req=urllib.request.Request(BASE+path, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=90) as resp:
        body=resp.read().decode('utf-8')
        return json.loads(body) if body else {}

def get_product():
    qs=urllib.parse.urlencode({'handle':HANDLE})
    products=api('/products.json?'+qs).get('products',[])
    if not products:
        raise RuntimeError(f'Product not found: {HANDLE}')
    p=products[0]
    p['metafields']=api(f'/products/{p["id"]}/metafields.json?limit=250').get('metafields',[])
    return p

def set_metafield(product_id, current_mfs, key, value):
    existing=next((m for m in current_mfs if m.get('namespace')=='global' and m.get('key')==key), None)
    payload={'metafield': {'namespace':'global','key':key,'value':value,'type':'single_line_text_field'}}
    if existing:
        return api(f'/metafields/{existing["id"]}.json','PUT',payload)
    return api(f'/products/{product_id}/metafields.json','POST',payload)

def fetch_public(path):
    url=f'{PUBLIC_BASE}{path}?alfresco_verify={int(time.time())}'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.status, resp.headers, resp.read().decode('utf-8','replace')

def product_js():
    status, headers, raw = fetch_public(f'/products/{HANDLE}.js')
    return status, headers, json.loads(raw)

def norm(raw):
    return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',raw))).strip()

def page_title(raw):
    m=re.search(r'<title>(.*?)</title>',raw,re.S|re.I)
    return html.unescape(re.sub(r'\s+',' ',m.group(1)).strip()) if m else ''

def meta_description(raw):
    for tag in re.findall(r'<meta\b[^>]*>', raw, flags=re.I|re.S):
        if re.search(r'\bname\s*=\s*(["\'])description\1', tag, re.I):
            m=re.search(r'\bcontent\s*=\s*(["\'])(.*?)\1', tag, re.I|re.S)
            return html.unescape(m.group(2)) if m else ''
    return ''

def h1(raw):
    m=re.search(r'<h1[^>]*>(.*?)</h1>',raw,re.S|re.I)
    return html.unescape(re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',m.group(1))).strip()) if m else ''

before=get_product()
(BACKUP_DIR/f'before_{HANDLE}_product_full.json').write_text(json.dumps(before,indent=2),encoding='utf-8')
(BACKUP_DIR/'approved_payload.json').write_text(json.dumps(APPROVED,indent=2),encoding='utf-8')

# Scoped live Admin update: only SEO metafields. Product body/title/prices/variants/images are not changed.
set_metafield(before['id'], before['metafields'], 'title_tag', APPROVED['seo_title'])
fresh=get_product()
set_metafield(before['id'], fresh['metafields'], 'description_tag', APPROVED['seo_description'])

after=get_product()
(BACKUP_DIR/f'after_{HANDLE}_product_full.json').write_text(json.dumps(after,indent=2),encoding='utf-8')
mfs={(m.get('namespace'),m.get('key')):m.get('value') for m in after.get('metafields',[])}
status, headers, raw = fetch_public(f'/products/{HANDLE}')
js_status, js_headers, js = product_js()
text=norm(raw)
js_text=norm(js.get('description',''))
expected_body_phrases=[
    'outdoor porcelain and steel bar leaner',
    'porcelain top gives a refined stone-like look',
    'normal care',
]
checks={
    'admin_title_unchanged': after.get('title') == before.get('title') == APPROVED['title'],
    'admin_body_unchanged': after.get('body_html') == before.get('body_html'),
    'admin_seo_title_exact': mfs.get(('global','title_tag')) == APPROVED['seo_title'],
    'admin_seo_description_exact': mfs.get(('global','description_tag')) == APPROVED['seo_description'],
    'public_status_200': status == 200,
    'public_live_theme_header': LIVE_THEME_ID in headers.get('server-timing',''),
    'public_title_exact': page_title(raw) == APPROVED['seo_title'],
    'public_description_exact': meta_description(raw) == APPROVED['seo_description'],
    'public_body_phrases_present': all(ph in text for ph in expected_body_phrases),
    'product_js_status_200': js_status == 200,
    'product_js_title_expected': js.get('title') == APPROVED['title'],
    'product_js_body_phrases_present': all(ph in js_text for ph in expected_body_phrases),
}
verification={
    'backup_dir': str(BACKUP_DIR),
    'theme_id_required': LIVE_THEME_ID,
    'products': {
        HANDLE: {
            'url': f'{PUBLIC_BASE}/products/{HANDLE}',
            'product_id': after['id'],
            'status': after.get('status'),
            'admin_title': after.get('title'),
            'public_title': page_title(raw),
            'public_description': meta_description(raw),
            'public_h1': h1(raw),
            'checks': checks,
            'changed_scope': ['global.title_tag metafield', 'global.description_tag metafield'],
            'unchanged_scope_verified': ['product title/H1', 'body_html', 'variants', 'prices', 'images'],
        }
    }
}
(BACKUP_DIR/'verification.json').write_text(json.dumps(verification,indent=2),encoding='utf-8')
print(json.dumps(verification,indent=2))
if not all(checks.values()):
    raise SystemExit(1)
