#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, urllib.parse, urllib.request, re
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
        raw=resp.read().decode(); return json.loads(raw) if raw else {}
def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset'].get('value','')
assets=req('GET',f'/themes/{LIVE_THEME_ID}/assets.json')['assets']
needles=['Custom Dining Tables','Custom steel-framed dining tables','Dining Tables NZ | Custom Solid Timber Tables | Innate Furniture','Custom Timber Benchtops NZ','Boardroom Tables NZ','Custom boardroom and meeting tables']
hits=[]
for a in assets:
    key=a['key']
    if not key.endswith(('.liquid','.json','.js','.css')): continue
    try: val=get_asset(key)
    except Exception: continue
    for n in needles:
        if n in val:
            hits.append({'key':key,'needle':n,'count':val.count(n)})
print(json.dumps({'asset_count':len(assets),'hits':hits},indent=2))
