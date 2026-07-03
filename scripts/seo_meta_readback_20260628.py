#!/usr/bin/env python3
from __future__ import annotations
import datetime, json, os, pathlib, urllib.parse, urllib.request, re
LIVE_THEME_ID=141308166203
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
        raw=resp.read().decode()
        return json.loads(raw) if raw else {}
def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']
def one(endpoint, key, value):
    q=urllib.parse.urlencode({key:value})
    return req('GET',f'/{endpoint}.json?{q}')
out={}
out['themes']=[{k:t.get(k) for k in ['id','name','role']} for t in req('GET','/themes.json')['themes'] if int(t['id'])==LIVE_THEME_ID]
for handle in ['timber-panels','boardroom-tables']:
    out[f'page:{handle}']=one('pages','handle',handle)
# collections: check custom and smart
for handle in ['dining-tables']:
    out[f'custom_collection:{handle}']=one('custom_collections','handle',handle)
    out[f'smart_collection:{handle}']=one('smart_collections','handle',handle)
settings=get_asset('config/settings_data.json')
out['settings_data_hits']=[m.group(0)[:220] for m in re.finditer(r'.{0,60}(Custom Dining Tables|Innate Furniture NZ|meta|seo|title|description).{0,140}', settings, flags=re.I)]
out['settings_data_length']=len(settings)
print(json.dumps(out,indent=2))
