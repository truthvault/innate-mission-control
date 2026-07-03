#!/usr/bin/env python3
from __future__ import annotations
import base64, json, os, re, urllib.request, datetime, pathlib
AUTH=os.environ.get('DATAFORSEO_AUTH_B64')
if not AUTH:
    login=os.environ.get('DATAFORSEO_LOGIN'); password=os.environ.get('DATAFORSEO_PASSWORD')
    if login and password: AUTH=base64.b64encode(f'{login}:{password}'.encode()).decode()
if not AUTH: raise SystemExit('missing DataForSEO credentials')
BASE='https://api.dataforseo.com/v3/serp/google/organic/live/advanced'
OUT=pathlib.Path('/Users/mack-mini/innate-mission-control/seo/tracking-audits/2026-06-24_183045/dataforseo_broad_live.json')
LOCATIONS=[('Christchurch',1011065),('New Zealand',2554)]
KEYWORDS=['timber benchtops nz','custom timber benchtops nz','wooden benchtops nz','kitchen benchtops nz','butcher block nz','butchers block nz','boardroom table nz','boardroom tables nz','custom boardroom table nz','commercial furniture nz','hospitality furniture nz','outdoor dining table nz','kwila timber','west coast beech decking','bar leaner nz','custom furniture christchurch']
all_tasks=[]
total_cost=0.0
for loc,code in LOCATIONS:
    for kw in KEYWORDS:
        payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'}]
        req=urllib.request.Request(BASE,data=json.dumps(payload).encode(),method='POST',headers={'Authorization':'Basic '+AUTH,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=180) as r:
            data_one=json.loads(r.read().decode())
        total_cost += float(data_one.get('cost') or 0)
        all_tasks.extend(data_one.get('tasks') or [])

data={'cost': total_cost, 'tasks': all_tasks}

def blob(item): return json.dumps(item,ensure_ascii=False).lower()
def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
summary=[]
for task in data.get('tasks') or []:
    tag=((task.get('data') or {}).get('tag') or '|')
    loc,kw=tag.split('|',1)
    result=(task.get('result') or [{}])[0] if task.get('result') else {}
    items=result.get('items') or []
    innate=[]; competitors=[]
    for item in items:
        b=blob(item)
        if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
            innate.append({'type':item.get('type'),'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
        elif item.get('type')=='organic' and len(competitors)<5:
            competitors.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
    organic=[x for x in innate if x.get('type')=='organic']
    best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
    summary.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'competitors':competitors})
OUT.write_text(json.dumps({'generated_at':datetime.datetime.now().isoformat(),'cost':data.get('cost'),'summary':summary,'raw':data},indent=2,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'cost':data.get('cost'),'evidence':str(OUT),'summary':summary},indent=2,ensure_ascii=False))
