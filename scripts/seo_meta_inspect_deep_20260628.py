#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, urllib.parse, urllib.request, re, datetime
LIVE_THEME_ID=141308166203
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
base=f'https://{store}/admin/api/2025-01'
headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
def req(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=90) as resp:
        raw=resp.read().decode()
        return json.loads(raw) if raw else {}
def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']
def public(path):
    url='https://innatefurniture.co.nz'+path+('?' if '?' not in path else '&')+'seo_probe='+str(int(datetime.datetime.now().timestamp()))
    r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 SEO readback','Cache-Control':'no-cache'})
    with urllib.request.urlopen(r,timeout=40) as resp:
        return resp.status, resp.geturl(), resp.read().decode('utf-8','replace')
out={}
# fields-specific reads
for handle in ['timber-panels','boardroom-tables']:
    pages=req('GET','/pages.json?'+urllib.parse.urlencode({'handle':handle,'fields':'id,title,handle,metafields_global_title_tag,metafields_global_description_tag,body_html,published_at'})).get('pages',[])
    out['page_'+handle]=pages
for handle in ['dining-tables']:
    cc=req('GET','/custom_collections.json?'+urllib.parse.urlencode({'handle':handle,'fields':'id,title,handle,metafields_global_title_tag,metafields_global_description_tag,body_html,published_scope'})).get('custom_collections',[])
    out['collection_'+handle]=cc
for path in ['/','/pages/timber-panels','/collections/dining-tables','/pages/boardroom-tables']:
    st,final,html=public(path)
    title=re.search(r'<title>(.*?)</title>',html,re.S|re.I)
    desc=re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)',html,re.I)
    out['public_'+path]={'status':st,'final':final,'title':re.sub(r'\s+',' ',title.group(1)).strip() if title else None,'description':desc.group(1) if desc else None,'theme_marker':re.search(r'theme;desc="?(\d+)"?', str(st)) is not None}
# inspect likely assets
for key in ['layout/theme.liquid','snippets/meta-tags.liquid','snippets/avada-seo-social.liquid','config/settings_data.json']:
    try:
        val=get_asset(key)
        hits=[]
        for pat in ['Custom Dining Tables','Custom Timber Benchtops','Boardroom Tables NZ','Dining Tables NZ','metafields_global','page_title','page_description','shop.description','seo']:
            if pat in val:
                hits.append(pat)
        out['asset_'+key]={'len':len(val),'hits':hits,'snippets':[m.group(0)[:350] for m in re.finditer(r'.{0,120}(Custom Dining Tables|Custom Timber Benchtops|Boardroom Tables NZ|Dining Tables NZ|page_title|page_description|shop.description|seo).{0,180}', val, flags=re.I)][:10]}
    except Exception as e:
        out['asset_'+key]={'error':str(e)}
print(json.dumps(out,indent=2))
