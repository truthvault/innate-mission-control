#!/usr/bin/env python3
from __future__ import annotations
import base64, datetime as dt, json, os, pathlib, re, urllib.request
PROFILE=pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
RUN=pathlib.Path(open('/tmp/innate_master_scan_run_dir').read().strip())
for path in [PROFILE/'.env', PROFILE/'.env.local']:
    if path.exists():
        for line in path.read_text(errors='ignore').splitlines():
            line=line.strip()
            if line and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
auth=os.environ.get('DATAFORSEO_AUTH_B64')
if not auth:
    login=os.environ.get('DATAFORSEO_LOGIN'); password=os.environ.get('DATAFORSEO_PASSWORD')
    if login and password: auth=base64.b64encode(f'{login}:{password}'.encode()).decode()
outdir=RUN/'dataforseo/latest-rank-benchmark'; outdir.mkdir(parents=True,exist_ok=True)
if not auth:
    (outdir/'summary.json').write_text(json.dumps({'available':False,'reason':'missing_credentials'},indent=2)); raise SystemExit(0)
keywords=['custom dining tables nz','dining tables nz','round dining table nz','timber benchtops nz','wooden benchtops nz','butcher block nz','boardroom table nz','boardroom tables nz','commercial furniture nz','hospitality furniture nz','restaurant furniture nz','cafe tables nz','commercial cafe furniture','bar leaner nz','outdoor dining table nz','custom furniture christchurch']
locs=[('Christchurch',1011065),('Auckland',1000286),('New Zealand',2554)]
payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'} for loc,code in locs for kw in keywords]
req=urllib.request.Request('https://api.dataforseo.com/v3/serp/google/organic/live/advanced',data=json.dumps(payload).encode(),method='POST',headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=300) as r:
    data=json.loads(r.read().decode())
def blob(x): return json.dumps(x,ensure_ascii=False).lower()
def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
summary=[]
for task in data.get('tasks') or []:
    tag=((task.get('data') or {}).get('tag') or '|'); loc,kw=tag.split('|',1)
    result=(task.get('result') or [{}])[0] if task.get('result') else {}; items=result.get('items') or []
    innate=[]; competitors=[]; ai=[]; local=[]
    for item in items:
        typ=item.get('type'); b=blob(item)
        if typ and any(s in typ for s in ['ai','answer','featured']): ai.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name') or item.get('text')})
        if typ and 'local' in typ: local.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name'),'domain':item.get('domain')})
        if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
            innate.append({'type':typ,'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
        elif typ=='organic' and len(competitors)<5:
            competitors.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
    organic=[x for x in innate if x.get('type')=='organic']; best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
    summary.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate[:5],'competitors':competitors,'ai_items':ai[:3],'local_pack':local[:5]})
(outdir/'raw.json').write_text(json.dumps({'generated_at':dt.datetime.now().isoformat(),'cost':data.get('cost'),'tasks_count':len(data.get('tasks') or []),'raw':data},indent=2,ensure_ascii=False))
(outdir/'summary.json').write_text(json.dumps({'generated_at':dt.datetime.now().isoformat(),'cost':data.get('cost'),'summary':summary},indent=2,ensure_ascii=False))
lines=['# DataForSEO live rank / AI / local visibility benchmark','',f'Generated: {dt.datetime.now().isoformat()}',f"Cost: {data.get('cost')}",f'Rows: {len(summary)}','','| Location | Keyword | Innate rank | Innate URL/title | Top competitors |','|---|---|---:|---|---|']
for r in summary:
    comps=', '.join([f"#{c.get('rank_group')} {c.get('domain')}" for c in r.get('competitors',[])[:3]])
    lines.append(f"| {r['location']} | {r['keyword']} | {r.get('rank') or 'not top 20'} | {(r.get('title') or '')[:70]} {(r.get('url') or '')[:80]} | {comps} |")
(outdir/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'rows':len(summary),'cost':data.get('cost'),'out':str(outdir)},indent=2))
