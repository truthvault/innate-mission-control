#!/usr/bin/env python3
from __future__ import annotations
import base64, datetime as dt, json, os, pathlib, re, urllib.error, urllib.request

PROFILE = pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
ROOT = pathlib.Path('/Users/mack-mini/innate-mission-control')
RUN_ID = dt.datetime.now().strftime('%Y-%m-%d_%H%M%S')
OUT = ROOT / 'seo' / 'beech-decking-audit' / RUN_ID / 'dataforseo'
OUT.mkdir(parents=True, exist_ok=True)

for path in [PROFILE/'.env', PROFILE/'.env.local']:
    if path.exists():
        for line in path.read_text(errors='ignore').splitlines():
            line=line.strip()
            if line and not line.startswith('#') and '=' in line:
                k,v=line.split('=',1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

auth = os.environ.get('DATAFORSEO_AUTH_B64')
if not auth:
    login = os.environ.get('DATAFORSEO_LOGIN')
    password = os.environ.get('DATAFORSEO_PASSWORD')
    if login and password:
        auth = base64.b64encode(f'{login}:{password}'.encode()).decode()
if not auth:
    print(json.dumps({'ok':False,'reason':'missing_credentials','out':str(OUT)}, indent=2)); raise SystemExit(0)

BASE='https://api.dataforseo.com'
def request_json(method, path, payload=None, timeout=240):
    data=None if payload is None else json.dumps(payload).encode()
    req=urllib.request.Request(BASE+path, data=data, method=method, headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='ignore')
        try: err=json.loads(body)
        except Exception: err={'raw_error_body':body[:1000]}
        return {'_http_error':e.code,'error':err}

def scrub(obj):
    txt=json.dumps(obj,ensure_ascii=False)
    login=os.environ.get('DATAFORSEO_LOGIN')
    pwd=os.environ.get('DATAFORSEO_PASSWORD')
    b64=os.environ.get('DATAFORSEO_AUTH_B64')
    for s in [login,pwd,b64,auth]:
        if s: txt=txt.replace(s,'[REDACTED]')
    return json.loads(txt)

def save(name,obj):
    (OUT/name).write_text(json.dumps(scrub(obj),indent=2,ensure_ascii=False))

def find_balance(obj):
    vals=[]
    def walk(x):
        if isinstance(x,dict):
            if 'balance' in x and isinstance(x.get('balance'),(int,float)):
                vals.append(x.get('balance'))
            for v in x.values(): walk(v)
        elif isinstance(x,list):
            for v in x: walk(v)
    walk(obj)
    return max(vals) if vals else None

user_data=request_json('GET','/v3/appendix/user_data',None,60)
save('user_data.redacted.json',user_data)
balance=find_balance(user_data)

keywords=[
 'beech decking nz',
 'west coast beech decking',
 'red beech decking',
 'red beech timber nz',
 'hardwood decking nz',
 'decking timber nz',
 'timber decking nz',
 'kwila alternative nz',
 'kwila decking alternative',
 'kwila decking nz',
 'sustainable decking nz',
 'native timber decking nz',
]
locations=[('New Zealand',2554),('Christchurch',1011065)]
# 24 live advanced tasks, depth 20; expected low single-digit USD. Skip if balance unknown or low.
serp=None
if balance is not None and balance >= 2:
    payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'} for loc,code in locations for kw in keywords]
    serp=request_json('POST','/v3/serp/google/organic/live/advanced',payload,360)
    save('serp_beech_live_advanced.raw.json',serp)
else:
    serp={'skipped':True,'reason':'balance_low_or_unknown','balance':balance}
    save('serp_beech_live_advanced.raw.json',serp)

backlinks=request_json('POST','/v3/backlinks/summary/live',[{'target':'innatefurniture.co.nz','include_subdomains':True,'include_indirect_links':True,'exclude_internal_backlinks':True,'internal_list_limit':20,'backlinks_status_type':'live','tag':'innate-beech-domain-summary'}],180)
save('backlinks_summary.raw.json',backlinks)

# Try page-level backlinks for target product and kwila article.
page_targets=['https://innatefurniture.co.nz/products/west-coast-beech-decking','https://innatefurniture.co.nz/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead']
page_backlinks={}
for target in page_targets:
    res=request_json('POST','/v3/backlinks/backlinks/live',[{'target':target,'mode':'as_is','limit':25,'backlinks_status_type':'live','include_subdomains':False,'exclude_internal_backlinks':True}],240)
    page_backlinks[target]=res
save('page_backlinks.raw.json',page_backlinks)

# Keyword ideas via Google Ads if available; limit scope.
kwideas=request_json('POST','/v3/keywords_data/google_ads/keywords_for_keywords/live',[{'keywords':['beech decking','hardwood decking','kwila decking','decking timber','kwila alternative'],'location_code':2554,'language_code':'en','sort_by':'search_volume','limit':100}],240)
save('keyword_ideas.raw.json',kwideas)

def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
def blob(x): return json.dumps(x,ensure_ascii=False).lower()
serp_rows=[]
if isinstance(serp,dict) and serp.get('tasks'):
    for task in serp.get('tasks') or []:
        tag=((task.get('data') or {}).get('tag') or '|')
        loc,kw=tag.split('|',1)
        result=(task.get('result') or [{}])[0] if task.get('result') else {}
        items=result.get('items') or []
        innate=[]; competitors=[]; features=[]
        for item in items:
            typ=item.get('type'); b=blob(item)
            if typ != 'organic':
                if len(features)<4:
                    features.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('name') or (item.get('text') or '')[:80]})
            if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
                innate.append({'type':typ,'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
            elif typ=='organic' and len(competitors)<8:
                competitors.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
        organic=[x for x in innate if x.get('type')=='organic']
        best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
        serp_rows.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate,'competitors':competitors,'features':features})

# Summarise backlinks safely.
backlink_result=((backlinks.get('tasks') or [{}])[0].get('result') or [None])[0] if isinstance(backlinks,dict) else None
backlink_summary={}
if backlink_result:
    for k in ['rank','backlinks','crawled_pages','referring_domains','referring_main_domains','referring_pages','broken_backlinks','broken_pages','referring_links_types','referring_links_platform_types','referring_links_semantic_locations','referring_links_tld','referring_links_countries']:
        if k in backlink_result: backlink_summary[k]=backlink_result.get(k)

kw_rows=[]
try:
    for task in kwideas.get('tasks') or []:
        for r in task.get('result') or []:
            kw_rows.append({k:r.get(k) for k in ['keyword','search_volume','competition','competition_index','low_top_of_page_bid','high_top_of_page_bid','cpc'] if k in r})
except Exception: pass
kw_rows=kw_rows[:80]

page_link_rows=[]
try:
    for target,res in page_backlinks.items():
        task=(res.get('tasks') or [{}])[0]
        for r in (task.get('result') or []):
            page_link_rows.append({'target':target,'source_url':r.get('url_from'),'source_title':r.get('title_from'),'domain_from':r.get('domain_from'),'rank':r.get('rank'),'anchor':r.get('anchor'),'nofollow':r.get('nofollow')})
except Exception: pass

summary={'ok':True,'generated_at':dt.datetime.now().isoformat(),'out':str(OUT),'balance_before_or_current':balance,'costs':{'serp':serp.get('cost') if isinstance(serp,dict) else None,'backlinks':backlinks.get('cost') if isinstance(backlinks,dict) else None,'keyword_ideas':kwideas.get('cost') if isinstance(kwideas,dict) else None},'serp_rows':serp_rows,'backlinks_summary':backlink_summary,'page_backlinks_sample':page_link_rows[:40],'keyword_ideas_top':kw_rows,'live_touched':False}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))

lines=['# DataForSEO beech decking research','',f'Generated: {summary["generated_at"]}',f'Evidence folder: {OUT}','Live touched: no','',f'Balance before/current: `{balance}`',f'Costs: `{json.dumps(summary["costs"], ensure_ascii=False)}`','','## SERP rank spot-check','| Location | Keyword | Innate rank | Ranking URL/title | Main competitors |','|---|---|---:|---|---|']
for r in serp_rows:
    comps=', '.join([f"#{c.get('rank_group')} {c.get('domain')}" for c in r['competitors'][:4]])
    rank=r.get('rank') if r.get('rank') is not None else 'not top 20'
    lines.append(f"| {r['location']} | {r['keyword']} | {rank} | {(r.get('title') or '')[:70]} {(r.get('url') or '')[:80]} | {comps} |")
lines += ['','## Domain backlinks summary']
for k,v in backlink_summary.items(): lines.append(f'- {k}: `{json.dumps(v,ensure_ascii=False)[:700]}`')
lines += ['','## Keyword ideas sample']
for r in kw_rows[:30]: lines.append(f"- {r}")
(OUT/'report.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'ok':True,'out':str(OUT),'balance':balance,'costs':summary['costs'],'serp_rows':len(serp_rows),'keyword_rows':len(kw_rows),'page_backlinks':len(page_link_rows)},indent=2))
