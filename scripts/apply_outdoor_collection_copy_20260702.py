#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, hashlib, json, os, urllib.parse, urllib.request
from pathlib import Path
ENV=[Path('/Users/mack-mini/.env'), Path('/Users/mack-mini/.hermes/profiles/website/.env')]
API=os.environ.get('SHOPIFY_API_VERSION','2025-01')
ASSET='sections/collection-outdoor-prototype.liquid'
BACKUP_ROOT=Path('/Users/mack-mini/.hermes/profiles/website/backups/shopify/outdoor-collection-copy-20260702')
REPLACEMENTS={
    'Honest outdoor furniture, built to last':'Custom outdoor dining tables, built properly',
    'Outdoor tables and leaners made around your outdoor area, venue or courtyard, with low-maintenance porcelain and timber options where they make sense.':'Outdoor dining tables, café tables and bar leaners made around your deck, courtyard, venue or patio, with Alfresco porcelain and selected timber options where they make sense.',
    'Enquire about an outdoor table':'Enquire about an outdoor dining table',
    'View outdoor table options':'View outdoor dining tables',
    'Timber or Alfresco':'Timber or Alfresco porcelain',
    'Porcelain when budgets are no concern':'Porcelain when easy care matters',
    'Choose a starting point. We’ll tune the details.':'Choose an outdoor dining table starting point. We’ll tune the details.',
}
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
def api(base, token, path, method='GET', payload=None):
    body=json.dumps(payload).encode('utf-8') if payload is not None else None
    req=urllib.request.Request(base+path, data=body, method=method, headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json','Accept':'application/json','User-Agent':'InnateOutdoorCopyPatch/1.0'})
    with urllib.request.urlopen(req,timeout=45) as resp:
        raw=resp.read().decode('utf-8'); return json.loads(raw) if raw else {}
def get_asset(base, token, theme_id, key):
    return api(base, token, f'/themes/{theme_id}/assets.json?asset[key]={urllib.parse.quote(key,safe="")}')['asset']['value']
def put_asset(base, token, theme_id, key, value):
    return api(base, token, f'/themes/{theme_id}/assets.json', 'PUT', {'asset':{'key':key,'value':value}})
def sha(s): return hashlib.sha256(s.encode()).hexdigest()
def main():
    load_env(); store=norm(os.environ.get('SHOPIFY_STORE') or os.environ.get('SHOPIFY_SHOP') or 'innate-furniture.myshopify.com'); token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN') or os.environ.get('SHOPIFY_ACCESS_TOKEN') or os.environ.get('SHOPIFY_TOKEN')
    if not token: raise SystemExit('Missing Shopify token; no changes made')
    base=f'https://{store}/admin/api/{API}'
    themes=api(base,token,'/themes.json?fields=id,name,role')['themes']; live=next(t for t in themes if t['role']=='main'); tid=live['id']
    before=get_asset(base,token,tid,ASSET)
    missing=[old for old in REPLACEMENTS if old not in before]
    if missing: raise SystemExit('Expected strings missing; no changes made: '+json.dumps(missing,ensure_ascii=False))
    after=before
    for old,new in REPLACEMENTS.items(): after=after.replace(old,new)
    ts=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    bdir=BACKUP_ROOT/ts; bdir.mkdir(parents=True,exist_ok=True)
    before_path=bdir/ASSET.replace('/','__')
    after_path=bdir/(ASSET.replace('/','__')+'.after')
    before_path.write_text(before); after_path.write_text(after)
    put_asset(base,token,tid,ASSET,after)
    readback=get_asset(base,token,tid,ASSET)
    if readback!=after: raise SystemExit('Readback mismatch after write')
    manifest={'timestamp_utc':ts,'store':store,'theme_id':tid,'theme_name':live.get('name'),'asset':ASSET,'backup_path':str(before_path),'after_path':str(after_path),'sha_before':sha(before),'sha_after':sha(after),'replacements':REPLACEMENTS}
    (bdir/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
    print(json.dumps({'status':'updated','theme_id':tid,'theme_name':live.get('name'),'asset':ASSET,'backup_dir':str(bdir),'sha_before':manifest['sha_before'][:12],'sha_after':manifest['sha_after'][:12]},indent=2))
if __name__=='__main__': main()
