#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, html, json, os, pathlib, re, time, urllib.parse, urllib.request

API_VERSION = '2025-01'
PRODUCT_HANDLE = 'west-coast-beech-decking'
BLOG_HANDLE = 'our-purpose'
ARTICLE_HANDLE = 'the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead'
DRAFT = pathlib.Path('/Users/mack-mini/innate-mission-control/seo/beech-decking-audit/2026-07-03_084202/beech-decking-shopify-ready-draft-edits.md')
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-beech-decking-kwila/{STAMP}_approved_draft_apply')
BACKUP.mkdir(parents=True, exist_ok=True)


def load_env():
    for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
        p = pathlib.Path(envp)
        if p.exists():
            for line in p.read_text().splitlines():
                if line and not line.lstrip().startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
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


def public(path: str, ua='chrome'):
    url = 'https://innatefurniture.co.nz' + path
    headers = {'Cache-Control':'no-cache','Pragma':'no-cache'}
    if ua == 'chrome':
        headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
    else:
        headers['User-Agent'] = 'HermesVerification/1.0'
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw = resp.read().decode('utf-8','replace')
        return {'status': resp.status, 'final_url': resp.geturl(), 'headers': dict(resp.headers), 'raw': raw}


def textify(raw: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', raw))).strip()


def normalized_html(s: str) -> str:
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'>\s+<','><',s or ''))).strip()


def extract_product_body() -> str:
    src = DRAFT.read_text(encoding='utf-8')
    m = re.search(r'### Draft `body_html`\s*\n\s*```html\s*\n(.*?)\n```', src, re.S)
    if not m:
        raise SystemExit('Could not extract approved product body from draft file')
    return m.group(1).strip()

PRODUCT_BODY = extract_product_body()

EARLY_CALLOUT = '''<div class="article-callout" style="margin: 1.5rem 0; padding: 1rem; background: #f7f4ee; border-left: 3px solid #283229;">
  <p><strong>Comparing Kwila with a local option?</strong> Start with our <a href="/products/west-coast-beech-decking">West Coast Red Heart Beech decking</a>, or read the companion guide to <a href="/blogs/our-purpose/decking">NZ Beech decking as a local alternative to Kwila</a>.</p>
</div>'''

TIGHT_CHATHAM = '<p>Chatham House estimated that up to around 70% of PNG timber production may have been illegal or high-risk at the time of the report. That does not mean every piece of Kwila sold in New Zealand is illegal, but it does mean vague labels such as “sustainable hardwood” should be backed by current, verifiable evidence.</p>'
CERT_PARAGRAPH = '<p>Some New Zealand suppliers do offer FSC or PEFC-certified Kwila, and that is better than vague sourcing. The point is not that all Kwila is illegal. The point is that buyers should ask for current chain-of-custody paperwork, species information and origin evidence before treating the material as low-risk.</p>'
BUYER_QUESTIONS = '''<h2 style="font-size: 30px; line-height: 1.22; margin-top: 40px;">Questions to ask before choosing decking timber</h2>
<ul>
  <li>What species is it, and where did it come from?</li>
  <li>Is there current FSC, PEFC or other chain-of-custody evidence?</li>
  <li>What documentation can the supplier provide for legality and origin?</li>
  <li>Will the timber bleed tannins, and where will that runoff go?</li>
  <li>What fixings, oil/coating and maintenance schedule are recommended?</li>
  <li>Is the timber suitable for this exposure, including shade, coastal air, pools or high-wear use?</li>
</ul>'''
BEECH_STRENGTHEN = '''<p>For exterior use, the important wording is <strong>Red Beech heartwood</strong>, not generic beech. NZ specialty timber references describe red beech heartwood as durable, suitable for exterior exposed situations and suitable for outdoor decking, while sapwood and some other material should not be treated as the same thing.</p>
<p>That is why we still talk about site conditions, detailing, finish and maintenance. Local timber is not automatically better. It has to be specified and looked after properly.</p>'''
COMPARISON_TABLE = '''<h2 style="font-size: 30px; line-height: 1.22; margin-top: 40px;">Kwila vs West Coast Red Heart Beech</h2>
<p>The useful question is not simply which timber is “best”. It is which timber fits the site, source expectations, finish, maintenance plan and budget.</p>
<div style="overflow-x:auto; margin: 1.5rem 0;">
  <table>
    <thead>
      <tr>
        <th>Question</th>
        <th>Kwila / Merbau</th>
        <th>West Coast Red Heart Beech</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Where does it come from?</td>
        <td>Imported tropical hardwood, commonly from Southeast Asia and the Pacific region</td>
        <td>New Zealand native timber from the West Coast</td>
      </tr>
      <tr>
        <td>What should you ask for?</td>
        <td>Certification, species, origin and chain-of-custody evidence</td>
        <td>Species, grade, finish, treatment/compliance advice and project suitability</td>
      </tr>
      <tr>
        <td>What are the practical risks?</td>
        <td>Tannin bleed, staining, unclear sourcing if documentation is weak, and normal outdoor maintenance</td>
        <td>Needs correct exterior detailing, coating, airflow, suitable fixings and ongoing care</td>
      </tr>
      <tr>
        <td>Best fit</td>
        <td>When imported tropical hardwood is acceptable and sourcing is properly verified</td>
        <td>When local provenance, natural character and a clearer supply chain matter</td>
      </tr>
    </tbody>
  </table>
</div>'''
BOTTOM_CTA = '''<div class="article-cta">
    <h2>Considering a local alternative to Kwila?</h2>
    <p>If you are weighing up decking timber, start with the material and the site rather than just the species name. We can talk through West Coast Red Heart Beech decking, finish options, samples, freight and whether it suits the exposure you are working with.</p>
    <div class="cta-links">
      <a class="cta-primary" style="color:#2f3a2f!important;background:#f7f4ee!important;border-color:#f7f4ee!important;" href="/products/west-coast-beech-decking">View West Coast Red Heart Beech decking</a>
      <a class="cta-secondary" style="color:#f7f4ee!important;border-color:#f7f4ee!important;" href="/blogs/our-purpose/decking">Read the NZ Beech decking guide</a>
      <a class="cta-secondary" style="color:#f7f4ee!important;border-color:#f7f4ee!important;" href="/collections/decking-flooring">View NZ native timber decking and flooring</a>
      <a class="cta-secondary" style="color:#f7f4ee!important;border-color:#f7f4ee!important;" href="/pages/contact">Talk to us about a decking project</a>
    </div>
  </div>'''

OLD_CHATHAM = '<p>That matters because illegal logging and weak forest governance have been repeatedly documented in some Kwila-producing regions. A <a href="https://www.chathamhouse.org/sites/default/files/home/chatham/public_html/sites/default/files/20140400LoggingPapuaNewGuineaLawson.pdf" target="_blank" rel="noopener">Chatham House report on illegal logging in Papua New Guinea</a> estimated serious legality risks in the sector, including a widely cited estimate that around 70% of logging in PNG was illegal at the time of the report.</p>'


def one_replace(s: str, old: str, new: str, label: str) -> str:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    return s.replace(old, new, 1)

# preflight public linked pages
for path in ['/products/west-coast-beech-decking', '/blogs/our-purpose/decking', '/collections/decking-flooring', '/products/product-sample', '/pages/contact']:
    st = public(path + '?preflight=' + str(int(time.time())))['status']
    if st != 200:
        raise SystemExit(f'Public preflight failed {path}: {st}')

# read targets
products = api('/products.json?' + urllib.parse.urlencode({'handle': PRODUCT_HANDLE, 'limit': 1}))['products']
if not products:
    raise SystemExit('Product not found')
product_before = products[0]
product_id = product_before['id']
product_mfs_before = api(f'/products/{product_id}/metafields.json?limit=250')['metafields']
blogs = api('/blogs.json?limit=250')['blogs']
blog = next((b for b in blogs if b.get('handle') == BLOG_HANDLE), None)
if not blog:
    raise SystemExit('Blog not found')
articles = api(f'/blogs/{blog["id"]}/articles.json?limit=250&fields=id,title,handle,body_html,summary_html,published_at,tags,author,user_id,created_at,updated_at,metafields_global_title_tag,metafields_global_description_tag')['articles']
article = next((a for a in articles if a.get('handle') == ARTICLE_HANDLE), None)
if not article:
    raise SystemExit('Article not found')
article_before = api(f'/blogs/{blog["id"]}/articles/{article["id"]}.json')['article']
article_mfs_before = api(f'/articles/{article["id"]}/metafields.json?limit=250').get('metafields', [])

# backups before any write
(BACKUP / 'before_product.json').write_text(json.dumps(product_before, indent=2), encoding='utf-8')
(BACKUP / 'before_product_metafields.json').write_text(json.dumps(product_mfs_before, indent=2), encoding='utf-8')
(BACKUP / 'before_product_body.html').write_text(product_before.get('body_html') or '', encoding='utf-8')
(BACKUP / 'approved_product_body.html').write_text(PRODUCT_BODY, encoding='utf-8')
(BACKUP / 'before_article.json').write_text(json.dumps(article_before, indent=2), encoding='utf-8')
(BACKUP / 'before_article_metafields.json').write_text(json.dumps(article_mfs_before, indent=2), encoding='utf-8')
body_before = article_before.get('body_html') or ''
(BACKUP / 'before_article_body.html').write_text(body_before, encoding='utf-8')

# build article body
body_after = body_before
if 'Comparing Kwila with a local option?' not in body_after:
    body_after = one_replace(body_after, '  <p>For indoor surfaces, that same local-timber thinking carries through to our <a href="/pages/timber-panels">custom timber benchtops</a>, made in Christchurch from NZ-grown timber options.</p>', EARLY_CALLOUT + '\n\n  <p>For indoor surfaces, that same local-timber thinking carries through to our <a href="/pages/timber-panels">custom timber benchtops</a>, made in Christchurch from NZ-grown timber options.</p>', 'early callout insertion')
body_after = one_replace(body_after, OLD_CHATHAM, TIGHT_CHATHAM, 'Chatham paragraph') if OLD_CHATHAM in body_after else body_after
if 'Some New Zealand suppliers do offer FSC or PEFC-certified Kwila' not in body_after:
    body_after = one_replace(body_after, '<p>But certification does not change the basic trade-off. Kwila is still an imported tropical hardwood. It has travelled a long way, comes from regions where land-use and legality issues have been significant, and often competes against local materials that can be specified with a more direct New Zealand provenance.</p>', '<p>But certification does not change the basic trade-off. Kwila is still an imported tropical hardwood. It has travelled a long way, comes from regions where land-use and legality issues have been significant, and often competes against local materials that can be specified with a more direct New Zealand provenance.</p>\n' + CERT_PARAGRAPH, 'cert paragraph')
if 'Questions to ask before choosing decking timber' not in body_after:
    body_after = one_replace(body_after, '  <p>This does not make Kwila unusable. It means the material needs to be detailed honestly. Pre-weathering, drainage, fixing details, surface protection and maintenance expectations all matter. Outdoor timber always needs care.</p>', '  <p>This does not make Kwila unusable. It means the material needs to be detailed honestly. Pre-weathering, drainage, fixing details, surface protection and maintenance expectations all matter. Outdoor timber always needs care.</p>\n\n  ' + BUYER_QUESTIONS, 'buyer questions')
if 'For exterior use, the important wording is <strong>Red Beech heartwood</strong>' not in body_after:
    body_after = one_replace(body_after, '  <p>Local does not automatically mean better. A timber still has to suit the exposure, detailing, finish and maintenance plan. But when the project suits it, a New Zealand material with clearer provenance is a much stronger starting point than an imported timber chosen only because it is familiar.</p>', '  <p>Local does not automatically mean better. A timber still has to suit the exposure, detailing, finish and maintenance plan. But when the project suits it, a New Zealand material with clearer provenance is a much stronger starting point than an imported timber chosen only because it is familiar.</p>\n' + BEECH_STRENGTHEN, 'beech strengthen')
if 'Kwila vs West Coast Red Heart Beech' not in body_after:
    body_after = one_replace(body_after, '  </div>\n\n  <h2 style="font-size: 30px; line-height: 1.22; margin-top: 40px;">How we would choose between them</h2>', '  </div>\n\n  ' + COMPARISON_TABLE + '\n\n  <h2 style="font-size: 30px; line-height: 1.22; margin-top: 40px;">How we would choose between them</h2>', 'comparison table')
# replace existing styled CTA block and remove old appended paragraph after wrapper
body_after, cta_count = re.subn(r'<div class="article-cta">\s*<h2>Choosing timber for an outdoor project\?</h2>.*?\n\s*</div>\s*\n\s*</div>', BOTTOM_CTA, body_after, count=1, flags=re.S)
if cta_count != 1:
    raise SystemExit(f'Bottom CTA replacement failed: replaced {cta_count}')
body_after = re.sub(r'\s*<p>Planning an outdoor table or bar leaner as well as decking\?.*?</p>\s*$', '', body_after, count=1, flags=re.S)
if 'Considering a local alternative to Kwila?' not in body_after:
    raise SystemExit('Bottom CTA replacement failed')

(BACKUP / 'after_article_body.html').write_text(body_after, encoding='utf-8')
(BACKUP / 'diff_article_body.patch').write_text('\n'.join(difflib.unified_diff(body_before.splitlines(), body_after.splitlines(), fromfile='before/article_body', tofile='after/article_body', lineterm='')), encoding='utf-8')
(BACKUP / 'diff_product_body.patch').write_text('\n'.join(difflib.unified_diff((product_before.get('body_html') or '').splitlines(), PRODUCT_BODY.splitlines(), fromfile='before/product_body', tofile='after/product_body', lineterm='')), encoding='utf-8')

# apply writes
api(f'/products/{product_id}.json', method='PUT', data={'product': {'id': product_id, 'body_html': PRODUCT_BODY}})
api(f'/blogs/{blog["id"]}/articles/{article["id"]}.json', method='PUT', data={'article': {'id': article['id'], 'body_html': body_after}})

# readback
product_after = api(f'/products/{product_id}.json')['product']
product_mfs_after = api(f'/products/{product_id}/metafields.json?limit=250')['metafields']
article_after = api(f'/blogs/{blog["id"]}/articles/{article["id"]}.json')['article']
article_mfs_after = api(f'/articles/{article["id"]}/metafields.json?limit=250').get('metafields', [])
(BACKUP / 'after_product.json').write_text(json.dumps(product_after, indent=2), encoding='utf-8')
(BACKUP / 'after_product_metafields.json').write_text(json.dumps(product_mfs_after, indent=2), encoding='utf-8')
(BACKUP / 'after_article.json').write_text(json.dumps(article_after, indent=2), encoding='utf-8')
(BACKUP / 'after_article_metafields.json').write_text(json.dumps(article_mfs_after, indent=2), encoding='utf-8')

# public verification
cache = int(time.time() * 1000)
prod_js = public(f'/products/{PRODUCT_HANDLE}.js?verify={cache}')
prod_raw = public(f'/products/{PRODUCT_HANDLE}?verify={cache}')
article_raw = public(f'/blogs/{BLOG_HANDLE}/{ARTICLE_HANDLE}?verify={cache}')
prod_js_json = json.loads(prod_js['raw'])
admin_product_text = textify(product_after.get('body_html') or '')
prod_js_text = textify(prod_js_json.get('description') or '')
prod_raw_text = textify(prod_raw['raw'])
article_admin_text = textify(article_after.get('body_html') or '')
article_raw_text = textify(article_raw['raw'])
product_expected = ['Why choose West Coast Red Heart Beech decking?', 'Beech decking vs Kwila', 'Check with us first for harder sites', 'maintenance-free product']
article_expected = ['Comparing Kwila with a local option?', 'Kwila vs West Coast Red Heart Beech', 'Questions to ask before choosing decking timber', 'Considering a local alternative to Kwila?', 'FSC or PEFC-certified Kwila']
checks = {
    'product_admin_body_exact': normalized_html(product_after.get('body_html') or '') == normalized_html(PRODUCT_BODY),
    'product_admin_expected_present': all(x in (product_after.get('body_html') or '') or x in admin_product_text for x in product_expected),
    'product_js_status_200': prod_js['status'] == 200,
    'product_js_expected_present': all(x in prod_js_json.get('description','') or x in prod_js_text for x in product_expected),
    'product_public_status_200': prod_raw['status'] == 200,
    'product_public_expected_present': all(x in prod_raw['raw'] or x in prod_raw_text for x in product_expected),
    'article_admin_expected_present': all(x in (article_after.get('body_html') or '') or x in article_admin_text for x in article_expected),
    'article_public_status_200': article_raw['status'] == 200,
    'article_public_expected_present': all(x in article_raw['raw'] or x in article_raw_text for x in article_expected),
    'article_legacy_appended_cta_absent': 'Planning an outdoor table or bar leaner as well as decking?' not in (article_after.get('body_html') or ''),
}
summary = {
    'backup_dir': str(BACKUP),
    'product': {'id': product_id, 'handle': PRODUCT_HANDLE, 'url': f'https://innatefurniture.co.nz/products/{PRODUCT_HANDLE}', 'status': product_after.get('status')},
    'article': {'blog_id': blog['id'], 'id': article['id'], 'handle': ARTICLE_HANDLE, 'url': f'https://innatefurniture.co.nz/blogs/{BLOG_HANDLE}/{ARTICLE_HANDLE}', 'published_at': article_after.get('published_at')},
    'changed_fields': ['product.body_html', 'article.body_html'],
    'seo_fields_changed': False,
    'public_server_timing': {'product': prod_raw['headers'].get('server-timing') or prod_raw['headers'].get('Server-Timing'), 'article': article_raw['headers'].get('server-timing') or article_raw['headers'].get('Server-Timing')},
    'checks': checks,
}
(BACKUP / 'verification.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps(summary, indent=2))
if not all(checks.values()):
    raise SystemExit(1)
