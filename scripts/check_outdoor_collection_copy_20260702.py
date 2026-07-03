#!/usr/bin/env python3
from __future__ import annotations
import json, os, urllib.parse, urllib.request, difflib
from pathlib import Path
ENV=[Path('/Users/mack-mini/.env'), Path('/Users/mack-mini/.hermes/profiles/website/.env')]
API=os.environ.get('SHOPIFY_API_VERSION','2025-01')
ASSET='sections/collection-outdoor-prototype.liquid'
NEW=['Custom outdoor dining tables, built properly','Outdoor dining tables, café tables and bar leaners made around your deck, courtyard, venue or patio, with Alfresco porcelain and selected timber options where they make sense.','Enquire about an outdoor dining table','View outdoor dining tables','Timber or Alfresco porcelain','Porcelain when easy care matters','Choose an outdoor dining table starting point. We’ll tune the details.']
OLD=['Honest outdoor furniture, built to last','Outdoor tables and leaners made around your outdoor area, venue or courtyard, with low-maintenance porcelain and timber options where they make sense.','Enquire about an outdoor table','View outdoor table options','Timber or Alfresco','Porcelain when budgets are no concern','Choose a starting point. We’ll tune the details.']
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
def api(base, token, path):
 req=urllib.request.Request(base+path,headers={'X-Shopify-Access-Token':token,'Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=45) as resp: return json.loads(resp.read().decode())
def main():
 load_env(); store=norm(os.environ.get('SHOPIFY_STORE') or os.environ.get('SHOPIFY_SHOP') or 'innate-furniture.myshopify.com'); token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN') or os.environ.get('SHOPIFY_ACCESS_TOKEN') or os.environ.get('SHOPIFY_TOKEN')
 base=f'https://{store}/admin/api/{API}'; themes=api(base,token,'/themes.json?fields=id,name,role')['themes']; live=next(t for t in themes if t['role']=='main'); tid=live['id']
 val=api(base,token,f'/themes/{tid}/assets.json?asset[key]={urllib.parse.quote(ASSET,safe="")}')['asset']['value']
 print(json.dumps({'theme_id':tid,'new_present':{s:(s in val) for s in NEW},'old_present':{s:(s in val) for s in OLD},'length':len(val)},indent=2,ensure_ascii=False))
 out=Path('/Users/mack-mini/innate-mission-control/reference/evidence/outdoor-section-readback-20260702.liquid'); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(val)
 print(str(out))
if __name__=='__main__': main()
