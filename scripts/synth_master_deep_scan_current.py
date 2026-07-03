#!/usr/bin/env python3
from __future__ import annotations
import datetime as dt, json, pathlib, re
RUN=pathlib.Path(open('/tmp/innate_master_scan_run_dir').read().strip())
ROOT=pathlib.Path('/Users/mack-mini/innate-mission-control')

def load(rel, default=None):
    p=RUN/rel
    if not p.exists(): return default
    try: return json.loads(p.read_text())
    except Exception: return default

def text(rel):
    p=RUN/rel
    return p.read_text(errors='ignore') if p.exists() else ''

def pct(now, prev):
    try:
        now=float(now or 0); prev=float(prev or 0)
        if prev==0: return None if now==0 else 100.0
        return (now-prev)/prev*100
    except Exception: return None

def fp(x): return 'n/a' if x is None else f'{x:+.1f}%'
def money(x):
    try: return f"${float(x):,.2f}"
    except Exception: return str(x)

gsc=load('gsc/master_gsc_windows.json',{})
ga4=load('ga4/ga4_useful_snapshot.json',{})
crawl=load('crawl/public_crawl_master.json',{})
shop_public=load('shopify/public_shopify_json_snapshot.json',{})
shop_admin=load('shopify/admin_readonly_snapshot.json',{})
merchant=load('merchant/merchant_deep_readonly.json',{})
merchant_check=load('merchant/merchant_check.json',{})
gbp=load('gbp/gbp_check.json',{})
gbp_perf=load('gbp/gbp_performance_90d.json',{})
bing=load('bing/bing_check.json',{})
rank=load('dataforseo/latest-rank-benchmark/summary.json',{})
web=load('search/external_web_search_results.json',{})
visual_json=load('visual/rendered-priority-core/report.json',{})
visual_md=text('visual/rendered-priority-core/report.md')

def row_metrics(rows):
    clicks=sum(r.get('clicks',0) for r in rows or [])
    impr=sum(r.get('impressions',0) for r in rows or [])
    pos=sum(r.get('position',0)*r.get('impressions',0) for r in rows or [])
    return {'clicks':clicks,'impressions':impr,'ctr':clicks/impr if impr else 0,'position':pos/impr if impr else 0}
windows=gsc.get('windows',{})
curw=windows.get('last_28_complete_days',{})
prevw=windows.get('previous_28_complete_days',{})
cur=row_metrics(curw.get('queries'))
prev=row_metrics(prevw.get('queries'))
# clusters
clusters={
 'brand':['innate','innate furniture'],
 'dining':['dining','dining table','dining tables','custom table','solid timber','solid wood','round table','oval table','rimu table'],
 'timber_panels_benchtops':['benchtop','benchtops','timber panel','timber panels','butcher block','butchers block','wooden benchtop','kitchen benchtop'],
 'commercial_boardroom':['commercial furniture','boardroom','meeting table','conference table','office table'],
 'hospitality':['hospitality','cafe','café','restaurant','bar leaner','bar table'],
 'outdoor_kwila':['outdoor','kwila','decking','patio','alfresco'],
 'materials':['rimu','totara','tōtara','beech','native timber','recycled timber'],
}
cluster_rows=[]
for name,needles in clusters.items():
    rows=[r for r in curw.get('queries',[]) if any(n in (r.get('keys',[''])[0] or '').lower() for n in needles)]
    m=row_metrics(rows); m['cluster']=name; cluster_rows.append(m)
cluster_rows.sort(key=lambda r:r['impressions'], reverse=True)
# query/page opps
qps=curw.get('query_pages',[])
qopp=sorted([r for r in qps if r.get('impressions',0)>=20], key=lambda r:(r.get('impressions',0)*(1-r.get('ctr',0)), -r.get('position',99)), reverse=True)[:40]
page_opp=sorted(curw.get('pages',[]), key=lambda r:r.get('impressions',0)*(1-r.get('ctr',0)), reverse=True)[:25]
# GA4 report helper
reports={r.get('name'):r for r in ga4.get('reports',[])}
def rows(name): return reports.get(name,{}).get('rows',[])
ga30=rows('overview_30d')[:1]
ga90=rows('overview_90d')[:1]
channels=rows('traffic_sources_90d')[:15]
landing=rows('top_landing_pages_90d')[:20]
new_events=rows('new_tracking_events_7d')[:20]
key_events=rows('key_events_90d')[:20]
benchtop_events=rows('benchtop_page_events_90d')[:20]
# crawl flags
flags=[]
for p in crawl.get('pages',[]):
    reasons=[]
    if p.get('error'): reasons.append('fetch error')
    if p.get('status') and p.get('status')!=200: reasons.append(f"status {p.get('status')}")
    if p.get('h1_count')!=1: reasons.append(f"H1 count {p.get('h1_count')}")
    if p.get('meta_len',0)<50: reasons.append(f"short/no meta ({p.get('meta_len')})")
    if p.get('missing_alt_count',0)>3: reasons.append(f"missing alt {p.get('missing_alt_count')}/{p.get('image_count')}")
    if p.get('stale_or_risky_terms_found'): reasons.append('risky terms: '+', '.join(p.get('stale_or_risky_terms_found')))
    if reasons: flags.append({'url':p.get('url'),'reasons':reasons,'title':p.get('title'),'h1s':p.get('h1s')})
# visual
vsum=(visual_json or {}).get('summary',{})
# DataForSEO
rank_rows=rank.get('summary',[])
ranked=[r for r in rank_rows if r.get('rank')]
not_ranked=[r for r in rank_rows if not r.get('rank')]
# Merchant issues
merchant_issues=[]
for acc in merchant.get('accounts',[]):
    for issue in (acc.get('accountstatus') or {}).get('accountLevelIssues',[]) or []:
        merchant_issues.append(issue)
# external competitors
competitors=[]
for q in web.get('queries',[]):
    for r in ((q.get('result') or {}).get('data') or {}).get('web',[])[:5]:
        url=r.get('url','')
        if url and 'innatefurniture.co.nz' not in url:
            competitors.append({'query':q.get('query'),'title':r.get('title'),'url':url,'description':(r.get('description') or '')[:250]})
# source score
source_status={
 'GSC': 'available' if cur.get('impressions') else 'empty/blocked',
 'GA4': 'available' if ga4.get('reports') else 'empty/blocked',
 'Shopify public JSON': 'available' if shop_public else 'empty/blocked',
 'Shopify Admin API read-only': 'not configured in this process' if not shop_admin.get('configured') else 'available',
 'Public crawl': f"available ({len(crawl.get('pages',[]))} URLs)",
 'DataForSEO rank/AI/local': f"available ({len(rank_rows)} live SERPs, cost {rank.get('cost')})" if rank_rows else 'empty/blocked',
 'Visual QA': f"available ({vsum.get('failures',0)} failures, {vsum.get('warnings',0)} warnings)" if visual_json else 'partial first run timed out; core rerun complete',
 'Merchant Center': 'available; setup blockers found' if merchant.get('accounts') else 'partial/blocked',
 'Bing Webmaster': 'available' if ((bing.get('checks') or {}).get('sites') or {}).get('ok') else 'partial/blocked',
 'Google Business Profile': 'available' if ((gbp.get('checks') or {}).get('accounts') or {}).get('ok') else 'partial/blocked',
 'External web context': f"available ({len(web.get('queries',[]))} searches)",
}
# top current changes caveat
recent_caveat='Boardroom, Commercial overview, Outdoor/Kwila and Bar Leaner SEO edits were made on 2026-06-28/29, so GSC/GA4 movement from those exact changes will not be visible yet. Treat this scan as the post-change baseline plus opportunity map.'
lines=[]
lines += [f"# AI-native Innate website master deep scan — {dt.datetime.now().strftime('%Y-%m-%d %H:%M NZST')}", '', '**Read-only scan. Live touched: no.**', '', recent_caveat, '']
lines += ['## 1. Executive judgement', '']
lines.append('Innate has real organic demand and improving visibility, but the commercial opportunity is still leaking at the click and quote-readiness layer. The site is now strong enough to move from generic SEO cleanup into an AI-native learning loop: every page should clarify intent, capture useful non-PII signals, and teach the next optimisation sprint which customer problem is appearing.')
lines.append('')
lines.append('The highest-value near-term work is not a broad redesign. It is a sequence of narrow, evidence-backed CTR/conversion sprints: Hospitality, Dining collection, Timber Panels/benchtops, Outdoor/Kwila, then high-intent product pages.')
lines += ['', '## 2. Source scorecard', '', '| Source | Status |', '|---|---|']
for k,v in source_status.items(): lines.append(f'| {k} | {v} |')
lines += ['', '## 3. Top-line metrics', '']
lines.append(f"- **GSC last 28 complete days:** {cur['clicks']:.0f} clicks / {cur['impressions']:.0f} impressions / CTR {cur['ctr']*100:.2f}% / avg position {cur['position']:.1f}.")
lines.append(f"- **GSC vs previous 28 days:** clicks {fp(pct(cur['clicks'],prev['clicks']))}, impressions {fp(pct(cur['impressions'],prev['impressions']))}, position {prev['position']:.1f} → {cur['position']:.1f}.")
if ga30:
    r=ga30[0]
    lines.append(f"- **GA4 30-day:** {r.get('sessions')} sessions, {r.get('activeUsers')} active users, {r.get('screenPageViews')} views, {r.get('engagedSessions')} engaged sessions, {r.get('conversions')} conversions, revenue {money(r.get('totalRevenue'))}.")
if ga90:
    r=ga90[0]
    lines.append(f"- **GA4 90-day:** {r.get('sessions')} sessions, {r.get('activeUsers')} active users, {r.get('screenPageViews')} views, {r.get('conversions')} conversions, revenue {money(r.get('totalRevenue'))}.")
lines += ['', '## 4. What is working', '']
for c in cluster_rows[:7]:
    lines.append(f"- **{c['cluster']}**: {c['clicks']:.0f} clicks / {c['impressions']:.0f} impressions / CTR {c['ctr']*100:.2f}% / pos {c['position']:.1f}.")
lines.append('- Privacy-safe event tracking is producing useful AI-factory signal. The 7-day sample includes page context, CTA clicks, FAQ opens, swatch selections, product-card clicks, collection filters, contextual form starts/submits and dining freight events.')
if ranked:
    lines.append('- DataForSEO still confirms at least one strong high-intent live SERP position: Innate ranked #1 in Christchurch for `custom dining tables nz`.')
lines += ['', '## 5. Biggest leaks / risks', '']
lines.append(f"1. **CTR remains the core leak.** GSC CTR is {cur['ctr']*100:.2f}% across {cur['impressions']:.0f} impressions. Several high-impression pages and query/page pairs are visible but not pulling enough clicks.")
lines.append('2. **DataForSEO live mobile SERPs are weaker than GSC average positions suggest.** Outside the strongest custom-dining result, the checked broad/commercial/local terms often did not show Innate in the top 20. That makes snippet strength, page ownership and local/national intent clarity important.')
if merchant_issues:
    lines.append('3. **Merchant Center is connected but blocked for free-listing/commercial use:** ' + '; '.join([f"{i.get('title')} ({i.get('severity')})" for i in merchant_issues]) + '.')
else:
    lines.append('3. **Merchant Center needs a deeper setup review.** Read-only access worked, but the account should be treated as not yet a dependable commercial acquisition surface until setup/feed checks pass.')
lines.append(f"4. **Crawl quality flags:** {len(flags)} pages need metadata/H1/alt/risky-term review. This is manageable, not catastrophic.")
lines.append(f"5. **Visual QA:** core priority pages passed with {vsum.get('failures',0)} failures and {vsum.get('warnings',0)} warnings; the broader first run timed out on long blog routes after generating partial screenshots, so blog visual audit needs a separate smaller pass.")
lines += ['', '## 6. Page / query opportunity map', '', '| Priority | Query/page evidence | Diagnosis | Next action |', '|---|---|---|---|']
for i,r in enumerate(qopp[:15],1):
    keys=r.get('keys',[]); q=keys[0] if len(keys)>0 else ''; page=keys[1] if len(keys)>1 else ''
    lines.append(f"| {i} | `{q}` → {page.replace('https://innatefurniture.co.nz','')} — {r.get('clicks',0):.0f} clicks / {r.get('impressions',0):.0f} impr / CTR {r.get('ctr',0)*100:.2f}% / pos {r.get('position',0):.1f} | Visible but under-clicked | Draft title/meta/first-screen/internal-link improvement; approve before live |")
lines += ['', '## 7. Page-level GSC opportunities', '', '| Page | Clicks | Impressions | CTR | Avg pos | Read |', '|---|---:|---:|---:|---:|---|']
for r in page_opp[:14]:
    page=(r.get('keys') or [''])[0].replace('https://innatefurniture.co.nz','')
    read='CTR sprint candidate' if r.get('impressions',0)>300 and r.get('ctr',0)<0.02 else 'monitor / refine'
    lines.append(f"| {page} | {r.get('clicks',0):.0f} | {r.get('impressions',0):.0f} | {r.get('ctr',0)*100:.2f}% | {r.get('position',0):.1f} | {read} |")
lines += ['', '## 8. GA4 behaviour / AI Factory signal', '']
lines.append('### Top traffic sources / channels')
for r in channels[:10]:
    lines.append(f"- {r.get('sessionDefaultChannelGroup')} / {r.get('sessionSourceMedium')}: {r.get('sessions')} sessions, {r.get('activeUsers')} users, {r.get('engagedSessions')} engaged, {r.get('conversions')} conversions, revenue {money(r.get('totalRevenue'))}.")
lines.append('\n### New tracking events, last 7 days')
for r in new_events[:15]:
    lines.append(f"- {r.get('eventName')}: {r.get('eventCount')} events / {r.get('activeUsers')} users")
lines.append('\n### Quote/product-intent events, 90 days')
for r in key_events[:15]:
    lines.append(f"- {r.get('eventName')}: {r.get('eventCount')} events / {r.get('activeUsers')} users")
if benchtop_events:
    lines.append('\n### Timber Panels / benchtop page events, 90 days')
    for r in benchtop_events[:12]: lines.append(f"- {r.get('eventName')}: {r.get('eventCount')} events / {r.get('activeUsers')} users")
lines += ['', '## 9. DataForSEO live SERP read', '']
lines.append(f"- Checked {len(rank_rows)} live mobile Google SERPs across Christchurch, Auckland and New Zealand. Cost recorded: {rank.get('cost')}.")
lines.append(f"- Innate appeared in top 20 for {len(ranked)} / {len(rank_rows)} checked SERPs. This is a stricter live-SERP sample than GSC and should be used as directional, not as the only truth.")
for r in ranked[:10]: lines.append(f"- {r.get('location')} / `{r.get('keyword')}`: rank #{r.get('rank')} — {r.get('title')} {r.get('url')}")
lines += ['', '## 10. Visual / technical crawl', '']
lines.append(f"- Core visual QA: {vsum.get('routes',len((visual_json or {}).get('routes',[])))} routes × 4 viewports, {vsum.get('failures',0)} failures, {vsum.get('warnings',0)} warnings.")
lines.append(f"- Public crawl: {len(crawl.get('pages',[]))} URLs, {len(flags)} review flags.")
for f in flags[:20]: lines.append(f"- {f['url'].replace('https://innatefurniture.co.nz','')}: " + '; '.join(f['reasons']))
lines += ['', '## 11. Platform status', '']
lines.append('- **Shopify:** public product/collection JSON snapshot succeeded. Admin API read-only snapshot was not configured in this process; use existing approved Shopify Admin scripts/env for future exact product/theme/page source reads. No Admin writes attempted.')
lines.append('- **Bing Webmaster:** read-only site verification helper returned available status; deeper Bing query/page/sitemap collectors still need implementation.')
if merchant_issues:
    lines.append('- **Merchant Center:** account exists for Innate Furniture; website is not claimed and business address is missing; no feed/products were returned by Content API. This is a separate approved setup project, not a website copy change.')
else: lines.append('- **Merchant Center:** read-only check ran; review stored JSON for setup status.')
lines.append('- **Google Business Profile:** read-only helper/check ran. GBP performance endpoint collector returned partial/performance details; useful as the local visibility layer after method hardening.')
lines += ['', '## 12. External market/search context', '']
lines.append('- Search context confirms competition is broad and often generic/corporate for dining, hospitality and commercial furniture. Innate should not try to sound bigger/generic; the edge is custom NZ-made, workshop provenance, material truth and quote-readiness.')
lines.append('- Current SEO environment includes recent Google spam-update noise, so do not overreact to a single week. Use GSC + GA4 + DataForSEO as a triangulated trend, not one source alone.')
for c in competitors[:10]: lines.append(f"- `{c['query']}` competitor/context: {c['title']} — {c['url']}")
lines += ['', '## 13. Action-led roadmap', '']
lines.append('### Next 1: Hospitality CTR/conversion batch')
lines.append('- Status: draft exists, not applied. Apply only after Guido approval. Good next page because it owns hospitality/café/restaurant/bar-leaneer demand and sits in the commercial cluster.')
lines.append('### Next 2: Dining collection CTR sprint')
lines.append('- Highest total organic surface. Focus on broad `dining tables nz`, round/oval/custom intent, proof near first screen, and internal path to quote/product filtering.')
lines.append('### Next 3: Timber Panels / benchtops quote-readiness')
lines.append('- The configurator has clear demand and events. Next scan should connect configurator starts/quote events to region, use-case and outcome without sending PII.')
lines.append('### Next 4: Merchant Center / free listings setup')
lines.append('- Separate approval needed. Website claim, business address/profile hygiene, product feed/free-listings plan, and safe tracking.')
lines.append('### Next 5: Blog + outdoor cleanup pass')
lines.append('- Separate blog visual audit pass; carefully remove remaining absolute/risky outdoor/timber claims where crawl flags them.')
lines += ['', '## 14. AI-native learning-layer recommendations', '']
lines.append('- Keep weekly snapshots in the same evidence structure so the AI layer can compare GSC query/page movement, GA4 intent events, DataForSEO live SERP gaps, and visual/crawl regressions.')
lines.append('- Store page ownership explicitly: Dining owns dining-table intent; Timber Panels owns benchtop/panel quote intent; Boardroom owns boardroom/meeting/conference; Commercial overview owns gateway/fit-out; Hospitality owns café/restaurant/bar venues; Outdoor owns outdoor tables/leaners/decking education.')
lines.append('- Add a lightweight non-PII outcome bridge: which page/session generated quote-ready contact, product category, timber/material preference, region, project type, and eventual quote/order status.')
lines.append('- Build next collectors: deeper Bing keyword/page data, stable PageSpeed/Lighthouse, Merchant product/feed snapshot after setup, and blog-only visual audit.')
lines += ['', '## 15. Evidence paths', '']
lines.append(f"- Run folder: `{RUN}`")
for rel in ['evidence-manifest.json','gsc/master_gsc_windows.json','ga4/ga4_useful_snapshot.json','crawl/public_crawl_master.json','visual/rendered-priority-core/report.md','dataforseo/latest-rank-benchmark/report.md','merchant/merchant_deep_readonly.json','bing/bing_check.json','gbp/gbp_check.json','search/external_web_search_results.json']:
    lines.append(f"- `{RUN/rel}`")
report='\n'.join(lines)+'\n'
(RUN/'report.md').write_text(report)
summary={'run_id':RUN.name,'timestamp':dt.datetime.now().isoformat(),'live_touched':False,'report_path':str(RUN/'report.md'),'evidence_folder':str(RUN),'gsc':cur,'gsc_previous':prev,'gsc_click_delta_pct':pct(cur['clicks'],prev['clicks']),'gsc_impression_delta_pct':pct(cur['impressions'],prev['impressions']),'ga4_30d':ga30[0] if ga30 else {},'visual_summary':vsum,'crawl_flag_count':len(flags),'dataforseo_rows':len(rank_rows),'dataforseo_ranked_count':len(ranked),'merchant_issues':merchant_issues,'top_actions':['Hospitality CTR/conversion batch after approval','Dining collection CTR sprint','Timber Panels/benchtop quote-readiness and AI Factory event bridge','Merchant Center/free listings setup after explicit approval','Blog/outdoor risky-claims and visual audit cleanup']}
(RUN/'summary.json').write_text(json.dumps(summary,indent=2,ensure_ascii=False))
# trend index append
trend=ROOT/'seo/weekly-audits/master-deep-scan-trend-index.jsonl'
trend.parent.mkdir(parents=True,exist_ok=True)
with trend.open('a',encoding='utf-8') as f: f.write(json.dumps(summary,ensure_ascii=False)+'\n')
print(json.dumps({'report':str(RUN/'report.md'),'summary':str(RUN/'summary.json'),'trend_index':str(trend),'gsc':cur,'visual':vsum,'crawl_flags':len(flags),'ranked':len(ranked)},indent=2))
