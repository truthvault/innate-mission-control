#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, json, os, pathlib, urllib.parse, urllib.request, time, re, html
LIVE_THEME_ID=141308166203
KEY='templates/page.boardroom-tables.json'
STAMP=datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP=pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_boardroom_secondary_cta_visual_tighten_{LIVE_THEME_ID}')
BACKUP.mkdir(parents=True, exist_ok=True)
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(),v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/'); token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
base=f'https://{store}/admin/api/2025-01'; headers={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
def req(method,path,data=None):
 body=None if data is None else json.dumps(data).encode(); r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
 with urllib.request.urlopen(r,timeout=90) as resp:
  raw=resp.read().decode(); return json.loads(raw) if raw else {}
def get_asset(key):
 q=urllib.parse.urlencode({'asset[key]':key}); return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']
def put_asset(key,val): return req('PUT',f'/themes/{LIVE_THEME_ID}/assets.json',{'asset':{'key':key,'value':val}})
themes=req('GET','/themes.json')['themes']; live=next((t for t in themes if int(t['id'])==LIVE_THEME_ID),None)
if not live or live.get('role')!='main': raise SystemExit('Theme not live main')
before=get_asset(KEY)
(BACKUP/'before_page.boardroom-tables.json').write_text(before,encoding='utf-8')
t=json.loads(before)
# Visual QA showed the full support sentence rendered as a huge secondary button. Keep the approved hero intent,
# but shorten the actual secondary CTA label so it behaves like a CTA rather than a text panel.
t['sections']['hero_main']['settings']['secondary_cta_label']='Send room dimensions or plans'
after=json.dumps(t,ensure_ascii=False,indent=2)
(BACKUP/'after_page.boardroom-tables.json').write_text(after,encoding='utf-8')
(BACKUP/'diff_template.patch').write_text('\n'.join(difflib.unified_diff(before.splitlines(),after.splitlines(),fromfile='before/'+KEY,tofile='after/'+KEY,lineterm='')),encoding='utf-8')
put_asset(KEY,after)
readback=get_asset(KEY)
(BACKUP/'readback_page.boardroom-tables.json').write_text(readback,encoding='utf-8')
if json.loads(readback)!=json.loads(after): raise SystemExit('Readback mismatch')
url='https://innatefurniture.co.nz/pages/boardroom-tables?boardroom_visual_tighten='+str(int(time.time()))
r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
with urllib.request.urlopen(r,timeout=45) as resp:
 raw=resp.read().decode('utf-8','replace'); server=resp.headers.get('server-timing',''); status=resp.status
body=html.unescape(re.sub(r'<[^>]+>',' ',raw))
summary={
 'ok': status==200 and 'Send room dimensions or plans' in body and 'Custom timber boardroom tables' in body and 'Start a boardroom table quote' in body,
 'status':status,
 'theme_ok':f'theme;desc="{LIVE_THEME_ID}"' in server,
 'backup':str(BACKUP),
 'changed':[KEY],
 'note':'Shortened oversized secondary hero CTA after rendered visual QA; main approved support wording remains covered in hero subhead and Make it yours copy.'
}
(BACKUP/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
if not summary['ok']: raise SystemExit(2)
