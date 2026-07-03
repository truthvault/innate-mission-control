#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, urllib.parse, urllib.request
LIVE_THEME_ID=141308166203
TITLE_KEY='snippets/innate-seo-title-override.liquid'
DESC_KEY='snippets/innate-seo-description-override.liquid'
BACKUP=pathlib.Path('/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260628_225828_live_ctr_query_seo_meta_141308166203')
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
base=f'https://{store}/admin/api/2025-01'; headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
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
for key, fname in [(TITLE_KEY,'after_innate-seo-title-override.liquid'),(DESC_KEY,'after_innate-seo-description-override.liquid')]:
    val=(BACKUP/fname).read_text()
    resp=put_asset(key,val)
    got=get_asset(key)
    print(json.dumps({'key':key,'put_resp_keys':list(resp.get('asset',{}).keys()),'put_resp_value_len':len(resp.get('asset',{}).get('value','')),'wanted_len':len(val),'read_len':len(got),'matches':got==val,'contains_homepage_new':'Custom Timber Furniture NZ' in got or 'Custom timber furniture made in Christchurch' in got},indent=2))
