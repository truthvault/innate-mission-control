#!/usr/bin/env python3
from __future__ import annotations
import datetime, difflib, json, os, pathlib, urllib.parse, urllib.request, re, time, html
LIVE_THEME_ID=141308166203
KEY='sections/benchtops-hero.liquid'
STAMP=datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
BACKUP=pathlib.Path(f'/Users/mack-mini/innate-mission-control/backups/shopify-theme/{STAMP}_live_boardroom_hero_support_line_{LIVE_THEME_ID}')
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
    body=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request(base+path,data=body,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=90) as resp:
        raw=resp.read().decode(); return json.loads(raw) if raw else {}
def get_asset(key):
    q=urllib.parse.urlencode({'asset[key]':key}); return req('GET',f'/themes/{LIVE_THEME_ID}/assets.json?{q}')['asset']['value']
def put_asset(key,val): return req('PUT',f'/themes/{LIVE_THEME_ID}/assets.json',{'asset':{'key':key,'value':val}})

themes=req('GET','/themes.json')['themes']; live=next((t for t in themes if int(t['id'])==LIVE_THEME_ID),None)
if not live or live.get('role')!='main': raise SystemExit('Theme not live main')
before=get_asset(KEY)
(BACKUP/'before_benchtops-hero.liquid').write_text(before,encoding='utf-8')
style_marker='{%- comment -%} healthscan-cache-bust-20260604 {%- endcomment -%}\n'
style=style_marker+'''<style>
  .bench-hero__support-line {
    margin: .85rem 0 0;
    color: rgba(255, 255, 255, .86);
    font-size: clamp(.92rem, 1vw, 1rem);
    line-height: 1.55;
    max-width: min(44rem, 100%);
  }
</style>
'''
if '.bench-hero__support-line' not in before:
    after=before.replace(style_marker,style,1)
else:
    after=before
old='''          {%- if section.settings.secondary_cta_label != blank and section.settings.secondary_cta_url != blank -%}
            <a class="bench-hero__btn bench-hero__btn--secondary" href="{{ section.settings.secondary_cta_url }}">{{ section.settings.secondary_cta_label | escape }}</a>
          {%- endif -%}
        </div>
      {%- endif -%}'''
new='''          {%- if section.settings.secondary_cta_label != blank and section.settings.secondary_cta_url != blank -%}
            {%- if section.settings.secondary_cta_label.size > 60 -%}
              {%- assign secondary_support_line = section.settings.secondary_cta_label -%}
            {%- else -%}
              <a class="bench-hero__btn bench-hero__btn--secondary" href="{{ section.settings.secondary_cta_url }}">{{ section.settings.secondary_cta_label | escape }}</a>
            {%- endif -%}
          {%- endif -%}
        </div>
        {%- if secondary_support_line != blank -%}
          <p class="bench-hero__support-line">{{ secondary_support_line | escape }}</p>
        {%- endif -%}
      {%- endif -%}'''
if old in after:
    after=after.replace(old,new,1)
elif new in after:
    pass
else:
    raise SystemExit('CTA block anchor missing')
(BACKUP/'after_benchtops-hero.liquid').write_text(after,encoding='utf-8')
(BACKUP/'diff_benchtops-hero.patch').write_text('\n'.join(difflib.unified_diff(before.splitlines(),after.splitlines(),fromfile='before/'+KEY,tofile='after/'+KEY,lineterm='')),encoding='utf-8')
put_asset(KEY,after)
readback=get_asset(KEY)
(BACKUP/'readback_benchtops-hero.liquid').write_text(readback,encoding='utf-8')
if readback != after: raise SystemExit('Readback mismatch')
# verify public has support line class, no secondary long button anchor, and no title/meta regression
url='https://innatefurniture.co.nz/pages/boardroom-tables?boardroom_support_verify='+str(int(time.time()))
r=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Cache-Control':'no-cache'})
with urllib.request.urlopen(r,timeout=45) as resp:
    raw=resp.read().decode('utf-8','replace'); server=resp.headers.get('server-timing',''); status=resp.status
summary={
 'ok': status==200 and 'bench-hero__support-line' in raw and 'Custom timber boardroom tables' in raw and 'Boardroom Tables NZ | Custom Timber &amp; Power/Data | Innate' in raw,
 'status': status,
 'theme_ok': f'theme;desc="{LIVE_THEME_ID}"' in server,
 'backup': str(BACKUP),
 'changed': [KEY],
 'support_line_class_present': 'bench-hero__support-line' in raw,
 'title_present': 'Boardroom Tables NZ | Custom Timber &amp; Power/Data | Innate' in raw,
 'h1_present': 'Custom timber boardroom tables' in raw,
}
(BACKUP/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
if not summary['ok']: raise SystemExit(2)
