#!/usr/bin/env python3
from __future__ import annotations
import base64, datetime as dt, json, os, pathlib, re, time, urllib.error, urllib.request
PROFILE=pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
ROOT=pathlib.Path('/Users/mack-mini/innate-mission-control')
RUN_ID=dt.datetime.now().strftime('%Y-%m-%d_%H%M%S')
OUT=ROOT/'seo'/'beech-decking-audit'/RUN_ID/'dataforseo-serp-sequential'; OUT.mkdir(parents=True,exist_ok=True)
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
if not auth:
    print(json.dumps({'ok':False,'reason':'missing_credentials','out':str(OUT)})); raise SystemExit(0)
BASE='https://api.dataforseo.com'
def req(path,payload=None,method='POST',timeout=180):
    data=None if payload is None else json.dumps(payload).encode()
    r=urllib.request.Request(BASE+path,data=data,method=method,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(r,timeout=timeout) as f: return json.loads(f.read().decode())
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='ignore')
        try: err=json.loads(body)
        except Exception: err={'raw_error_body':body[:1000]}
        return {'_http_error':e.code,'error':err}
def scrub(o):
    txt=json.dumps(o,ensure_ascii=False)
    for s in [os.environ.get('DATAFORSEO_LOGIN'),os.environ.get('DATAFORSEO_PASSWORD'),os.environ.get('DATAFORSEO_AUTH_B64'),auth]:
        if s: txt=txt.replace(s,'[REDACTED]')
    return json.loads(txt)
def save(name,o): (OUT/name).write_text(json.dumps(scrub(o),indent=2,ensure_ascii=False))
def balance(o):
    vals=[]
    def w(x):
        if isinstance(x,dict):
            if isinstance(x.get('balance'),(int,float)): vals.append(x['balance'])
            for v in x.values(): w(v)
        elif isinstance(x,list):
            for v in x: w(v)
    w(o); return max(vals) if vals else None
user=req('/v3/appendix/user_data',None,'GET',60); save('user_data.redacted.json',user); bal=balance(user)
keywords=['beech decking nz','west coast beech decking','red beech decking','red beech timber nz','hardwood decking nz','decking timber nz','timber decking nz','kwila alternative nz','kwila decking alternative','kwila decking nz','sustainable decking nz','native timber decking nz']
locations=[('New Zealand',2554),('Christchurch',1011065)]
if bal is None or bal<2:
    print(json.dumps({'ok':False,'reason':'balance_low_or_unknown','balance':bal,'out':str(OUT)},indent=2)); raise SystemExit(0)
raw=[]
for loc,code in locations:
    for kw in keywords:
        payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'}]
        res=req('/v3/serp/google/organic/live/advanced',payload,timeout=240)
        raw.append(res)
        save(f"serp_{loc.lower().replace(' ','_')}_{re.sub('[^a-z0-9]+','_',kw.lower()).strip('_')}.json",res)
        time.sleep(0.15)
def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
def blob(x): return json.dumps(x,ensure_ascii=False).lower()
rows=[]; total_cost=0
for res in raw:
    total_cost += res.get('cost') or 0
    for task in res.get('tasks') or []:
        tag=((task.get('data') or {}).get('tag') or '|'); loc,kw=tag.split('|',1)
        result=(task.get('result') or [{}])[0] if task.get('result') else {}; items=result.get('items') or []
        innate=[]; comps=[]; features=[]
        for item in items:
            typ=item.get('type'); b=blob(item)
            if typ!='organic' and len(features)<6: features.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name') or (item.get('text') or '')[:80]})
            if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
                innate.append({'type':typ,'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
            elif typ=='organic' and len(comps)<8:
                comps.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
        organic=[x for x in innate if x['type']=='organic']; best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else None
        rows.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate,'competitors':comps,'features':features})
summary={'ok':True,'generated_at':dt.datetime.now().isoformat(),'out':str(OUT),'balance_before':bal,'cost':total_cost,'rows':rows,'live_touched':False}
save('summary.json',summary)
lines=['# DataForSEO sequential SERP beech decking','',f'Generated: {summary["generated_at"]}',f'Balance before: `{bal}`',f'Cost: `{total_cost}`','Live touched: no','','| Location | Keyword | Innate rank | Ranking URL/title | Top competitors |','|---|---|---:|---|---|']
for r in rows:
    comps=', '.join([f"#{c.get('rank_group')} {c.get('domain')}" for c in r['competitors'][:4]])
    rank=r.get('rank') if r.get('rank') is not None else 'not top 20'
    lines.append(f"| {r['location']} | {r['keyword']} | {rank} | {(r.get('title') or '')[:70]} {(r.get('url') or '')[:90]} | {comps} |")
(OUT/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'ok':True,'out':str(OUT),'balance_before':bal,'cost':total_cost,'rows':len(rows)},indent=2))
