#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, hashlib, html, json, os, pathlib, re, time, urllib.parse, urllib.request
LIVE_THEME_ID = 141308166203
STAMP = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP = pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_ctr_query_seo_meta_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)
TITLE_KEY='snippets/innate-seo-title-override.liquid'
DESC_KEY='snippets/innate-seo-description-override.liquid'
EXPECTED = {
    '/': {
        'title':'Custom Timber Furniture NZ | Dining Tables, Benchtops & More | Innate',
        'description':'Custom timber furniture made in Christchurch from NZ native and specialty timbers. Dining tables, timber benchtops, boardroom tables and project furniture, made to order and delivered NZ-wide.'
    },
    '/pages/timber-panels': {
        'title':'Timber Benchtops NZ | Custom Size Live Quote | Innate',
        'description':'Plan a custom timber benchtop online. Choose West Coast Rimu, Northland Tōtara or West Coast Beech, set your size and see the quote as you go. Made in Christchurch, delivered NZ-wide.'
    },
    '/collections/dining-tables': {
        'title':'Dining Tables NZ | Custom Solid Timber Tables | Innate',
        'description':'Compare custom dining tables made in Christchurch from solid timber. Choose shape, size, timber, finish and base style, then send us a brief for your room. Delivered NZ-wide.'
    },
    '/pages/boardroom-tables': {
        'title':'Boardroom Tables NZ | Custom Timber Meeting Tables | Innate',
        'description':'Custom boardroom and meeting tables made in Christchurch for offices, studios and commercial spaces. Solid timber, steel bases, power/data planning and NZ-wide delivery.'
    },
}
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
    url='https://innatefurniture.co.nz'+path+('?' if '?' not in path else '&')+'ctr_meta_verify='+str(int(time.time()))
    r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36','Cache-Control':'no-cache','Pragma':'no-cache'})
    with urllib.request.urlopen(r,timeout=45) as resp:
        raw=resp.read().decode('utf-8','replace')
        server=resp.headers.get('server-timing','')
        status=resp.status
        final=resp.geturl()
    mt=re.search(r'<title>(.*?)</title>',raw,re.S|re.I)
    md=re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=(["\'])(.*?)\1',raw,re.S|re.I)
    return {'status':status,'final':final,'title':html.unescape(re.sub(r'\s+',' ',mt.group(1)).strip()) if mt else None,'description':html.unescape(md.group(2).strip()) if md else None,'serverTiming':server,'themeOk':f'theme;desc="{LIVE_THEME_ID}"' in server or f'theme;desc={LIVE_THEME_ID}' in server}

themes=req('GET','/themes.json')['themes']
live=next((t for t in themes if int(t['id'])==LIVE_THEME_ID),None)
if not live or live.get('role')!='main': raise SystemExit(f'Live theme {LIVE_THEME_ID} not main')
# before public and assets
before_public={p:public_meta(p) for p in EXPECTED}
title_before=get_asset(TITLE_KEY); desc_before=get_asset(DESC_KEY)
(BACKUP/'before_public_meta.json').write_text(json.dumps(before_public,indent=2),encoding='utf-8')
(BACKUP/'before_innate-seo-title-override.liquid').write_text(title_before,encoding='utf-8')
(BACKUP/'before_innate-seo-description-override.liquid').write_text(desc_before,encoding='utf-8')

title_after=title_before
# Add homepage title before product branch.
old="""{%- liquid\n  if request.page_type == 'product'"""
new="""{%- liquid\n  if template.name == 'index' or request.page_type == 'index'\n    echo 'Custom Timber Furniture NZ | Dining Tables, Benchtops & More | Innate'\n  elsif request.page_type == 'product'"""
if "Custom Timber Furniture NZ | Dining Tables, Benchtops & More | Innate" not in title_after:
    if old not in title_after: raise SystemExit('Title homepage insertion anchor not found')
    title_after=title_after.replace(old,new,1)
# Change page title overrides.
repls_title={
"echo 'Custom Timber Benchtops NZ | Rimu, Tōtara, Beech | Innate'":"echo 'Timber Benchtops NZ | Custom Size Live Quote | Innate'",
}
for a,b in repls_title.items():
    if a in title_after: title_after=title_after.replace(a,b,1)
    elif b not in title_after: raise SystemExit(f'Missing title string: {a}')
# Add dining collection title under collection case if absent.
if "when 'dining-tables'" not in title_after:
    anchor="""  elsif request.page_type == 'collection'\n    case collection.handle\n"""
    insert="""  elsif request.page_type == 'collection'\n    case collection.handle\n      when 'dining-tables'\n        echo 'Dining Tables NZ | Custom Solid Timber Tables | Innate'\n"""
    if anchor not in title_after: raise SystemExit('Collection title insertion anchor not found')
    title_after=title_after.replace(anchor,insert,1)
elif "Dining Tables NZ | Custom Solid Timber Tables | Innate" not in title_after:
    raise SystemExit('Dining collection title case exists but expected title absent')

desc_after=desc_before
old="""{%- liquid\n  if request.page_type == 'product'"""
new="""{%- liquid\n  if template.name == 'index' or request.page_type == 'index'\n    echo 'Custom timber furniture made in Christchurch from NZ native and specialty timbers. Dining tables, timber benchtops, boardroom tables and project furniture, made to order and delivered NZ-wide.'\n  elsif request.page_type == 'product'"""
if EXPECTED['/']['description'] not in desc_after:
    if old not in desc_after: raise SystemExit('Description homepage insertion anchor not found')
    desc_after=desc_after.replace(old,new,1)
repls_desc={
"echo 'Custom boardroom and meeting tables made in Christchurch from NZ native timber, with integrated power, cable management and nationwide delivery planning.'":"echo 'Custom boardroom and meeting tables made in Christchurch for offices, studios and commercial spaces. Solid timber, steel bases, power/data planning and NZ-wide delivery.'",
"echo 'Custom timber benchtops made to size in West Coast Rimu, Northland Tōtara and West Coast Beech, with samples and nationwide delivery.'":"echo 'Plan a custom timber benchtop online. Choose West Coast Rimu, Northland Tōtara or West Coast Beech, set your size and see the quote as you go. Made in Christchurch, delivered NZ-wide.'",
"echo 'Custom solid timber dining tables made to order in Christchurch and delivered NZ-wide. Choose size, shape, timber, colour, finish and base for your room.'":"echo 'Compare custom dining tables made in Christchurch from solid timber. Choose shape, size, timber, finish and base style, then send us a brief for your room. Delivered NZ-wide.'",
}
for a,b in repls_desc.items():
    if a in desc_after: desc_after=desc_after.replace(a,b,1)
    elif b not in desc_after: raise SystemExit(f'Missing desc string: {a}')

(BACKUP/'after_innate-seo-title-override.liquid').write_text(title_after,encoding='utf-8')
(BACKUP/'after_innate-seo-description-override.liquid').write_text(desc_after,encoding='utf-8')
(BACKUP/'diff_title.patch').write_text('\n'.join(difflib.unified_diff(title_before.splitlines(), title_after.splitlines(), fromfile='before/'+TITLE_KEY, tofile='after/'+TITLE_KEY, lineterm='')),encoding='utf-8')
(BACKUP/'diff_description.patch').write_text('\n'.join(difflib.unified_diff(desc_before.splitlines(), desc_after.splitlines(), fromfile='before/'+DESC_KEY, tofile='after/'+DESC_KEY, lineterm='')),encoding='utf-8')

put_asset(TITLE_KEY,title_after)
put_asset(DESC_KEY,desc_after)
read_title=get_asset(TITLE_KEY); read_desc=get_asset(DESC_KEY)
(BACKUP/'readback_innate-seo-title-override.liquid').write_text(read_title,encoding='utf-8')
(BACKUP/'readback_innate-seo-description-override.liquid').write_text(read_desc,encoding='utf-8')
if read_title != title_after or read_desc != desc_after: raise SystemExit('Theme asset readback mismatch')
# give Shopify cache a tiny moment, then verify raw public meta.
time.sleep(2)
after_public={p:public_meta(p) for p in EXPECTED}
(BACKUP/'after_public_meta.json').write_text(json.dumps(after_public,indent=2),encoding='utf-8')
verify={}
for path, exp in EXPECTED.items():
    got=after_public[path]
    verify[path]={'title_ok':got['title']==exp['title'],'description_ok':got['description']==exp['description'],'theme_ok':got['themeOk'],'status':got['status'],'title':got['title'],'description':got['description']}
ok=all(v['title_ok'] and v['description_ok'] and v['status']==200 for v in verify.values())
summary={'ok':ok,'live_theme_id':LIVE_THEME_ID,'live_theme_role':live.get('role'),'live_theme_name':live.get('name'),'assets_changed':[TITLE_KEY,DESC_KEY],'backup':str(BACKUP),'title_sha256':hashlib.sha256(read_title.encode()).hexdigest(),'description_sha256':hashlib.sha256(read_desc.encode()).hexdigest(),'verify':verify,'before_public':before_public,'after_public':after_public}
(BACKUP/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
if not ok: raise SystemExit(2)
