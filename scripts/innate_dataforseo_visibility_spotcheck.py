#!/usr/bin/env python3
from __future__ import annotations
import base64, datetime as dt, json, os, pathlib, re, sys, time, urllib.error, urllib.request

PROFILE = pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
ROOT = pathlib.Path('/Users/mack-mini/innate-mission-control')
RUN_ID = dt.datetime.now().strftime('%Y-%m-%d_%H%M%S')
OUT = ROOT / 'seo' / 'dataforseo-visibility-spotchecks' / RUN_ID
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
    (OUT/'summary.json').write_text(json.dumps({'ok': False, 'reason': 'missing_credentials'}, indent=2))
    print(json.dumps({'ok': False, 'reason': 'missing_credentials', 'out': str(OUT)}, indent=2))
    raise SystemExit(0)

BASE='https://api.dataforseo.com'

def request_json(method: str, path: str, payload=None, timeout=180):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(BASE+path, data=data, method=method, headers={
        'Authorization': 'Basic '+auth,
        'Content-Type': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors='ignore')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {'raw_error_body': body[:1000]}
        return {'_http_error': e.code, 'error': parsed}

# 0-cost balance / access guard
user_data = request_json('GET', '/v3/appendix/user_data', None, 60)
(OUT/'user_data.redacted.json').write_text(json.dumps(user_data, indent=2, ensure_ascii=False))
balance = None
try:
    balance = (user_data.get('tasks') or [{}])[0].get('result', [{}])[0].get('money', {}).get('balance')
except Exception:
    pass

# Free LLM location list probe so NZ support is based on the API, not assumption.
llm_locations = request_json('GET', '/v3/ai_optimization/llm_mentions/locations_and_languages', None, 120)
(OUT/'llm_locations.raw.json').write_text(json.dumps(llm_locations, indent=2, ensure_ascii=False))
llm_nz = None
try:
    for row in ((llm_locations.get('tasks') or [{}])[0].get('result') or []):
        if str(row.get('location_name','')).lower() == 'new zealand':
            llm_nz = row
            break
except Exception:
    pass

# 1) Backlinks summary. Single paid request; summary only, no row-heavy pulls.
backlinks_payload = [{
    'target': 'innatefurniture.co.nz',
    'include_subdomains': True,
    'include_indirect_links': True,
    'exclude_internal_backlinks': True,
    'internal_list_limit': 20,
    'backlinks_status_type': 'live',
    'tag': 'innate-domain-summary'
}]
backlinks = request_json('POST', '/v3/backlinks/summary/live', backlinks_payload, 180)
(OUT/'backlinks_summary.raw.json').write_text(json.dumps(backlinks, indent=2, ensure_ascii=False))

# 2) SERP spot check. 8 high-priority terms x 2 locations = 16 paid live tasks.
keywords = [
    'custom dining tables nz',
    'dining tables nz',
    'timber benchtops nz',
    'custom timber benchtops nz',
    'boardroom tables nz',
    'hospitality furniture nz',
    'outdoor dining table nz',
    'bar leaner nz',
]
locations = [('Christchurch',1011065),('New Zealand',2554)]
serp_payload = [{
    'language_code': 'en',
    'location_code': code,
    'keyword': kw,
    'device': 'mobile',
    'os': 'ios',
    'depth': 20,
    'tag': f'{loc}|{kw}'
} for loc,code in locations for kw in keywords]
serp = request_json('POST', '/v3/serp/google/organic/live/advanced', serp_payload, 300)
(OUT/'serp_spotcheck.raw.json').write_text(json.dumps(serp, indent=2, ensure_ascii=False))

def blob(x): return json.dumps(x, ensure_ascii=False).lower()
def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
serp_rows=[]
for task in serp.get('tasks') or []:
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
    serp_rows.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate[:5],'competitors':competitors,'ai_items':ai_items[:3],'local_pack':local_pack[:5]})

# 3) LLM mentions, one Google/NZ aggregate task where supported, and one ChatGPT/US aggregate task.
llm_payloads=[]
llm_targets = [
    {'domain':'innatefurniture.co.nz','search_scope':['any'],'include_subdomains':True},
    {'keyword':'Innate Furniture','match_type':'partial_match','search_scope':['answer','sources']},
    {'keyword':'custom dining tables nz','match_type':'word_match','search_scope':['question','answer']},
    {'keyword':'custom timber benchtops nz','match_type':'word_match','search_scope':['question','answer']},
    {'keyword':'boardroom tables nz','match_type':'word_match','search_scope':['question','answer']},
]
if llm_nz:
    llm_payloads.append(('google_nz', [{
        'language_code':'en',
        'location_code': llm_nz.get('location_code'),
        'platform':'google',
        'target': llm_targets,
        'limit': 10,
    }]))
else:
    # Fall back to default Google/US if NZ is not available.
    llm_payloads.append(('google_default', [{
        'language_code':'en',
        'location_code':2840,
        'platform':'google',
        'target': llm_targets,
        'limit': 10,
    }]))
llm_payloads.append(('chatgpt_us', [{
    'language_code':'en',
    'location_code':2840,
    'platform':'chat_gpt',
    'target': llm_targets[:3],
    'limit': 10,
}]))
llm_results={}
for name,payload in llm_payloads:
    res=request_json('POST','/v3/ai_optimization/llm_mentions/aggregated_metrics/live',payload,180)
    llm_results[name]=res
    (OUT/f'llm_mentions_{name}.raw.json').write_text(json.dumps(res, indent=2, ensure_ascii=False))

# Reductions
backlink_result = None
try:
    backlink_result = (backlinks.get('tasks') or [{}])[0].get('result', [None])[0]
except Exception:
    backlink_result = None
backlink_summary = {}
if backlink_result:
    keys=['rank','backlinks','crawled_pages','referring_domains','referring_main_domains','referring_pages','referring_ips','referring_subnets','broken_backlinks','broken_pages','referring_links_nofollow','referring_links_types','referring_links_platform_types','referring_links_semantic_locations','referring_links_tld','referring_links_countries']
    backlink_summary={k: backlink_result.get(k) for k in keys if k in backlink_result}

llm_summary={}
for name,res in llm_results.items():
    task=(res.get('tasks') or [{}])[0]
    items=[]
    try:
        result=(task.get('result') or [{}])[0]
        items = result.get('items') or result.get('metrics') or result.get('aggregated_metrics') or []
    except Exception:
        result={}
    llm_summary[name]={
        'status_code': task.get('status_code'),
        'status_message': task.get('status_message'),
        'cost': res.get('cost'),
        'result_count': task.get('result_count') or res.get('result_count'),
        'total': result.get('total') if isinstance(result, dict) else None,
        'items_sample': items[:10] if isinstance(items, list) else items,
    }

costs={
    'backlinks': backlinks.get('cost'),
    'serp': serp.get('cost'),
    'llm': {k:v.get('cost') for k,v in llm_results.items()},
}
summary={
    'ok': True,
    'generated_at': dt.datetime.now().isoformat(),
    'out': str(OUT),
    'balance_before_or_current': balance,
    'costs': costs,
    'llm_new_zealand_supported': bool(llm_nz),
    'llm_new_zealand_location': {'location_code': llm_nz.get('location_code'), 'location_name': llm_nz.get('location_name')} if llm_nz else None,
    'backlinks_summary': backlink_summary,
    'serp_rows': serp_rows,
    'llm_summary': llm_summary,
    'live_touched': False,
}
(OUT/'summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False))

lines=[]
lines.append('# Innate DataForSEO visibility spot-check')
lines.append('')
lines.append(f'Generated: {summary["generated_at"]}')
lines.append(f'Live touched: no')
lines.append(f'Evidence folder: {OUT}')
lines.append('')
lines.append('## Cost')
lines.append(f'- Balance before/current from user_data: `{balance}`')
lines.append(f'- Backlinks cost: `{costs["backlinks"]}`')
lines.append(f'- SERP cost: `{costs["serp"]}`')
for k,v in costs['llm'].items():
    lines.append(f'- LLM {k} cost: `{v}`')
lines.append('')
lines.append('## Backlinks summary')
if backlink_summary:
    for k in ['rank','backlinks','referring_domains','referring_main_domains','referring_pages','broken_backlinks','broken_pages']:
        if k in backlink_summary:
            lines.append(f'- {k}: `{backlink_summary[k]}`')
else:
    lines.append('- No backlink summary returned or access blocked. See raw JSON.')
lines.append('')
lines.append('## SERP spot-check')
lines.append('| Location | Keyword | Innate rank | Ranking URL/title | Top competitors |')
lines.append('|---|---|---:|---|---|')
for r in serp_rows:
    comps=', '.join([f"#{c.get('rank_group')} {c.get('domain')}" for c in r.get('competitors',[])[:3]])
    rank = r.get('rank') if r.get('rank') is not None else 'not top 20'
    title_url = ((r.get('title') or '')[:70] + ' ' + (r.get('url') or '')[:80]).strip()
    lines.append(f"| {r['location']} | {r['keyword']} | {rank} | {title_url} | {comps} |")
lines.append('')
lines.append('## LLM mentions')
lines.append(f'- New Zealand Google LLM location supported: `{bool(llm_nz)}`')
for name,row in llm_summary.items():
    lines.append(f"- {name}: status `{row.get('status_code')}` / `{row.get('status_message')}`, cost `{row.get('cost')}`, result_count `{row.get('result_count')}`")
    if row.get('total'):
        lines.append(f'  - total: `{json.dumps(row.get("total"), ensure_ascii=False)[:500]}`')
    sample=row.get('items_sample')
    if sample:
        lines.append(f'  - sample: `{json.dumps(sample, ensure_ascii=False)[:900]}`')
lines.append('')
(OUT/'report.md').write_text('\n'.join(lines)+'\n')

print(json.dumps({'ok': True, 'out': str(OUT), 'costs': costs, 'balance': balance, 'serp_rows': len(serp_rows), 'llm_keys': list(llm_summary.keys())}, indent=2))
