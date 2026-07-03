#!/usr/bin/env python3
from __future__ import annotations
import json, os, pathlib, urllib.parse, urllib.request

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

def req(path):
    r=urllib.request.Request(base+path,headers=headers,method='GET')
    with urllib.request.urlopen(r,timeout=90) as resp:
        return json.loads(resp.read().decode())

handles=['bar-leaner','exterior-bar-leaner']
out={}
for handle in handles:
    qs=urllib.parse.urlencode({'handle':handle,'fields':'id,title,handle,status,body_html,tags,product_type,vendor,variants,images,metafields_global_title_tag,metafields_global_description_tag'})
    products=req('/products.json?'+qs).get('products',[])
    if not products:
        out[handle]={'error':'not found'}; continue
    p=products[0]
    mfs=req(f'/products/{p["id"]}/metafields.json?limit=250').get('metafields',[])
    p['metafields']=[m for m in mfs if m.get('namespace') in ('global','custom')]
    out[handle]=p
print(json.dumps(out,indent=2))
