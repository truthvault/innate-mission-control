#!/usr/bin/env python3
"""Read-only AI-native Innate website master deep scan runner.

Creates a timestamped evidence folder and collects live/read-only evidence only.
No Shopify/theme/page/product/redirect writes. Never prints secrets.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path('/Users/mack-mini/innate-mission-control')
PROFILE = pathlib.Path('/Users/mack-mini/.hermes/profiles/website')
BASE = 'https://innatefurniture.co.nz'
API_VERSION = '2025-01'
RUN_ROOT = ROOT / 'seo' / 'weekly-audits'
RUN_DIR = RUN_ROOT / f"{dt.datetime.now():%Y-%m-%d_%H%M%S}_master-deep-scan"

PRIORITY_ROUTES = [
    '/',
    '/collections/dining-tables',
    '/pages/timber-panels',
    '/pages/boardroom-tables',
    '/pages/commercial-1',
    '/pages/hospitality-furniture',
    '/collections/outdoor',
    '/products/butchers-block',
    '/products/bar-leaner',
    '/products/alfresco-bar-leaner',
    '/blogs/our-purpose/the-hidden-cost-of-kwila-why-new-zealand-should-support-local-timber-instead',
    '/blogs/our-purpose/new-zealand-timber-options',
    '/blogs/our-purpose/dining-table-size-guide-nz',
]

RANK_KEYWORDS = [
    'custom dining tables nz', 'bespoke dining tables nz', 'solid timber dining table nz',
    'dining tables nz', 'round dining table nz', 'oval dining table nz',
    'timber benchtops nz', 'custom timber benchtops nz', 'wooden benchtops nz', 'butcher block nz',
    'boardroom table nz', 'boardroom tables nz', 'conference table nz', 'meeting table nz',
    'commercial furniture nz', 'hospitality furniture nz', 'restaurant furniture nz', 'cafe tables nz',
    'commercial cafe furniture', 'commercial hospitality furniture', 'bar leaner nz',
    'outdoor dining table nz', 'kwila timber', 'west coast beech decking', 'custom furniture christchurch',
]
LOCATIONS = [('Christchurch',1011065), ('Auckland',1000286), ('Wellington',1000501), ('Queenstown',1000645), ('New Zealand',2554)]

def mkdir(rel: str) -> pathlib.Path:
    p = RUN_DIR / rel
    p.mkdir(parents=True, exist_ok=True)
    return p

def write_json(rel: str, data):
    p = RUN_DIR / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')

def write_text(rel: str, text: str):
    p = RUN_DIR / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

def load_env():
    for path in [PROFILE/'.env', PROFILE/'.env.local', ROOT/'.env', ROOT/'.env.local']:
        if not path.exists():
            continue
        for line in path.read_text(errors='ignore').splitlines():
            line=line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k,v=line.split('=',1)
            k=k.strip(); v=v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k]=v

def run_cmd(name: str, cmd: list[str], timeout=300, env_extra=None, save_stdout: str|None=None):
    env=os.environ.copy()
    env['HERMES_HOME']=str(PROFILE)
    env['RUN_DIR']=str(RUN_DIR)
    if env_extra: env.update(env_extra)
    try:
        cp=subprocess.run(cmd, cwd=str(ROOT), env=env, capture_output=True, text=True, timeout=timeout)
        rec={'name':name,'cmd':[cmd[0], *cmd[1:]], 'returncode':cp.returncode, 'stdout_tail':cp.stdout[-4000:], 'stderr_tail':cp.stderr[-4000:]}
        write_json(f'context/commands/{name}.json', rec)
        if save_stdout and cp.stdout:
            write_text(save_stdout, cp.stdout)
        return cp
    except Exception as e:
        write_json(f'context/commands/{name}.json', {'name':name,'error':type(e).__name__,'detail':str(e)[:1000]})
        return None

def read_json_from_cmd(name: str, cmd: list[str], out_rel: str, timeout=180):
    cp=run_cmd(name, cmd, timeout=timeout)
    if cp and cp.stdout:
        try:
            write_json(out_rel, json.loads(cp.stdout))
        except Exception:
            write_text(out_rel.replace('.json','.txt'), cp.stdout)
    return cp

def shopify_readonly():
    store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
    token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
    out={'configured': bool(store and token), 'store': store if store else None, 'read_only': True, 'objects': {}}
    if not (store and token):
        write_json('shopify/admin_readonly_snapshot.json', out); return
    base=f'https://{store}/admin/api/{API_VERSION}'
    headers={'X-Shopify-Access-Token': token, 'Content-Type':'application/json', 'Accept':'application/json'}
    def get(path):
        req=urllib.request.Request(base+path, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    checks={
        'shop':'/shop.json',
        'themes':'/themes.json',
        'products_count':'/products/count.json',
        'pages_count':'/pages/count.json',
        'collections_custom_count':'/custom_collections/count.json',
        'redirects_count':'/redirects/count.json',
        'products_sample':'/products.json?limit=250&fields=id,title,handle,status,published_at,product_type,tags,updated_at,images,variants',
        'pages_sample':'/pages.json?limit=250&fields=id,title,handle,published_at,updated_at,body_html',
        'custom_collections_sample':'/custom_collections.json?limit=250&fields=id,title,handle,published,updated_at,body_html',
        'smart_collections_sample':'/smart_collections.json?limit=250&fields=id,title,handle,published,updated_at,body_html',
    }
    for k,path in checks.items():
        try:
            data=get(path)
            if k=='products_sample':
                rows=[]
                for p in data.get('products',[]):
                    rows.append({'id':p.get('id'),'title':p.get('title'),'handle':p.get('handle'),'status':p.get('status'),'published_at':p.get('published_at'),'product_type':p.get('product_type'),'tag_count':len(p.get('tags','').split(',')) if isinstance(p.get('tags'),str) else None,'image_count':len(p.get('images') or []),'variant_count':len(p.get('variants') or []),'updated_at':p.get('updated_at')})
                out['objects'][k]={'count':len(rows),'rows':rows}
            elif k in ('pages_sample','custom_collections_sample','smart_collections_sample'):
                key=k.replace('_sample','')
                rows=[]
                for item in data.get(key if key!='collections_custom' else 'custom_collections', []) or data.get('smart_collections',[]):
                    body=item.get('body_html') or ''
                    rows.append({'id':item.get('id'),'title':item.get('title'),'handle':item.get('handle'),'published_at':item.get('published_at'),'published':item.get('published'),'updated_at':item.get('updated_at'),'body_len':len(body),'has_maintenance_free':'maintenance-free' in body.lower() or 'maintenance free' in body.lower()})
                out['objects'][k]={'count':len(rows),'rows':rows}
            else:
                out['objects'][k]=data
        except Exception as e:
            out['objects'][k]={'error':type(e).__name__,'detail':str(e)[:600]}
    write_json('shopify/admin_readonly_snapshot.json', out)

def dataforseo_rank():
    auth=os.environ.get('DATAFORSEO_AUTH_B64')
    if not auth:
        login=os.environ.get('DATAFORSEO_LOGIN'); password=os.environ.get('DATAFORSEO_PASSWORD')
        if login and password:
            auth=base64.b64encode(f'{login}:{password}'.encode()).decode()
    if not auth:
        write_json('dataforseo/latest-rank-benchmark/summary.json', {'available':False,'reason':'missing_credentials'}); return
    api='https://api.dataforseo.com/v3/serp/google/organic/live/advanced'
    tasks=[]; total_cost=0.0; errors=[]
    for loc,code in LOCATIONS:
        for kw in RANK_KEYWORDS:
            payload=[{'language_code':'en','location_code':code,'keyword':kw,'device':'mobile','os':'ios','depth':20,'tag':f'{loc}|{kw}'}]
            try:
                req=urllib.request.Request(api,data=json.dumps(payload).encode(),method='POST',headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
                with urllib.request.urlopen(req,timeout=180) as r:
                    one=json.loads(r.read().decode())
                total_cost += float(one.get('cost') or 0)
                tasks.extend(one.get('tasks') or [])
            except Exception as e:
                errors.append({'location':loc,'keyword':kw,'error':type(e).__name__,'detail':str(e)[:500]})
    summary=[]
    def blob(x): return json.dumps(x,ensure_ascii=False).lower()
    def clean(url): return re.sub(r'([?&])srsltid=[^&]+&?', r'\1', url or '').rstrip('?&')
    for task in tasks:
        tag=((task.get('data') or {}).get('tag') or '|')
        loc,kw=tag.split('|',1)
        result=(task.get('result') or [{}])[0] if task.get('result') else {}
        items=result.get('items') or []
        innate=[]; competitors=[]; ai_items=[]; local_pack=[]
        for item in items:
            b=blob(item); typ=item.get('type')
            if typ and any(x in typ for x in ['ai','answer','featured']): ai_items.append({'type':typ,'rank_group':item.get('rank_group'),'title':item.get('title') or item.get('text') or item.get('name')})
            if typ and 'local' in typ: local_pack.append({'type':typ,'title':item.get('title') or item.get('name'),'rank_group':item.get('rank_group'),'domain':item.get('domain')})
            if 'innatefurniture.co.nz' in b or 'innate furniture' in b:
                innate.append({'type':typ,'rank_group':item.get('rank_group'),'rank_absolute':item.get('rank_absolute'),'title':item.get('title') or item.get('name'),'url':clean(item.get('url')),'domain':item.get('domain')})
            elif typ=='organic' and len(competitors)<5:
                competitors.append({'rank_group':item.get('rank_group'),'title':item.get('title'),'domain':item.get('domain'),'url':clean(item.get('url'))})
        organic=[x for x in innate if x.get('type')=='organic']
        best=min(organic,key=lambda x:x.get('rank_group') or 999) if organic else (innate[0] if innate else None)
        summary.append({'location':loc,'keyword':kw,'status':task.get('status_message'),'rank':best.get('rank_group') if best else None,'rank_absolute':best.get('rank_absolute') if best else None,'title':best.get('title') if best else None,'url':best.get('url') if best else None,'innate_results':innate[:5],'competitors':competitors,'ai_items':ai_items[:3],'local_pack':local_pack[:5]})
    write_json('dataforseo/latest-rank-benchmark/raw.json', {'generated_at':dt.datetime.now().isoformat(),'cost':total_cost,'errors':errors,'tasks':tasks})
    write_json('dataforseo/latest-rank-benchmark/summary.json', {'generated_at':dt.datetime.now().isoformat(),'cost':total_cost,'errors':errors,'summary':summary})
    lines=['# DataForSEO live rank / AI / local visibility benchmark','',f'Generated: {dt.datetime.now().isoformat()}',f'Cost: {total_cost}',f'Rows: {len(summary)}',f'Errors: {len(errors)}','','| Location | Keyword | Innate rank | Innate URL/title | Top competitors |','|---|---|---:|---|---|']
    for r in summary:
        comps=', '.join([f"#{c.get('rank_group')} {c.get('domain')}" for c in r.get('competitors',[])[:3]])
        lines.append(f"| {r['location']} | {r['keyword']} | {r.get('rank') or 'not top 20'} | {(r.get('title') or '')[:70]} {(r.get('url') or '')[:80]} | {comps} |")
    write_text('dataforseo/latest-rank-benchmark/report.md', '\n'.join(lines)+'\n')

def page_speed_status():
    # Do not install tools during read-only scan; record current capability.
    lighthouse=shutil.which('lighthouse')
    npx=shutil.which('npx')
    write_text('pagespeed/tool.txt', f"lighthouse={'available' if lighthouse else 'missing'}; npx={'available' if npx else 'missing'}")
    write_json('pagespeed/status.json', {'lighthouse_path':lighthouse,'npx_path':npx,'note':'No install or live change attempted during read-only scan.'})

def run_visual():
    routes_file=RUN_DIR/'context/priority-routes.txt'
    routes_file.parent.mkdir(parents=True, exist_ok=True)
    routes_file.write_text('\n'.join(PRIORITY_ROUTES)+'\n')
    out=str(RUN_DIR/'visual/rendered-priority')
    run_cmd('visual_rendered_priority', ['npm','run','audit:website-visual','--','--base-url',BASE,'--urls-file',str(routes_file),'--out',out,'--soft','--timeout','60000'], timeout=600)

def make_manifest(statuses):
    files=[]
    for p in RUN_DIR.rglob('*'):
        if p.is_file():
            files.append({'path':str(p.relative_to(RUN_DIR)), 'bytes':p.stat().st_size})
    write_json('evidence-manifest.json', {'run_dir':str(RUN_DIR),'generated_at':dt.datetime.now().isoformat(),'live_touched':False,'statuses':statuses,'files':files})

def main():
    load_env()
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    (pathlib.Path('/tmp/innate_master_scan_run_dir')).write_text(str(RUN_DIR))
    statuses=[]
    def step(name, fn):
        try:
            fn(); statuses.append({'step':name,'ok':True})
        except Exception as e:
            statuses.append({'step':name,'ok':False,'error':type(e).__name__,'detail':str(e)[:1000]})
            write_json(f'context/errors/{name}.json', statuses[-1])
    step('google_access_check', lambda: read_json_from_cmd('google_access_check',[str(PROFILE/'bin/website_google_access.py'),'check'],'context/google_access_check.json',120))
    step('master_collectors', lambda: run_cmd('master_collectors',[sys.executable, str(ROOT/'scripts/master_deep_scan_collectors_20260628.py')], timeout=600))
    step('ga4_snapshot', lambda: read_json_from_cmd('ga4_snapshot',[sys.executable, str(ROOT/'scripts/ga4_extract_useful_snapshot.py')],'ga4/ga4_useful_snapshot.json',300))
    step('bing_check', lambda: read_json_from_cmd('bing_check',[str(PROFILE/'bin/website_bing_webmaster_access.py'),'check'],'bing/bing_check.json',120))
    step('merchant_check', lambda: read_json_from_cmd('merchant_check',[str(PROFILE/'bin/website_merchant_access.py'),'check'],'merchant/merchant_check.json',120))
    step('gbp_check', lambda: read_json_from_cmd('gbp_check',[str(PROFILE/'bin/website_gbp_access.py'),'check'],'gbp/gbp_check.json',120))
    step('shopify_admin_readonly', shopify_readonly)
    step('dataforseo_rank', dataforseo_rank)
    step('visual_audit', run_visual)
    step('pagespeed_status', page_speed_status)
    make_manifest(statuses)
    print(json.dumps({'run_dir':str(RUN_DIR),'statuses':statuses}, indent=2))

if __name__ == '__main__':
    main()
