#!/usr/bin/env python3
from __future__ import annotations
import html, json, os, pathlib, re, time, urllib.parse, urllib.request
API_VERSION='2025-01'
LIVE_THEME_ID='141308166203'
for envp in ['/Users/mack-mini/.hermes/profiles/website/.env','/Users/mack-mini/.env','/Users/mack-mini/.hermes/.env']:
    p=pathlib.Path(envp)
    if p.exists():
        for line in p.read_text().splitlines():
            if line and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
store=(os.environ.get('SHOPIFY_STORE') or '').replace('https://','').rstrip('/')
token=os.environ.get('SHOPIFY_ADMIN_API_TOKEN')
BASE=f'https://{store}/admin/api/{API_VERSION}'
HEADERS={'X-Shopify-Access-Token':token,'Content-Type':'application/json'}
backup=sorted(pathlib.Path('/Users/mack-mini/innate-mission-control/backups/shopify-products').glob('*_bar_leaner_ctr_batch'), key=lambda p:p.stat().st_mtime)[-1]
expected={
 'bar-leaner':{
  'title':'Bar Leaner',
  'seo_title':'Bar Leaner NZ | Custom Timber & Steel | Innate',
  'seo_description':'Custom timber and steel bar leaner made in Christchurch for homes, offices, cafés and shared spaces. Choose timber, length and finish. NZ-wide delivery.',
  'phrases':['A made-to-order timber and steel bar leaner for homes, office kitchens, clubrooms, cafés and shared hospitality spaces','Order timber samples']},
 'exterior-bar-leaner':{
  'title':'Outdoor Hardwood Bar Leaner',
  'seo_title':'Outdoor Bar Leaner NZ | Hardwood & Steel | Innate',
  'seo_description':'Outdoor hardwood bar leaner made to order for patios, cafés, clubrooms and covered outdoor spaces. Custom sizes, steel frame and NZ-wide delivery.',
  'phrases':['A made-to-order outdoor hardwood and steel bar leaner for patios','Outdoor timber is a natural material and will require normal care and maintenance']}
}

def api(path):
    req=urllib.request.Request(BASE+path,headers=HEADERS)
    with urllib.request.urlopen(req,timeout=90) as resp: return json.loads(resp.read().decode())

def product(handle):
    qs=urllib.parse.urlencode({'handle':handle})
    ps=api('/products.json?'+qs)['products']
    p=ps[0]
    p['metafields']=api(f'/products/{p["id"]}/metafields.json?limit=250')['metafields']
    return p

def public(handle):
    url=f'https://innatefurniture.co.nz/products/{handle}?verify={int(time.time())}'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=90) as resp:
        return resp.status,resp.headers,resp.read().decode('utf-8','replace')

def js(handle):
    url=f'https://innatefurniture.co.nz/products/{handle}.js?verify={int(time.time())}'
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=90) as resp: return json.loads(resp.read().decode('utf-8','replace'))

def meta_description(raw):
    for tag in re.findall(r'<meta\b[^>]*>', raw, flags=re.I|re.S):
        if re.search(r'\bname\s*=\s*(["\'])description\1', tag, re.I):
            m=re.search(r'\bcontent\s*=\s*(["\'])(.*?)\1', tag, re.I|re.S)
            return html.unescape(m.group(2)) if m else ''
    return ''

def title(raw):
    m=re.search(r'<title>(.*?)</title>',raw,re.S|re.I)
    return html.unescape(re.sub(r'\s+',' ',m.group(1)).strip()) if m else ''

def h1(raw):
    m=re.search(r'<h1[^>]*>(.*?)</h1>',raw,re.S|re.I)
    return html.unescape(re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',m.group(1))).strip()) if m else ''

def norm(raw):
    return re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',raw))).strip()

out={'backup_dir':str(backup),'products':{}}
all_ok=True
for handle,exp in expected.items():
    p=product(handle)
    (backup/f'after_{handle}_product_full.json').write_text(json.dumps(p,indent=2),encoding='utf-8')
    mfs={(m['namespace'],m['key']):m.get('value') for m in p['metafields']}
    status,headers,raw=public(handle)
    j=js(handle)
    public_title=title(raw); public_desc=meta_description(raw); text=norm(raw); jdesc=norm(j.get('description',''))
    checks={
      'admin_title_expected': p['title']==exp['title'],
      'admin_seo_title_exact': mfs.get(('global','title_tag'))==exp['seo_title'],
      'admin_seo_description_exact': mfs.get(('global','description_tag'))==exp['seo_description'],
      'admin_body_phrases_present': all(ph in norm(p.get('body_html','')) for ph in exp['phrases']),
      'public_status_200': status==200,
      'public_live_theme_header': LIVE_THEME_ID in headers.get('server-timing',''),
      'public_title_exact': public_title==exp['seo_title'],
      'public_description_exact': public_desc==exp['seo_description'],
      'public_body_phrases_present': all(ph in text for ph in exp['phrases']),
      'product_js_title_expected': j.get('title')==exp['title'],
      'product_js_body_phrases_present': all(ph in jdesc for ph in exp['phrases']),
    }
    all_ok=all_ok and all(checks.values())
    out['products'][handle]={'url':f'https://innatefurniture.co.nz/products/{handle}','product_id':p['id'],'status':p['status'],'admin_title':p['title'],'public_title':public_title,'public_description':public_desc,'public_h1':h1(raw),'checks':checks}
(backup/'verification.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(out,indent=2))
if not all_ok: raise SystemExit(1)
