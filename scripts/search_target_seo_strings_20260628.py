#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, urllib.parse, urllib.request
LIVE_THEME_ID=141308166203
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
base=f'https://{store}/admin/api/2025-01'; headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
def req(path):
    r=urllib.request.Request(base+path,headers=headers,method='GET')
    with urllib.request.urlopen(r,timeout=90) as resp: return json.loads(resp.read().decode())
def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req(f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset'].get('value','')
keys=['snippets/innate-seo-title-override.liquid','snippets/innate-seo-description-override.liquid','layout/theme.liquid','snippets/meta-tags.liquid','snippets/avada-seo-social.liquid','templates/index.json','config/settings_data.json']
needles=['Custom Dining Tables','Custom steel-framed dining tables','Dining Tables NZ | Custom Solid Timber Tables | Innate Furniture','Custom Timber Benchtops NZ','Boardroom Tables NZ','Custom boardroom and meeting tables']
out=[]
for key in keys:
    try: val=get_asset(key)
    except Exception as e:
        out.append({'key':key,'error':str(e)}); continue
    out.append({'key':key,'len':len(val),'hits':{n:val.count(n) for n in needles if n in val}})
print(json.dumps(out,indent=2))
