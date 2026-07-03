#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, time, urllib.parse, urllib.request, html, re

API_VERSION = '2025-01'
HANDLE = 'west-coast-beech-decking'
STAMP = time.strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-products/{STAMP}_beech_decking_factory_coating_update')
BACKUP.mkdir(parents=True, exist_ok=True)

BODY_HTML = '''<p><strong>West Coast Beech decking, 90 x 19mm</strong></p>

<p>West Coast Red Heart Beech decking is a dense NZ native hardwood decking board with a warm red-brown tone and natural variation. It is a local alternative to imported tropical hardwood decking, supplied in a clean 90 x 19mm pencil-round profile.</p>

<p><strong>Price and ordering</strong><br>
$10.50 per linear metre, incl. GST<br>
Minimum order: 200 linear metres<br>
Nationwide freight available, confirmed before dispatch</p>

<p><strong>Factory oil coating option</strong><br>
This decking is supplied as untreated timber and needs to be oiled on all sides and cut ends before installation. We can supply it raw for your builder or installer to coat on site, or factory-coat it before dispatch with a NZ-made natural exterior oil finish.</p>

<p>Our usual finish for this product is a warm walnut exterior decking and cladding oil from The Natural House Company. Factory oil coating is available for $1.40 per linear metre, incl. GST, and can save significant time on site before the boards are laid.</p>

<p>If you are unsure how many linear metres you need, contact us before ordering and we can help check quantity, finish and freight.</p>

<p><strong>Want to check the colour first?</strong><br>
Order a <a href="https://innatefurniture.co.nz/products/product-sample">West Coast Beech timber sample</a> before committing to a decking order.</p>

<p>If you are comparing Kwila decking, West Coast Beech is a good local option to consider. Kwila is widely used in New Zealand, but it can come with questions around origin, traceability and rainforest logging. We prefer West Coast Beech because it gives customers a durable native hardwood decking option with a shorter, clearer supply chain. You can read more in our guide to <a href="https://innatefurniture.co.nz/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead">what to know before choosing Kwila timber</a>.</p>

<p>Like any natural timber used outdoors, it needs good preparation, stainless fixings, airflow below the deck and normal ongoing care. Suitability, treatment requirements and installation should be checked against the relevant NZ building requirements for the project.</p>

<p><strong>Product details</strong></p>
<ul>
<li><strong>Species:</strong> West Coast Red Heart Beech, Nothofagus spp.</li>
<li><strong>Profile:</strong> 90mm x 19mm decking boards with pencil round edges</li>
<li><strong>Grade:</strong> red heart, selected for colour and density</li>
<li><strong>Timber supply:</strong> untreated native hardwood decking</li>
<li><strong>Coating option:</strong> raw for site coating, or factory-coated in natural exterior oil before dispatch</li>
<li><strong>Use:</strong> native hardwood decking for suitable outdoor deck projects</li>
</ul>

<p><strong>For best results</strong></p>
<ul>
<li>Oil all sides and cut ends before installation.</li>
<li>Use stainless steel screws to avoid tannin staining.</li>
<li>Pre-drill and countersink fixings.</li>
<li>Allow board gaps and good ventilation below the deck.</li>
<li>Clean and re-oil as needed for the site exposure.</li>
</ul>

<p>Deck design, compliance and installation are the responsibility of the purchaser, builder or installer. If you are unsure whether West Coast Beech decking is right for your project, contact us before ordering and we can talk through the intended use, finish, quantity and freight.</p>

<p><a href="https://innatefurniture.co.nz/pages/contact">Contact us about West Coast Beech decking</a></p>'''

SEO_TITLE = 'West Coast Beech Decking NZ | Kwila Alternative | Innate'
SEO_DESCRIPTION = 'West Coast Red Heart Beech decking, 90x19mm untreated native hardwood. Factory oil coating available with NZ-made exterior oil. A local alternative to Kwila decking.'
OLD_SHOULD_BE_ABSENT = ['supplied untreated or pre-coated', 'Build a Legacy', 'Why Cutting This Tree Saves the Forest', 'our we operate']
NEW_SHOULD_BE_PRESENT = ['Factory oil coating option', '$1.40 per linear metre', 'untreated native hardwood decking', 'product-sample', 'If you are comparing Kwila decking']


def load_env():
    for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
        p = pathlib.Path(envp)
        if p.exists():
            for line in p.read_text().splitlines():
                if line and not line.lstrip().startswith('#') and '=' in line:
                    k,v=line.split('=',1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def norm_store(s: str) -> str:
    s = (s or '').replace('https://','').replace('http://','').rstrip('/')
    if s and '.myshopify.com' not in s and '.' not in s:
        s = f'{s}.myshopify.com'
    return s

load_env()
store = norm_store(os.environ.get('SHOPIFY_STORE') or os.environ.get('SHOPIFY_SHOP') or 'innate-furniture.myshopify.com')
token = os.environ.get('SHOPIFY_ADMIN_API_TOKEN') or os.environ.get('SHOPIFY_ACCESS_TOKEN') or os.environ.get('SHOPIFY_TOKEN')
if not token:
    raise SystemExit('Missing Shopify Admin token')
BASE = f'https://{store}/admin/api/{API_VERSION}'
HEADERS = {'X-Shopify-Access-Token': token, 'Content-Type': 'application/json'}


def api(path: str, method='GET', data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(BASE + path, data=body, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw = resp.read().decode('utf-8','replace')
        return json.loads(raw) if raw else {}


def public(path: str):
    url = f'https://innatefurniture.co.nz{path}'
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.status, dict(resp.headers), resp.read().decode('utf-8','replace')


def textify(raw: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', raw))).strip()


def html_title(raw: str) -> str:
    m = re.search(r'<title>(.*?)</title>', raw, re.S|re.I)
    return html.unescape(re.sub(r'\s+',' ',m.group(1)).strip()) if m else ''


def meta_desc(raw: str) -> str:
    for tag in re.findall(r'<meta\b[^>]*>', raw, flags=re.I|re.S):
        if re.search(r'\bname\s*=\s*(["\'])description\1', tag, re.I):
            m = re.search(r'\bcontent\s*=\s*(["\'])(.*?)\1', tag, re.I|re.S)
            return html.unescape(m.group(2)) if m else ''
    return ''


def normalized_html(s: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'>\s+<','><',s))).strip()

# Confirm linked pages before changing
for path in ['/products/product-sample', '/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead']:
    st, _hdr, _raw = public(path + '?preflight=' + str(int(time.time())))
    if st != 200:
        raise SystemExit(f'Linked page preflight failed {path}: {st}')

products = api('/products.json?' + urllib.parse.urlencode({'handle': HANDLE, 'limit': 1}))['products']
if not products:
    raise SystemExit(f'Product not found: {HANDLE}')
product = products[0]
pid = product['id']
metafields = api(f'/products/{pid}/metafields.json?limit=250')['metafields']
(BACKUP / 'before_product_and_metafields.json').write_text(json.dumps({'product': product, 'metafields': metafields}, indent=2), encoding='utf-8')
(BACKUP / 'before_body_html.html').write_text(product.get('body_html') or '', encoding='utf-8')
(BACKUP / 'approved_body_html.html').write_text(BODY_HTML, encoding='utf-8')
(BACKUP / 'approved_seo.json').write_text(json.dumps({'title_tag': SEO_TITLE, 'description_tag': SEO_DESCRIPTION}, indent=2), encoding='utf-8')

api(f'/products/{pid}.json', method='PUT', data={'product': {'id': pid, 'body_html': BODY_HTML}})
by_key = {(m['namespace'], m['key']): m for m in metafields}
for key, value in [('title_tag', SEO_TITLE), ('description_tag', SEO_DESCRIPTION)]:
    existing = by_key.get(('global', key))
    if existing:
        api(f'/products/{pid}/metafields/{existing["id"]}.json', method='PUT', data={'metafield': {'id': existing['id'], 'value': value, 'type': existing.get('type') or 'single_line_text_field'}})
    else:
        api(f'/products/{pid}/metafields.json', method='POST', data={'metafield': {'namespace': 'global', 'key': key, 'value': value, 'type': 'single_line_text_field'}})

product_after = api(f'/products/{pid}.json')['product']
metafields_after = api(f'/products/{pid}/metafields.json?limit=250')['metafields']
(BACKUP / 'after_product_and_metafields.json').write_text(json.dumps({'product': product_after, 'metafields': metafields_after}, indent=2), encoding='utf-8')

mfs = {(m['namespace'], m['key']): m.get('value') for m in metafields_after}
status, headers, raw = public(f'/products/{HANDLE}?verify={int(time.time())}')
js_status, js_headers, js_raw = public(f'/products/{HANDLE}.js?verify={int(time.time())}')
js = json.loads(js_raw)
raw_text = textify(raw)
js_text = textify(js.get('description',''))
admin_text = textify(product_after.get('body_html',''))
checks = {
    'admin_body_normalized_match': normalized_html(product_after.get('body_html') or '') == normalized_html(BODY_HTML),
    'admin_body_new_phrases_present': all(x in admin_text or x in (product_after.get('body_html') or '') for x in NEW_SHOULD_BE_PRESENT),
    'admin_body_old_phrases_absent': all(x not in admin_text and x not in (product_after.get('body_html') or '') for x in OLD_SHOULD_BE_ABSENT),
    'admin_seo_title_exact': mfs.get(('global','title_tag')) == SEO_TITLE,
    'admin_seo_description_exact': mfs.get(('global','description_tag')) == SEO_DESCRIPTION,
    'product_js_status_200': js_status == 200,
    'product_js_new_phrases_present': all(x in js_text or x in js.get('description','') for x in NEW_SHOULD_BE_PRESENT),
    'product_js_old_phrases_absent': all(x not in js_text and x not in js.get('description','') for x in OLD_SHOULD_BE_ABSENT),
    'public_status_200': status == 200,
    'public_title_exact_or_contains': html_title(raw) == SEO_TITLE or SEO_TITLE in html_title(raw),
    'public_meta_description_exact': meta_desc(raw) == SEO_DESCRIPTION,
    'public_new_phrases_present': all(x in raw_text or x in raw for x in NEW_SHOULD_BE_PRESENT),
    'public_old_phrases_absent': all(x not in raw_text and x not in raw for x in OLD_SHOULD_BE_ABSENT),
    'kwila_blog_link_present': 'the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead' in raw,
    'sample_link_present': '/products/product-sample' in raw,
}
summary = {
    'backup_dir': str(BACKUP),
    'product_id': pid,
    'handle': HANDLE,
    'url': f'https://innatefurniture.co.nz/products/{HANDLE}',
    'status': product_after.get('status'),
    'public_status': status,
    'public_title': html_title(raw),
    'public_meta_description': meta_desc(raw),
    'server_timing': headers.get('Server-Timing') or headers.get('server-timing'),
    'checks': checks,
}
(BACKUP / 'verification.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not all(checks.values()):
    raise SystemExit(1)
