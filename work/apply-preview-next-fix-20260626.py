#!/usr/bin/env python3
from __future__ import annotations
import datetime, hashlib, json, os, pathlib, urllib.parse, urllib.request
LIVE_THEME_ID=141308166203
PREVIEW_THEME_ID=141408796731
ASSET_KEY='assets/innate-benchtop-configurator.js'
CANDIDATE=pathlib.Path('/Users/mack-mini/innate-mission-control/work/benchtop-live-ui-geometry-preview-20260626_103538/candidate/assets/innate-benchtop-configurator.js')
STAMP=datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP=pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_preview_panel_renderer_next_fix_{PREVIEW_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
if not store or not token: raise SystemExit('Missing Shopify store/token environment')
base=f'https://{store}/admin/api/2025-01'
headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
def req(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=90) as resp:
        raw=resp.read().decode(); return json.loads(raw) if raw else {}
def get_asset(theme_id,key):
    q=urllib.parse.urlencode({'asset[key]':key})
    return req('GET',f'/themes/{theme_id}/assets.json?{q}')['asset']['value']
def put_asset(theme_id,key,value):
    return req('PUT',f'/themes/{theme_id}/assets.json',{'asset':{'key':key,'value':value}})
themes=req('GET','/themes.json')['themes']
live=next((t for t in themes if int(t['id'])==LIVE_THEME_ID),None)
preview=next((t for t in themes if int(t['id'])==PREVIEW_THEME_ID),None)
if not live or live.get('role')!='main': raise SystemExit(f'Live theme {LIVE_THEME_ID} missing or not main')
if not preview or preview.get('role')=='main': raise SystemExit(f'Preview theme {PREVIEW_THEME_ID} missing or unsafe role')
before=get_asset(PREVIEW_THEME_ID,ASSET_KEY)
(BACKUP/'before_innate-benchtop-configurator.js').write_text(before,encoding='utf-8')
value=CANDIDATE.read_text(encoding='utf-8')
put_asset(PREVIEW_THEME_ID,ASSET_KEY,value)
readback=get_asset(PREVIEW_THEME_ID,ASSET_KEY)
(BACKUP/'after_innate-benchtop-configurator.js').write_text(readback,encoding='utf-8')
print(json.dumps({
  'ok': readback==value,
  'preview_theme_id': PREVIEW_THEME_ID,
  'theme_role': preview.get('role'),
  'asset': ASSET_KEY,
  'backup': str(BACKUP),
  'before_sha256': hashlib.sha256(before.encode()).hexdigest(),
  'candidate_sha256': hashlib.sha256(value.encode()).hexdigest(),
  'readback_sha256': hashlib.sha256(readback.encode()).hexdigest(),
  'markers': {m:(m in readback) for m in ['innate-panel-viewbox-fit-v1','panel-resize__dot--corner','innate-selected-rotate','innate-panel-is-active']}
},indent=2))
if readback!=value: raise SystemExit(2)
