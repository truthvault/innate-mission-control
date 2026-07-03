#!/opt/homebrew/bin/python3.11
from __future__ import annotations
import csv, datetime as dt, html, json, math, os, pathlib, re, sys, time, urllib.parse, urllib.request
from html.parser import HTMLParser
from typing import Any

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PROFILE_HOME = pathlib.Path(os.environ.get('HERMES_HOME', '/Users/mack-mini/.hermes/profiles/website'))
TOKEN_PATH = PROFILE_HOME / 'google_website_readonly_token.json'
SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/webmasters.readonly',
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/drive',
]
SITE = 'sc-domain:innatefurniture.co.nz'
GA4_PROPERTY = 'properties/385933347'
BASE_URL = 'https://innatefurniture.co.nz'
RUN_STAMP = dt.datetime.now().strftime('%Y-%m-%d_%H%M%S')
OUT = pathlib.Path(f'/Users/mack-mini/innate-mission-control/seo/ctr-query-sprints/{RUN_STAMP}')
OUT.mkdir(parents=True, exist_ok=True)

BRAND_TERMS = {'innate','innate furniture','inate furniture','inmate furniture'}

PAGE_LABELS = {
    '/collections/dining-tables': 'Dining collection',
    '/pages/timber-panels': 'Timber panels / benchtops',
    '/pages/boardroom-tables': 'Boardroom tables',
    '/pages/commercial-1': 'Commercial furniture',
    '/pages/hospitality-furniture': 'Hospitality furniture',
    '/collections/outdoor-furniture': 'Outdoor furniture',
}

class HeadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_title = False
        self.title = ''
        self.meta_desc = ''
        self.h1s: list[str] = []
        self._in_h1 = False
        self.canonical = ''
    def handle_starttag(self, tag, attrs):
        d = {k.lower(): (v or '') for k,v in attrs}
        if tag == 'title': self.in_title = True
        if tag == 'meta' and d.get('name','').lower() == 'description': self.meta_desc = d.get('content','')
        if tag == 'link' and d.get('rel','').lower() == 'canonical': self.canonical = d.get('href','')
        if tag == 'h1': self._in_h1 = True; self.h1s.append('')
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'h1': self._in_h1 = False
    def handle_data(self, data):
        if self.in_title: self.title += data
        if self._in_h1 and self.h1s: self.h1s[-1] += data

def creds() -> Credentials:
    c = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if c.expired and c.refresh_token:
        c.refresh(Request())
        payload = json.loads(c.to_json()); payload['scopes'] = SCOPES
        TOKEN_PATH.write_text(json.dumps(payload, indent=2))
    if not c.valid: raise SystemExit('Google token invalid')
    return c

def gsc_rows(start: dt.date, end: dt.date, dimensions: list[str], row_limit=25000, start_row=0, filters=None) -> list[dict[str, Any]]:
    svc = build('searchconsole','v1', credentials=CREDS, cache_discovery=False)
    body: dict[str, Any] = {
        'startDate': start.isoformat(),
        'endDate': end.isoformat(),
        'dimensions': dimensions,
        'rowLimit': row_limit,
        'startRow': start_row,
        'dataState': 'final',
    }
    if filters:
        body['dimensionFilterGroups'] = [{'filters': filters}]
    resp = svc.searchanalytics().query(siteUrl=SITE, body=body).execute()
    rows=[]
    for r in resp.get('rows', []):
        item = {dim: key for dim, key in zip(dimensions, r.get('keys', []))}
        item.update({k: r.get(k) for k in ['clicks','impressions','ctr','position']})
        rows.append(item)
    return rows

def ga4_report(days=90) -> dict[str, Any]:
    svc = build('analyticsdata','v1beta', credentials=CREDS, cache_discovery=False)
    end = dt.date.today() - dt.timedelta(days=1)
    start = end - dt.timedelta(days=days-1)
    body = {
        'dateRanges': [{'startDate': start.isoformat(), 'endDate': end.isoformat()}],
        'dimensions': [{'name':'landingPagePlusQueryString'}, {'name':'sessionDefaultChannelGroup'}],
        'metrics': [{'name':'sessions'}, {'name':'engagedSessions'}, {'name':'screenPageViews'}, {'name':'eventCount'}],
        'dimensionFilter': {'filter': {'fieldName':'sessionDefaultChannelGroup', 'stringFilter': {'matchType':'EXACT', 'value':'Organic Search'}}},
        'limit': 1000,
    }
    return svc.properties().runReport(property=GA4_PROPERTY, body=body).execute()

def normalize_path(url_or_path: str) -> str:
    if url_or_path.startswith('http'):
        p = urllib.parse.urlparse(url_or_path)
        return p.path or '/'
    return url_or_path.split('?',1)[0] or '/'

def cluster(q: str) -> str:
    s = q.lower()
    if any(b in s for b in ['innate','inate','inmate furniture']): return 'brand'
    if any(t in s for t in ['dining','table','rimu table','solid wood table','wooden table']): return 'dining'
    if any(t in s for t in ['benchtop','bench top','butcher','timber panel','wood panel']): return 'benchtops/panels'
    if any(t in s for t in ['boardroom','conference']): return 'boardroom'
    if any(t in s for t in ['commercial','hospitality','restaurant','cafe','bar leaner']): return 'commercial/hospitality'
    if any(t in s for t in ['outdoor','kwila','decking']): return 'outdoor'
    if any(t in s for t in ['rimu','totara','beech','timber','wood']): return 'timber/materials'
    return 'other'

def fetch_page(path: str) -> dict[str, Any]:
    url = BASE_URL + path + ('&' if '?' in path else '?') + f'ctr_probe={int(time.time())}'
    req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0 Innate CTR query sprint', 'Cache-Control':'no-cache'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode('utf-8', errors='replace')
            status = r.status; final = r.geturl(); st = r.headers.get('server-timing','')
    except Exception as e:
        return {'path': path, 'url': url, 'error': str(e)}
    parser = HeadParser(); parser.feed(raw[:300000])
    body_text = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', raw))[:5000]
    return {
        'path': path,
        'url': url,
        'status': status,
        'finalUrl': final,
        'serverTiming': st,
        'title': html.unescape(parser.title.strip()),
        'metaDescription': html.unescape(parser.meta_desc.strip()),
        'canonical': parser.canonical,
        'h1s': [html.unescape(h.strip()) for h in parser.h1s if h.strip()],
        'containsEnquiry': 'enquiry' in body_text.lower() or 'quote' in body_text.lower(),
    }

def score(row: dict[str, Any]) -> float:
    # Opportunity: many impressions, weak CTR, near enough to move, non-brand.
    imps = row['impressions']; ctr = row['ctr']; pos = row['position']
    if imps < 20 or pos > 25: return 0
    expected_ctr = 0.22 if pos <= 3 else 0.08 if pos <= 8 else 0.035 if pos <= 15 else 0.018
    gap = max(expected_ctr - ctr, 0)
    return imps * gap / max(math.sqrt(max(pos,1)),1)

def classify_action(page: str, qs: list[dict[str, Any]], meta: dict[str, Any]) -> tuple[str,str]:
    clusters = [cluster(q['query']) for q in qs]
    dominant = max(set(clusters), key=clusters.count) if clusters else 'other'
    h1 = (meta.get('h1s') or [''])[0]
    title = meta.get('title','')
    desc = meta.get('metaDescription','')
    if dominant in ['commercial/hospitality','boardroom']:
        return ('Snippet/title alignment', 'Make the SERP promise more specific to commercial buyers: project scale, NZ-made custom tables/furniture, and easy enquiry path.')
    if dominant == 'dining':
        return ('Dining SERP promise', 'Clarify custom solid timber / NZ-made / shape or seating intent in title/meta, then add one concise above-fold line that helps broad searchers choose a path.')
    if dominant == 'benchtops/panels':
        return ('Configurator intent match', 'Make title/meta and intro promise the live quote/configurator path more plainly, because the searcher likely wants a fast size/material answer.')
    if dominant == 'outdoor':
        return ('Outdoor intent split', 'Separate outdoor table/furniture intent from material/Kwila education and ensure snippet does not overpromise maintenance-free performance.')
    if dominant == 'timber/materials':
        return ('Material authority', 'Use the ranking page as material authority with a clear onward path to products/configurator, not just broad timber education.')
    return ('Query ownership cleanup', 'Decide whether this page should own these queries; if yes, tighten title/meta/H1 alignment, if no, add internal path to the better owner.')

CREDS = creds()
end = dt.date.today() - dt.timedelta(days=2)  # GSC final data lag cushion
w28_start = end - dt.timedelta(days=27)
w90_start = end - dt.timedelta(days=89)
prev_end = w28_start - dt.timedelta(days=1)
prev_start = prev_end - dt.timedelta(days=27)

windows = {'28d': (w28_start,end), 'prev28d': (prev_start,prev_end), '90d': (w90_start,end)}
manifest = {'runStamp': RUN_STAMP, 'outDir': str(OUT), 'site': SITE, 'ga4Property': GA4_PROPERTY, 'windows': {k:[a.isoformat(),b.isoformat()] for k,(a,b) in windows.items()}, 'liveTouched': False}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

raw = {}
for name,(start,endd) in windows.items():
    raw[f'gsc_query_page_{name}'] = gsc_rows(start,endd,['query','page'])
    raw[f'gsc_pages_{name}'] = gsc_rows(start,endd,['page'])
    raw[f'gsc_queries_{name}'] = gsc_rows(start,endd,['query'])
    for key, rows in list(raw.items()):
        if key.endswith(name):
            (OUT / f'{key}.json').write_text(json.dumps(rows, indent=2), encoding='utf-8')

ga4 = ga4_report(90)
(OUT / 'ga4_organic_landing_90d.json').write_text(json.dumps(ga4, indent=2), encoding='utf-8')

rows90 = raw['gsc_query_page_90d']
# aggregate per normalised path + query first; GSC can emit UTM/variant URL rows.
query_by_path: dict[tuple[str,str], dict[str, Any]] = {}
for r in rows90:
    path = normalize_path(r['page']); q = r['query']
    if cluster(q) == 'brand':
        continue
    key = (path, q)
    agg = query_by_path.setdefault(key, {'query': q, 'page': BASE_URL + path if path.startswith('/') else r['page'], 'path': path, 'clicks':0, 'impressions':0, 'weighted_pos_num':0.0})
    agg['clicks'] += r['clicks']; agg['impressions'] += r['impressions']; agg['weighted_pos_num'] += r['position'] * r['impressions']
for agg in query_by_path.values():
    agg['ctr'] = agg['clicks']/agg['impressions'] if agg['impressions'] else 0
    agg['position'] = agg['weighted_pos_num']/agg['impressions'] if agg['impressions'] else 0
    agg['cluster'] = cluster(agg['query'])
    agg['opportunityScore'] = round(score(agg),3)

# aggregate per page and keep top query opportunities.
by_page: dict[str, dict[str, Any]] = {}
for rr in query_by_path.values():
    path = rr['path']; page = rr['page']
    rec = by_page.setdefault(path, {'path': path, 'page': page, 'clicks':0, 'impressions':0, 'weighted_pos_num':0.0, 'queries': [], 'opportunityScore':0.0})
    rec['clicks'] += rr['clicks']; rec['impressions'] += rr['impressions']; rec['weighted_pos_num'] += rr['position'] * rr['impressions']
    rec['queries'].append(rr); rec['opportunityScore'] += rr['opportunityScore']
for rec in by_page.values():
    rec['ctr'] = rec['clicks']/rec['impressions'] if rec['impressions'] else 0
    rec['position'] = rec['weighted_pos_num']/rec['impressions'] if rec['impressions'] else None
    rec['queries'] = sorted(rec['queries'], key=lambda x: x['opportunityScore'], reverse=True)[:15]
    rec['opportunityScore'] = round(rec['opportunityScore'],3)

priority = [r for r in by_page.values() if r['impressions'] >= 50 and r['opportunityScore'] > 0]
priority = sorted(priority, key=lambda r: r['opportunityScore'], reverse=True)[:12]

# add page-level GSC comparison 28d vs previous.
def page_metrics(rows):
    d={}
    for r in rows:
        path=normalize_path(r['page'])
        agg=d.setdefault(path, {'clicks':0, 'impressions':0, 'weighted_pos_num':0.0})
        agg['clicks'] += r.get('clicks',0); agg['impressions'] += r.get('impressions',0); agg['weighted_pos_num'] += r.get('position',0) * r.get('impressions',0)
    for agg in d.values():
        agg['ctr'] = agg['clicks']/agg['impressions'] if agg['impressions'] else 0
        agg['position'] = agg['weighted_pos_num']/agg['impressions'] if agg['impressions'] else None
    return d
p28=page_metrics(raw['gsc_pages_28d']); pp=page_metrics(raw['gsc_pages_prev28d'])
for rec in priority:
    path=rec['path']; cur=p28.get(path,{}); old=pp.get(path,{})
    rec['change28']={
        'clicks': cur.get('clicks',0), 'prevClicks': old.get('clicks',0),
        'impressions': cur.get('impressions',0), 'prevImpressions': old.get('impressions',0),
        'ctr': cur.get('ctr'), 'prevCtr': old.get('ctr'),
        'position': cur.get('position'), 'prevPosition': old.get('position')
    }

page_metas = {}
for rec in priority[:10]:
    page_metas[rec['path']] = fetch_page(rec['path'])
(OUT / 'page_meta_readbacks.json').write_text(json.dumps(page_metas, indent=2), encoding='utf-8')

briefs = []
for rec in priority:
    meta = page_metas.get(rec['path'], {})
    action, why = classify_action(rec['path'], rec['queries'], meta)
    briefs.append({**rec, 'meta': meta, 'recommendedActionType': action, 'recommendedDraftDirection': why})
(OUT / 'ctr_opportunity_briefs.json').write_text(json.dumps(briefs, indent=2), encoding='utf-8')

# CSV for quick sorting.
with (OUT / 'ctr_opportunity_briefs.csv').open('w', newline='', encoding='utf-8') as f:
    w=csv.writer(f)
    w.writerow(['rank','path','label','clicks90','impressions90','ctr90','position90','score','top_queries','action'])
    for i,b in enumerate(briefs,1):
        w.writerow([i,b['path'],PAGE_LABELS.get(b['path'],''),b['clicks'],b['impressions'],round(b['ctr']*100,2),round(b['position'] or 0,1),b['opportunityScore'],'; '.join(f"{q['query']} ({q['impressions']} imp, {q['ctr']*100:.1f}% CTR, pos {q['position']:.1f})" for q in b['queries'][:5]),b['recommendedActionType']])

# GA4 organic landing simplification.
ga4_rows=[]
for r in ga4.get('rows',[]):
    dims=[v.get('value','') for v in r.get('dimensionValues',[])]
    mets=[float(v.get('value','0')) for v in r.get('metricValues',[])]
    ga4_rows.append({'landing': dims[0] if dims else '', 'channel': dims[1] if len(dims)>1 else '', 'sessions': mets[0] if mets else 0, 'engagedSessions': mets[1] if len(mets)>1 else 0, 'views': mets[2] if len(mets)>2 else 0, 'eventCount': mets[3] if len(mets)>3 else 0})
ga4_rows=sorted(ga4_rows, key=lambda x:x['sessions'], reverse=True)[:30]
(OUT / 'ga4_organic_landing_90d_simplified.json').write_text(json.dumps(ga4_rows, indent=2), encoding='utf-8')

report = []
report.append(f"# CTR/query ownership sprint — {RUN_STAMP}\n")
report.append("Status: read-only brief. Live touched: no.\n")
report.append(f"GSC windows: 90d {w90_start} to {end}; 28d {w28_start} to {end}; previous 28d {prev_start} to {prev_end}.\n")
report.append("## Top CTR/query opportunities\n")
for i,b in enumerate(briefs[:8],1):
    meta=b.get('meta',{})
    report.append(f"### {i}. {b['path']}\n")
    report.append(f"- 90d: {b['impressions']:,} impressions, {b['clicks']:,} clicks, {b['ctr']*100:.2f}% CTR, avg pos {b['position']:.1f}; score {b['opportunityScore']}.\n")
    c=b['change28']; report.append(f"- 28d vs prev: {c['impressions']:,} vs {c['prevImpressions']:,} impressions; {c['clicks']:,} vs {c['prevClicks']:,} clicks; CTR {((c['ctr'] or 0)*100):.2f}% vs {((c['prevCtr'] or 0)*100):.2f}%.\n")
    report.append(f"- Current title: {meta.get('title','not fetched')}\n")
    report.append(f"- Current meta: {meta.get('metaDescription','not fetched')}\n")
    report.append(f"- H1: {', '.join(meta.get('h1s',[])[:2]) or 'not fetched'}\n")
    report.append("- Query pressure:\n")
    for q in b['queries'][:6]:
        report.append(f"  - `{q['query']}` — {q['impressions']} imp, {q['clicks']} clicks, CTR {q['ctr']*100:.2f}%, pos {q['position']:.1f}, cluster {q['cluster']}\n")
    report.append(f"- Draft direction: **{b['recommendedActionType']}** — {b['recommendedDraftDirection']}\n")
report.append("## GA4 organic landing context\n")
for r in ga4_rows[:12]:
    report.append(f"- {r['landing']}: {int(r['sessions'])} organic sessions, {int(r['engagedSessions'])} engaged, {int(r['views'])} views, {int(r['eventCount'])} events\n")
report.append("\n## Recommended next sprint order\n")
for i,b in enumerate(briefs[:5],1):
    report.append(f"{i}. {b['path']} — {b['recommendedActionType']} ({b['impressions']:,} non-brand 90d impressions, {b['ctr']*100:.2f}% CTR). Draft only first; live meta/copy changes require approval.\n")
report.append("\n## Evidence files\n")
for name in ['ctr_opportunity_briefs.json','ctr_opportunity_briefs.csv','page_meta_readbacks.json','ga4_organic_landing_90d_simplified.json']:
    report.append(f"- {name}\n")
(OUT / 'report.md').write_text(''.join(report), encoding='utf-8')
print(json.dumps({'ok': True, 'outDir': str(OUT), 'top': briefs[:5], 'ga4Top': ga4_rows[:5]}, indent=2))
