#!/usr/bin/env python3
from __future__ import annotations
import csv, datetime as dt, json, os, pathlib, re
run=pathlib.Path(os.environ.get('RUN_DIR') or open('/tmp/innate_master_scan_run_dir').read().strip())

def load(rel, default=None):
    p=run/rel
    if not p.exists(): return default
    try: return json.loads(p.read_text())
    except Exception: return default

def pct(now, prev):
    try:
        now=float(now); prev=float(prev)
        if prev==0: return None
        return (now-prev)/prev*100
    except Exception: return None

def fmt_pct(x): return 'n/a' if x is None else f'{x:+.1f}%'

tracking=load('gsc-ga4-crawl-evidence.json',{})
gsc=tracking.get('gsc',{})
ga4=tracking.get('ga4',{})
cur=gsc.get('current_summary',{}); prev=gsc.get('previous_summary',{})
ga4snap=load('ga4/ga4_useful_snapshot.json',{})
crawl=load('crawl/public_crawl_master.json',{})
products=load('shopify/public_shopify_json_snapshot.json',{})
merchant=load('merchant/merchant_deep_readonly.json',{})
bing=load('bing/bing_check.json',{})
gbp=load('gbp/gbp_performance_90d.json',{})
searchprobe=load('search/search_lenses_probe.json',{})
rank=load('dataforseo/latest-rank-benchmark/summary.json',{})
visual_report=(run/'visual/rendered-priority/report.md').read_text(errors='ignore') if (run/'visual/rendered-priority/report.md').exists() else ''
web=load('search/external_web_search_results.json',{})

# GA4 report rows by name
reports={r.get('name'):r for r in ga4snap.get('reports',[])}
def rows(name): return reports.get(name,{}).get('rows',[])

# crawl flags
crawl_pages=crawl.get('pages',[])
flags=[]
for p in crawl_pages:
    if p.get('error') or p.get('status')!=200 or p.get('h1_count')!=1 or p.get('meta_len',0)<50 or p.get('missing_alt_count',0)>3 or p.get('stale_or_risky_terms_found'):
        flags.append(p)

# visual failures text
visual_failures=[]
for m in re.finditer(r'### (/[^\n]*)\n(?:.|\n)*?#### ([^\n]+)\n(?:.|\n)*?- Failures:\n((?:    - .*\n)+)', visual_report):
    route, vp, items=m.group(1),m.group(2),m.group(3)
    visual_failures.append({'route':route,'viewport':vp,'items':[x.strip()[2:] for x in items.splitlines() if x.strip().startswith('-')]})

# rank highlights from report text
rank_report=(run/'dataforseo/latest-rank-benchmark/report.md').read_text(errors='ignore') if (run/'dataforseo/latest-rank-benchmark/report.md').exists() else ''

# merchant issues
merchant_issues=[]
for acc in merchant.get('accounts',[]):
    st=acc.get('accountstatus',{})
    for issue in st.get('accountLevelIssues',[]) or []:
        merchant_issues.append(issue)

# external competitors from web results
competitors=[]
for q in web.get('queries',[]):
    data=(q.get('result') or {}).get('data',{}).get('web',[])
    for r in data[:5]:
        url=r.get('url','')
        if url and 'innatefurniture.co.nz' not in url:
            competitors.append({'query':q.get('query'),'title':r.get('title'),'url':url,'description':(r.get('description') or '')[:280]})

# source statuses
source_status={
 'GSC': 'available' if cur else 'blocked/empty',
 'GA4': 'available' if ga4snap.get('reports') else 'blocked/empty',
 'Shopify/public JSON': 'available' if products else 'partial/blocked',
 'Shopify read-only CLI': 'available' if (run/'shopify/shopify_readonly.txt').exists() else 'not checked',
 'DataForSEO': 'available' if rank_report else 'partial/blocked',
 'Visual QA': 'available' if visual_report else 'failed/blocked',
 'PageSpeed/Lighthouse': (run/'pagespeed/tool.txt').read_text().strip() if (run/'pagespeed/tool.txt').exists() else 'not checked',
 'GBP': 'available' if gbp.get('locations') else 'partial/blocked',
 'Merchant Center': 'available but setup incomplete' if merchant.get('accounts') else 'partial/blocked',
 'Bing Webmaster': 'available' if bing.get('checks',{}).get('sites',{}).get('ok') else 'partial/blocked',
 'Brave/Firecrawl/DataForSEO probes': 'available' if searchprobe else 'partial/blocked',
 'External web search': 'available' if web else 'partial/blocked',
}

lines=[]
lines.append(f"# AI-native Innate website master deep scan — {dt.datetime.now().strftime('%Y-%m-%d %H:%M')}")
lines.append('')
lines.append('Read-only master scan. Live Shopify/theme/page/product/redirect/email/cron state was not changed.')
lines.append('')
lines.append('## 1. Executive judgement')
lines.append('')
lines.append('Innate is now clearly visible for high-intent custom dining and timber benchtop demand, and the new tracking layer is starting to expose useful customer intent. The main leak is not lack of demand. The leak is turning that demand into confident clicks and quote-ready actions, especially on broad dining, commercial/hospitality, outdoor, and Merchant/free-listing surfaces.')
lines.append('')
lines.append('The AI-factory opportunity is to make the site more than a catalogue: every page should tell us what the customer is trying to make, what proof they need, and what quote-ready information can be captured without adding friction.')
lines.append('')
lines.append('## 2. Source scorecard')
lines.append('')
lines.append('| Source | Status |')
lines.append('|---|---|')
for k,v in source_status.items(): lines.append(f'| {k} | {v} |')
lines.append('')
lines.append('## 3. Top-line metrics')
lines.append('')
if cur:
    lines.append(f"- **GSC 28-day clicks:** {cur.get('clicks',0):.0f} vs {prev.get('clicks',0):.0f} ({fmt_pct(pct(cur.get('clicks'), prev.get('clicks')))})")
    lines.append(f"- **GSC impressions:** {cur.get('impressions',0):.0f} vs {prev.get('impressions',0):.0f} ({fmt_pct(pct(cur.get('impressions'), prev.get('impressions')))})")
    lines.append(f"- **GSC CTR:** {cur.get('ctr',0)*100:.2f}% vs {prev.get('ctr',0)*100:.2f}%")
    lines.append(f"- **GSC avg position:** {cur.get('position',0):.1f} vs {prev.get('position',0):.1f}")
for r in rows('overview_30d')[:1]:
    lines.append(f"- **GA4 30-day sessions:** {r.get('sessions')} | active users {r.get('activeUsers')} | views {r.get('screenPageViews')} | engaged sessions {r.get('engagedSessions')} | conversions {r.get('conversions')} | revenue {r.get('totalRevenue')}")
lines.append('')
lines.append('## 4. What is working')
lines.append('')
lines.append('- Organic Search is the biggest current channel in the 28-day GA4 extract: 1,682 sessions, 1,363 users, 5,023 views.')
lines.append('- GSC visibility improved strongly: clicks up 39.0%, impressions up 36.0%, and average position improved from 22.2 to 16.5.')
lines.append('- DataForSEO shows strong high-intent custom dining rankings: custom/bespoke dining table terms are mostly #1 to #3 across Christchurch, Wanaka, Queenstown, Auckland and NZ.')
lines.append('- Timber panels/benchtops are commercially promising: GSC has 6,744 impressions and 123 clicks for `/pages/timber-panels`; GA4 has 152 configurator views and 84 configurator starts in 90 days.')
lines.append('- AI Assistant traffic is now visible in GA4: 56 recent sessions in the 28-day channel read, and 58 sessions / 22 conversions from `chatgpt.com / ai-assistant` in the 90-day source read. Treat attribution carefully, but this is exactly the kind of signal the AI Factory should preserve.')
lines.append('- New privacy-safe tracking events are firing: 7-day event sample includes `page_context_view`, `cta_click`, `faq_opened`, `timber_swatch_selected`, `product_card_click`, `collection_filter_used`, contextual form events, and dining freight events.')
lines.append('')
lines.append('## 5. Biggest leaks and risks')
lines.append('')
lines.append('1. **CTR is still weak despite improving rankings.** GSC CTR is only 0.82%. Broad dining, commercial/hospitality, outdoor, and some product queries are getting impressions without enough clicks.')
lines.append('2. **Commercial/boardroom visibility is under-converting.** Cluster read shows boardroom/commercial at 935 impressions, 1 click, 0.11% CTR, average position 8.8. This is a strong snippet/page-message problem.')
lines.append('3. **Hospitality page has visible image failures.** Visual QA failed desktop `/pages/hospitality-furniture` because two visible images are broken: `innate-commercial-gin-gin-new-regent.jpg` and `Kokomo.heic` variant.')
lines.append('4. **Merchant Center is connected but not commercially usable yet.** Account exists, but website is not claimed, business address is missing, no feeds/products are present, and free listings auto-tagging is off.')
lines.append('5. **Outdoor/Kwila opportunity is not converting into product rankings.** Kwila education content ranks/clicks, but DataForSEO shows `outdoor dining table nz` not top 20 across checked locations.')
lines.append('6. **Old/risky copy terms still exist in crawl.** `maintenance-free` appears on hospitality and several blog surfaces; for outdoor/timber this should be corrected carefully to avoid absolute-care claims.')
lines.append('7. **Technical/content crawl found 9 review flags across 136 pages.** These include no/short meta descriptions, multiple/missing H1s, and risky terms. Not catastrophic, but worth a cleanup pass.')
lines.append('')
lines.append('## 6. Priority page findings')
lines.append('')
lines.append('| Page/area | Evidence | Diagnosis | Next action |')
lines.append('|---|---|---|---|')
for row in gsc.get('page_opportunities',[])[:8]:
    page=row.get('keys',[None])[0]
    lines.append(f"| {page} | {row.get('clicks',0):.0f} clicks / {row.get('impressions',0):.0f} impr / CTR {row.get('ctr',0)*100:.2f}% / pos {row.get('position',0):.1f} | High impression page needing click/conversion review | Review title/meta, above-fold promise, internal links, CTA and proof |")
lines.append('')
lines.append('## 7. Search/ranking highlights')
lines.append('')
for line in rank_report.splitlines()[7:24]:
    if line.strip(): lines.append(line)
lines.append('')
lines.append('## 8. Behaviour and conversion read')
lines.append('')
lines.append('Key GA4 90-day commercial events:')
for r in rows('key_events_90d')[:12]:
    lines.append(f"- {r.get('eventName')}: {r.get('eventCount')} events / {r.get('activeUsers')} active users")
lines.append('')
lines.append('Benchtop page 90-day events show a promising funnel, but it needs better quote-outcome linkage:')
for r in rows('benchtop_page_events_90d')[:12]:
    lines.append(f"- {r.get('eventName')}: {r.get('eventCount')} / {r.get('activeUsers')} users")
lines.append('')
lines.append('## 9. Visual and technical QA')
lines.append('')
lines.append(f"- Visual audit covered 10 priority routes across desktop, tablet-wide, tablet and mobile: **{len(visual_failures)} route/viewport failure group(s)**, 2 total failures, 558 warnings.")
for f in visual_failures:
    lines.append(f"- Failure: {f['route']} / {f['viewport']}: " + '; '.join(f['items']))
lines.append(f"- Public crawl checked {len(crawl_pages)} pages; {len(flags)} pages flagged for metadata/H1/risky-term review.")
for p in flags[:12]:
    bits=[]
    if p.get('error'): bits.append('error '+p.get('error'))
    if p.get('h1_count')!=1: bits.append(f"H1 count {p.get('h1_count')}")
    if p.get('meta_len',0)<50: bits.append(f"meta len {p.get('meta_len')}")
    if p.get('missing_alt_count',0)>3: bits.append(f"missing alt {p.get('missing_alt_count')}")
    if p.get('stale_or_risky_terms_found'): bits.append('risky terms '+', '.join(p.get('stale_or_risky_terms_found')))
    lines.append(f"- {p.get('url')}: " + '; '.join(bits))
lines.append('- Lighthouse/PageSpeed did not run because the Lighthouse CLI is not installed on this Mac mini. This is a tooling gap, not a site pass.')
lines.append('')
lines.append('## 10. Extended source layers')
lines.append('')
lines.append('- **Google Business Profile:** account/location access works and performance collector ran. Use as the local/Maps visibility layer going forward.')
lines.append('- **Merchant Center:** connected, but account setup has critical blockers: website not claimed and missing business address; no feeds/products found. This should become a separate approved Merchant/free-listings setup project.')
lines.append('- **Bing Webmaster:** verified site access exists. Current helper proves the site; deeper keyword/page/sitemap collectors still need to be added.')
lines.append('- **Brave, Firecrawl, DataForSEO probes:** available. Firecrawl scraped the homepage; Brave search works; DataForSEO balance was available and rank benchmark ran.')
lines.append('- **External market/search context:** Google June 2026 spam update ran 24-26 June; monitor but do not overclaim. NZ furniture market context suggests cautious buyers and stronger emphasis on durable/value-led purchases, while IKEA/flatpack pressure makes Innate’s premium/custom/local proof more important.')
lines.append('')
lines.append('## 11. Top 3 next actions')
lines.append('')
lines.append('1. **Fix the hospitality page image failures and review its snippet/CTA.** It has visual failures and sits inside the commercial/hospitality opportunity area. Draft fix first; live image/theme changes need approval.')
lines.append('2. **Run a CTR sprint on dining, timber panels, boardroom/commercial, and outdoor.** Prioritise title/meta/above-fold promise and internal links for high-impression, low-CTR pages. Draft changes and approve page-by-page before live updates.')
lines.append('3. **Turn tracking into the AI Factory learning layer.** Connect form/configurator/contact/freight events to cleaner product intent, use case, timber preference, region, quote-readiness and outcome follow-up, without adding PII to analytics.')
lines.append('')
lines.append('## 12. Implementation queue')
lines.append('')
lines.append('### Read-only / draft now')
lines.append('- Draft title/meta and first-screen improvements for dining collection, timber panels, boardroom/commercial, hospitality, outdoor and high-impression product pages.')
lines.append('- Build a persistent Bing deeper collector and PageSpeed/Lighthouse setup for the next scan.')
lines.append('- Produce a Merchant Center setup checklist and feed plan.')
lines.append('')
lines.append('### Preview-safe after approval')
lines.append('- Preview hospitality image fixes and commercial-page CTA/snippet refinements.')
lines.append('- Preview targeted metadata/copy changes for one page at a time with raw HTML and rendered checks.')
lines.append('')
lines.append('### Live approval needed')
lines.append('- Any Shopify/theme/page/product/media/redirect changes.')
lines.append('- Merchant Center profile/feed changes, website claiming, business-address/profile setup, or product feed creation.')
lines.append('- Bing URL submission, IndexNow setup, or any indexing/publish workflow.')
lines.append('')
lines.append('## 13. Evidence files')
lines.append('')
lines.append('- Full evidence is saved in the audit folder attached/available on the Mac mini.')
lines.append('- Key files: `report.md`, `evidence-manifest.json`, `gsc/master_gsc_windows.json`, `ga4/ga4_useful_snapshot.json`, `crawl/public_crawl_master.json`, `visual/rendered-priority/report.md`, `dataforseo/latest-rank-benchmark/report.md`, `merchant/merchant_deep_readonly.json`, `search/external_web_search_results.json`.')
lines.append('')
lines.append('## 14. Caveats')
lines.append('')
lines.append('- PageSpeed/Lighthouse is missing locally.')
lines.append('- Bing deeper keyword/page statistics are not yet implemented in the helper.')
lines.append('- Clarity session behaviour was not included in this pass.')
lines.append('- DataForSEO rank benchmark returned 252/255 ready rows; treat 3 rows as pending/partial.')
lines.append('- No live website changes were made.')

(run/'report.md').write_text('\n'.join(lines)+'\n')
manifest={
 'generated_at':dt.datetime.now().isoformat(),
 'run_dir':str(run),
 'live_touched':False,
 'source_status':source_status,
 'key_metrics':{'gsc_current':cur,'gsc_previous':prev,'gsc_click_delta_pct':pct(cur.get('clicks'), prev.get('clicks')) if cur else None,'gsc_impression_delta_pct':pct(cur.get('impressions'), prev.get('impressions')) if cur else None},
 'visual_failures':visual_failures,
 'crawl_pages_checked':len(crawl_pages),'crawl_flags':len(flags),
 'merchant_issues':merchant_issues,
 'evidence_files':[str(p.relative_to(run)) for p in run.rglob('*') if p.is_file()]
}
(run/'evidence-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False))
# index jsonl
idx=run.parent/'index.jsonl'
summary={'run_id':run.name,'timestamp':dt.datetime.now().isoformat(),'report_path':str(run/'report.md'),'evidence_folder':str(run),'gsc_clicks':cur.get('clicks'),'gsc_impressions':cur.get('impressions'),'gsc_ctr':cur.get('ctr'),'gsc_position':cur.get('position'),'top_opportunities':['hospitality image failures + commercial CTR','dining/timber panels CTR sprint','AI-factory tracking/outcome linkage'],'top_risks':['weak CTR despite visibility','Merchant Center not claimed/no feed','outdoor dining not top 20 in DataForSEO'],'blockers':['Lighthouse CLI not installed','Bing deeper collectors not implemented','Clarity not included'], 'live_touched':False}
with idx.open('a') as f: f.write(json.dumps(summary,ensure_ascii=False)+'\n')
print(run/'report.md')
print(run/'evidence-manifest.json')
