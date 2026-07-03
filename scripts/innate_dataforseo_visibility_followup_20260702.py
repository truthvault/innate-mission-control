#!/usr/bin/env python3
from __future__ import annotations
import base64, datetime as dt, json, os, pathlib, re, urllib.request, urllib.error
PROFILE=pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
OUT=pathlib.Path('/Users/mack-mini/innate-mission-control/seo/dataforseo-visibility-spotchecks/2026-07-02_064348')
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
if not auth: raise SystemExit('missing credentials')
BASE='https://api.dataforseo.com'
def req(method,path,payload=None,timeout=180):
    data=None if payload is None else json.dumps(payload).encode()
    r=urllib.request.Request(BASE+path,data=data,method=method,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(r,timeout=timeout) as h: return json.loads(h.read().decode())
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='ignore')
        try: parsed=json.loads(body)
        except Exception: parsed={'raw_error_body':body[:1000]}
        return {'_http_error':e.code,'error':parsed}
def blob(x): return json.dumps(x,ensure_ascii=False).lower()
def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
def reduce_serp(tasks):
    rows=[]
    for task in tasks:
        tag=((task.get('data') or {}).get('tag') or '|')
        loc,kw=tag.split('|',1)
        result=(task.get('result') or [{}])[0] if task.get('result') else {}
        items=result.get('items') or []
        innate=[]; competitors=[]; ai_items=[]; local_pack=[]
        for item in items:
            typ=item.get('type'); b=blob(item)
            if typ and any(s in typ for s in ['ai','answer','featured']):
                ai_items.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name') or item.get('text')})
            if typ and 'local' in typ:
                local_pack.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name'),'domain':item.get('domain')})
            if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
                innate.append({'type':typ,'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
            elif typ=='organic' and len(competitors)<5:
                competitors.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
        organic=[x for x in innate if x.get('type')=='organic']
        best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
        rows.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate[:5],'competitors':competitors,'ai_items':ai_items[:3],'local_pack':local_pack[:5]})
    return rows
keywords=['custom dining tables nz','dining tables nz','timber benchtops nz','custom timber benchtops nz','boardroom tables nz','hospitality furniture nz','outdoor dining table nz','bar leaner nz']
locations=[('Christchurch',1011065),('New Zealand',2554)]
serp_tasks=[]; serp_cost=0.0
for loc,code in locations:
    for kw in keywords:
        payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'}]
        res=req('POST','/v3/serp/google/organic/live/advanced',payload,180)
        serp_cost+=float(res.get('cost') or 0)
        serp_tasks.extend(res.get('tasks') or [])
serp_rows=reduce_serp(serp_tasks)
(OUT/'serp_spotcheck_sequential.raw.json').write_text(json.dumps({'generated_at':dt.datetime.now().isoformat(),'cost':serp_cost,'tasks':serp_tasks},indent=2,ensure_ascii=False))
(OUT/'serp_spotcheck_sequential.summary.json').write_text(json.dumps({'generated_at':dt.datetime.now().isoformat(),'cost':serp_cost,'summary':serp_rows},indent=2,ensure_ascii=False))
# Valid LLM aggregate tasks; keep target arrays small.
targets_common=[
    {'domain':'innatefurniture.co.nz','search_scope':['any'],'include_subdomains':True},
    {'keyword':'Innate Furniture','match_type':'partial_match','search_scope':['answer']},
    {'keyword':'custom dining tables nz','match_type':'word_match','search_scope':['answer']},
    {'keyword':'custom timber benchtops nz','match_type':'word_match','search_scope':['answer']},
    {'keyword':'boardroom tables nz','match_type':'word_match','search_scope':['answer']},
]
llm={}
for name,payload in {
    'google_nz_valid':[{'language_code':'en','location_code':2554,'platform':'google','target':targets_common,'limit':10}],
    'chatgpt_us_valid':[{'language_code':'en','location_code':2840,'platform':'chat_gpt','target':targets_common[:3],'limit':10}],
}.items():
    res=req('POST','/v3/ai_optimization/llm_mentions/aggregated_metrics/live',payload,180)
    llm[name]=res
    (OUT/f'llm_mentions_{name}.raw.json').write_text(json.dumps(res,indent=2,ensure_ascii=False))
llm_summary={}
for name,res in llm.items():
    task=(res.get('tasks') or [{}])[0]
    result=(task.get('result') or [{}])[0] if task.get('result') else {}
    items=result.get('items') if isinstance(result,dict) else None
    llm_summary[name]={'status_code':task.get('status_code'),'status_message':task.get('status_message'),'cost':res.get('cost'),'result_count':task.get('result_count') or res.get('result_count'),'total':result.get('total') if isinstance(result,dict) else None,'items_sample':(items or [])[:10] if isinstance(items,list) else items}
(OUT/'llm_mentions_valid.summary.json').write_text(json.dumps(llm_summary,indent=2,ensure_ascii=False))
print(json.dumps({'ok':True,'out':str(OUT),'serp_cost':serp_cost,'serp_rows':len(serp_rows),'llm_costs':{k:v.get('cost') for k,v in llm.items()},'llm_status':{k:(v.get('tasks') or [{}])[0].get('status_message') for k,v in llm.items()}},indent=2))
