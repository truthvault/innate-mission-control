#!/usr/bin/env python3
from __future__ import annotations
import json, os, urllib.parse, urllib.request, urllib.error
from pathlib import Path
ENV=[Path('/Users/mack-mini/.env'), Path('/Users/mack-mini/.hermes/profiles/website/.env')]
API=os.environ.get('SHOPIFY_API_VERSION','2025-01')
NEEDLES=['Honest outdoor furniture','Outdoor tables and leaners','Enquire about an outdoor table','View outdoor table options','Timber or Alfresco','Porcelain when budgets are no concern','Choose a starting point']
def load_env():
    for p in ENV:
        if p.exists():
            for raw in p.read_text(errors='ignore').splitlines():
                line=raw.strip()
                if line and not line.startswith('#') and '=' in line:
                    k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))
def norm(s):
    s=s.strip().removeprefix('https://').removeprefix('http://').strip('/')
    if '.myshopify.com' not in s and '.' not in s: s=f'{s}.myshopify.com'
    return s
def req(base,token,path,method='GET',payload=None):
    data=json.dumps(payload).encode() if payload is not None else None
    r=urllib.request.Request(base+path,data=data,method=method,headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json','Accept':'application/json'})
    with urllib.request.urlopen(r,timeout=45) as resp:
        raw=resp.read().decode(); return json.loads(raw) if raw else {}
def get_asset(base, token, tid, key):
    return req(base,token,f'/themes/{tid}/assets.json?asset[key]={urllib.parse.quote(key,safe="")}')['asset'].get('value','')
def main():
    load_env(); store=norm(os.environ.get('SHOPIFY_STORE') or os.environ.get('SHOPIFY_SHOP') or 'innate-furniture.myshopify.com'); token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN') or os.environ.get('SHOPIFY_ACCESS_TOKEN') or os.environ.get('SHOPIFY_TOKEN')
    base=f'https://{store}/admin/api/{API}'
    themes=req(base,token,'/themes.json?fields=id,name,role')['themes']; live=next(t for t in themes if t['role']=='main'); tid=live['id']
    assets=req(base,token,f'/themes/{tid}/assets.json')['assets']
    likely=[a['key'] for a in assets if any(x in a['key'].lower() for x in ['outdoor','collection','page.']) or a['key'].endswith('.liquid')]
    matches=[]
    for key in likely:
        try: val=get_asset(base,token,tid,key)
        except Exception: continue
        found=[n for n in NEEDLES if n in val]
        if found: matches.append({'key':key,'found':found})
    print(json.dumps({'theme_id':tid,'theme_name':live.get('name'),'matches':matches,'likely_count':len(likely)},indent=2))
if __name__=='__main__': main()
