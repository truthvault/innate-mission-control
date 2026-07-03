#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, hashlib, html, json, os, pathlib, re, time, urllib.parse, urllib.request

LIVE_THEME_ID = 141308166203
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_outdoor_kwila_batch1_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)
TITLE_KEY = 'snippets/innate-seo-title-override.liquid'
DESC_KEY = 'snippets/innate-seo-description-override.liquid'
KWILA_HANDLE = 'the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead'
BLOG_HANDLE = 'our-purpose'

EXPECTED_PUBLIC = {
    '/collections/outdoor': {
        'title': 'Outdoor Furniture NZ | Custom Tables & Bar Leaners | Innate',
        'description': 'Custom outdoor dining tables, bar leaners and stools made in Christchurch with porcelain, steel and selected timber options. NZ-wide delivery.'
    },
    '/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead': {
        'title': 'Kwila Timber NZ | What to Know Before Choosing It | Innate',
        'description': 'A practical NZ guide to Kwila/Merbau: durability, traceability, tannin bleed, care expectations and local West Coast Beech alternatives.'
    },
}
CTA_HTML = '<p>Planning an outdoor table or bar leaner as well as decking? View our <a href="/collections/outdoor">outdoor furniture range</a>, including Alfresco porcelain-and-steel pieces and selected hardwood options. If you are comparing local timber, our <a href="/products/west-coast-beech-decking">West Coast Red Heart Beech decking</a> is the most direct material starting point.</p>'

for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token: raise SystemExit('Missing Shopify env')
base=f'https://{store}/admin/api/2025-01'
headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}

def req(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=90) as resp:
        raw=resp.read().decode(); return json.loads(raw) if raw else {}

def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']

def put_asset(key,value):
    return req('PUT',f'/themes/{LIVE_THEME_ID}/assets.json',{'asset':{'key':key,'value':value}})

def public_meta(path):
    sep='&' if '?' in path else '?'
    url='https://innatefurniture.co.nz'+path+sep+'outdoor_kwila_verify='+str(int(time.time()*1000))
    r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36','Cache-Control':'no-cache','Pragma':'no-cache'})
    with urllib.request.urlopen(r,timeout=45) as resp:
        raw=resp.read().decode('utf-8','replace')
        server=resp.headers.get('server-timing','')
        status=resp.status
        final=resp.geturl()
    mt=re.search(r'<title>(.*?)</title>',raw,re.S|re.I)
    md=re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=(["\'])(.*?)\1',raw,re.S|re.I)
    return {
        'status':status,'final':final,
        'title':html.unescape(re.sub(r'\s+',' ',mt.group(1)).strip()) if mt else None,
        'description':html.unescape(md.group(2).strip()) if md else None,
        'serverTiming':server,
        'themeOk':f'theme;desc="{LIVE_THEME_ID}"' in server or f'theme;desc={LIVE_THEME_ID}' in server,
        'ctaPresent': CTA_HTML.replace('"', '&quot;') in raw or CTA_HTML in raw or 'outdoor furniture range</a>' in raw,
        'rawContainsMaintenanceFree': 'maintenance-free' in raw.lower(),
    }

def find_blog_article():
    blogs = req('GET','/blogs.json?limit=250')['blogs']
    (BACKUP/'blogs.json').write_text(json.dumps(blogs,indent=2),encoding='utf-8')
    blog = next((b for b in blogs if b.get('handle') == BLOG_HANDLE), None)
    if not blog: raise SystemExit('Blog handle not found')
    articles = req('GET',f'/blogs/{blog["id"]}/articles.json?limit=250&fields=id,title,handle,body_html,summary_html,published_at,tags,author,user_id,created_at,updated_at,metafields_global_title_tag,metafields_global_description_tag')['articles']
    (BACKUP/'articles_our_purpose.json').write_text(json.dumps(articles,indent=2),encoding='utf-8')
    article = next((a for a in articles if a.get('handle') == KWILA_HANDLE), None)
    if not article: raise SystemExit('Kwila article not found')
    return blog, article

def get_metafields(owner, oid):
    return req('GET',f'/{owner}/{oid}/metafields.json?limit=250').get('metafields',[])

def put_metafield(owner, oid, namespace, key, value):
    existing = [m for m in get_metafields(owner, oid) if m.get('namespace')==namespace and m.get('key')==key]
    payload={'metafield':{'namespace':namespace,'key':key,'type':'single_line_text_field','value':value}}
    if existing:
        mid=existing[0]['id']
        return req('PUT',f'/metafields/{mid}.json',{'metafield':{'id':mid,'type':'single_line_text_field','value':value}})
    return req('POST',f'/{owner}/{oid}/metafields.json',payload)

# confirm live theme
themes=req('GET','/themes.json')['themes']
live=next((t for t in themes if int(t['id'])==LIVE_THEME_ID),None)
if not live or live.get('role')!='main': raise SystemExit(f'Live theme {LIVE_THEME_ID} not main')
live_theme = live

before_public={p:public_meta(p) for p in EXPECTED_PUBLIC}
(BACKUP/'before_public_meta.json').write_text(json.dumps(before_public,indent=2),encoding='utf-8')

title_before=get_asset(TITLE_KEY); desc_before=get_asset(DESC_KEY)
(BACKUP/'before_innate-seo-title-override.liquid').write_text(title_before,encoding='utf-8')
(BACKUP/'before_innate-seo-description-override.liquid').write_text(desc_before,encoding='utf-8')

blog, article = find_blog_article()
article_before = req('GET',f'/blogs/{blog["id"]}/articles/{article["id"]}.json')['article']
article_mfs_before = get_metafields('articles', article['id'])
(BACKUP/'before_article.json').write_text(json.dumps(article_before,indent=2),encoding='utf-8')
(BACKUP/'before_article_metafields.json').write_text(json.dumps(article_mfs_before,indent=2),encoding='utf-8')

# Theme title/desc overrides: outdoor collection and kwila article title. Add article description branch if absent.
title_after = title_before
for old, new in [
    ("echo 'Outdoor Tables NZ | Bar Leaners & Alfresco Furniture | Innate'", "echo 'Outdoor Furniture NZ | Custom Tables & Bar Leaners | Innate'"),
    ("echo 'The Hidden Cost of Kwila | Local Timber NZ'", "echo 'Kwila Timber NZ | What to Know Before Choosing It | Innate'"),
]:
    if old in title_after:
        title_after = title_after.replace(old, new, 1)
    elif new not in title_after:
        raise SystemExit(f'Missing title string: {old}')

desc_after = desc_before
old_desc = "echo 'Outdoor dining tables, bar leaners and cafe furniture made to order in Christchurch with porcelain, steel and selected timber options.'"
new_desc = "echo 'Custom outdoor dining tables, bar leaners and stools made in Christchurch with porcelain, steel and selected timber options. NZ-wide delivery.'"
if old_desc in desc_after:
    desc_after = desc_after.replace(old_desc, new_desc, 1)
elif new_desc not in desc_after:
    raise SystemExit(f'Missing description string: {old_desc}')
if "request.page_type == 'article'" not in desc_after:
    anchor="""  elsif request.page_type == 'blog'\n    case blog.handle\n"""
    branch="""  elsif request.page_type == 'article'\n    case article.handle\n      when 'our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead'\n        echo 'A practical NZ guide to Kwila/Merbau: durability, traceability, tannin bleed, care expectations and local West Coast Beech alternatives.'\n    endcase\n  elsif request.page_type == 'blog'\n    case blog.handle\n"""
    if anchor not in desc_after: raise SystemExit('Description article branch anchor not found')
    desc_after=desc_after.replace(anchor,branch,1)
elif 'A practical NZ guide to Kwila/Merbau' not in desc_after:
    raise SystemExit('Article description branch exists but expected description absent')
# We still PUT/readback below even if only the article body/metafields remain changed; this keeps
# the theme readback proof in the same backup folder.

(BACKUP/'after_innate-seo-title-override.liquid').write_text(title_after,encoding='utf-8')
(BACKUP/'after_innate-seo-description-override.liquid').write_text(desc_after,encoding='utf-8')
(BACKUP/'diff_title.patch').write_text('\n'.join(difflib.unified_diff(title_before.splitlines(), title_after.splitlines(), fromfile='before/'+TITLE_KEY, tofile='after/'+TITLE_KEY, lineterm='')),encoding='utf-8')
(BACKUP/'diff_description.patch').write_text('\n'.join(difflib.unified_diff(desc_before.splitlines(), desc_after.splitlines(), fromfile='before/'+DESC_KEY, tofile='after/'+DESC_KEY, lineterm='')),encoding='utf-8')

# Article body CTA append: place before closing body if not present.
body_before = article_before.get('body_html') or ''
if 'outdoor furniture range</a>' in body_before:
    body_after = body_before
else:
    body_after = body_before.rstrip() + '\n\n' + CTA_HTML
(BACKUP/'before_article_body.html').write_text(body_before,encoding='utf-8')
(BACKUP/'after_article_body.html').write_text(body_after,encoding='utf-8')
(BACKUP/'diff_article_body.patch').write_text('\n'.join(difflib.unified_diff(body_before.splitlines(), body_after.splitlines(), fromfile='before/article_body', tofile='after/article_body', lineterm='')),encoding='utf-8')

# Apply theme assets
put_asset(TITLE_KEY,title_after)
put_asset(DESC_KEY,desc_after)
read_title=get_asset(TITLE_KEY); read_desc=get_asset(DESC_KEY)
(BACKUP/'readback_innate-seo-title-override.liquid').write_text(read_title,encoding='utf-8')
(BACKUP/'readback_innate-seo-description-override.liquid').write_text(read_desc,encoding='utf-8')
if read_title != title_after or read_desc != desc_after: raise SystemExit('Theme asset readback mismatch')

# Apply article body + SEO metafields for admin consistency too.
article_payload={'article':{'id':article['id'],'body_html':body_after,'metafields_global_title_tag':EXPECTED_PUBLIC['/blogs/our-purpose/'+KWILA_HANDLE]['title'],'metafields_global_description_tag':EXPECTED_PUBLIC['/blogs/our-purpose/'+KWILA_HANDLE]['description']}}
article_update = req('PUT',f'/blogs/{blog["id"]}/articles/{article["id"]}.json',article_payload)
(BACKUP/'article_update_response.json').write_text(json.dumps(article_update,indent=2),encoding='utf-8')
# Ensure SEO metafields exist/read back if REST article SEO fields are ignored by API/version.
put_metafield('articles', article['id'], 'global', 'title_tag', EXPECTED_PUBLIC['/blogs/our-purpose/'+KWILA_HANDLE]['title'])
put_metafield('articles', article['id'], 'global', 'description_tag', EXPECTED_PUBLIC['/blogs/our-purpose/'+KWILA_HANDLE]['description'])
article_after = req('GET',f'/blogs/{blog["id"]}/articles/{article["id"]}.json')['article']
article_mfs_after = get_metafields('articles', article['id'])
(BACKUP/'readback_article.json').write_text(json.dumps(article_after,indent=2),encoding='utf-8')
(BACKUP/'readback_article_metafields.json').write_text(json.dumps(article_mfs_after,indent=2),encoding='utf-8')

# Public verification; Shopify cache can take a moment, do several narrow checks.
after_public=None
for attempt in range(1,7):
    time.sleep(2 if attempt == 1 else 4)
    after_public={p:public_meta(p) for p in EXPECTED_PUBLIC}
    if all(after_public[p]['status']==200 and after_public[p]['title']==exp['title'] and after_public[p]['description']==exp['description'] and after_public[p]['themeOk'] for p, exp in EXPECTED_PUBLIC.items()) and after_public['/blogs/our-purpose/'+KWILA_HANDLE]['ctaPresent']:
        break
(BACKUP/'after_public_meta.json').write_text(json.dumps(after_public,indent=2),encoding='utf-8')
verify={}
for path, exp in EXPECTED_PUBLIC.items():
    got=after_public[path]
    verify[path]={
        'title_ok': got['title']==exp['title'],
        'description_ok': got['description']==exp['description'],
        'theme_ok': got['themeOk'],
        'status': got['status'],
        'cta_present': got['ctaPresent'] if path.startswith('/blogs/') else None,
        'maintenance_free_present': got['rawContainsMaintenanceFree'],
        'title': got['title'],
        'description': got['description'],
    }
body_ok = 'outdoor furniture range</a>' in (article_after.get('body_html') or '')
mf_title = next((m['value'] for m in article_mfs_after if m.get('namespace')=='global' and m.get('key')=='title_tag'), None)
mf_desc = next((m['value'] for m in article_mfs_after if m.get('namespace')=='global' and m.get('key')=='description_tag'), None)
summary={
    'ok': all(v['status']==200 and v['theme_ok'] and v['title_ok'] and v['description_ok'] and not v['maintenance_free_present'] for v in verify.values()) and verify['/blogs/our-purpose/'+KWILA_HANDLE]['cta_present'] and body_ok,
    'live_theme_id': LIVE_THEME_ID,
    'live_theme_role': live_theme.get('role'),
    'live_theme_name': live_theme.get('name'),
    'assets_changed':[TITLE_KEY,DESC_KEY],
    'article_changed': {'blog_id':blog['id'],'article_id':article['id'],'handle':article['handle'],'body_cta_ok':body_ok,'seo_title_metafield':mf_title,'seo_description_metafield':mf_desc},
    'backup': str(BACKUP),
    'title_sha256': hashlib.sha256(read_title.encode()).hexdigest(),
    'description_sha256': hashlib.sha256(read_desc.encode()).hexdigest(),
    'verify': verify,
    'before_public': before_public,
    'after_public': after_public,
}
(BACKUP/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
if not summary['ok']:
    raise SystemExit(2)
