# Codex Handover — AI-native Innate Website Master Deep Scan / Weekly SEO Audit

**Prepared:** 2026-06-29 10:01 NZST  
**For:** Codex / implementation agent continuing Innate Furniture website SEO and AI-native learning-loop work  
**Reviewer:** Guido  
**Site:** https://innatefurniture.co.nz  
**Audit run:** `2026-06-29_091911_master-deep-scan`  
**Live touched during audit:** no

## 1. Immediate instruction for Codex

This handover is for **read-only audit findings and future approved implementation planning**.

Do not change Shopify, theme files, products, collections, Merchant Center, GBP, Bing, redirects, navigation, checkout, contact forms, tracking, or any other customer-visible/live surface unless Guido explicitly approves the exact action.

If Guido asks you to implement one of the suggestions below, use the exact-version-control workflow:

1. inspect the current live rendered page and the exact live Shopify/Admin/theme source;
2. draft the before/after copy or code;
3. get Guido's approval for the exact scoped change;
4. back up the live asset/record before writing;
5. update only the approved scope;
6. verify by Shopify/Admin/theme readback, raw public HTML with cache-buster, rendered desktop/mobile screenshots, status 200, new phrases present, old phrases absent where relevant, and zero horizontal overflow;
7. report backup path, proof path, files touched, and cache caveats.

## 2. Source-of-truth files from the scan

Primary report:

`/Users/mack-mini/innate-mission-control/seo/weekly-audits/2026-06-29_091911_master-deep-scan/report.md`

Evidence folder:

`/Users/mack-mini/innate-mission-control/seo/weekly-audits/2026-06-29_091911_master-deep-scan/`

Key evidence files:

- `summary.json` — compact run summary and top actions.
- `evidence-manifest.json` — file inventory for the evidence pack.
- `gsc/master_gsc_windows.json` — GSC windows, query/page evidence.
- `ga4/ga4_useful_snapshot.json` — GA4 source/channel/page/event snapshot.
- `crawl/public_crawl_master.json` — public crawl results and flags.
- `visual/rendered-priority-core/report.md` — core visual QA, desktop/tablet/mobile.
- `dataforseo/latest-rank-benchmark/report.md` — live DataForSEO rank / AI / local visibility benchmark.
- `merchant/merchant_deep_readonly.json` and `merchant/merchant_check.json` — Merchant Center read-only evidence.
- `bing/bing_check.json` and `bing/bing_deep_status.json` — Bing read-only status.
- `gbp/gbp_check.json` and `gbp/gbp_performance_90d.json` — Google Business Profile read-only evidence.
- `search/external_web_search_results.json` — external search/competitor/context evidence.

Trend index appended:

`/Users/mack-mini/innate-mission-control/seo/weekly-audits/master-deep-scan-trend-index.jsonl`

## 3. Safety and source rules

- Treat live Shopify/rendered storefront and fresh Shopify Admin/theme API readback as source of truth.
- Do **not** rely on stale local Shopify theme files.
- Live/main Shopify theme last referenced in current operating docs: `141308166203`.
- Read-only inspection is allowed. Writes/pushes/publishes require Guido approval.
- Do not print or store secrets. Redact tokens/API keys/passwords as `[REDACTED]`.
- Use NZ spelling and plain premium copy.
- Do not invent materials, dimensions, finishes, inclusions, delivery claims, power/data specs, care guarantees, or lead times.
- Christchurch can be used as provenance, but on national/commercial pages pair it with NZ-wide delivery so Auckland/NZ buyers do not read the page as Christchurch-only.
- Outdoor timber is not maintenance-free. Porcelain/Alfresco may be low-maintenance, not maintenance-free.

## 4. Executive scan judgement

The scan shows Innate has real organic demand and improving visibility, but the biggest leak is still **CTR and quote-readiness**, not a need for a broad redesign.

The site is now strong enough for an AI-native learning-loop approach:

- each page should own a clear commercial/search intent;
- each page should make the first-screen quote path obvious;
- analytics should capture privacy-safe intent signals;
- weekly scans should compare GSC, GA4, DataForSEO, crawl, visual QA and platform status to choose the next narrow sprint.

Boardroom, Commercial overview, Outdoor/Kwila and Bar Leaner SEO edits were made on 2026-06-28/29. GSC and GA4 will not yet show the effect of those changes. Treat this audit as a **post-change baseline plus opportunity map**, not a final verdict on those edits.

## 5. Top-line metrics from 2026-06-29 scan

| Source | Result |
|---|---:|
| GSC last 28 complete days | 338 clicks / 42,136 impressions |
| GSC CTR | 0.80% |
| GSC average position | 16.5 |
| GSC vs previous 28 days | clicks +28.0%, impressions +31.4% |
| Previous 28-day average position | 22.0 |
| GA4 30-day sessions | 3,988 |
| GA4 30-day active users | 2,943 |
| GA4 30-day views | 12,571 |
| GA4 30-day conversions | 35 |
| GA4 90-day sessions | 10,087 |
| GA4 90-day conversions | 74 |
| Public crawl | 136 URLs, 8 review flags |
| Core visual QA | 10 routes × 4 viewports, 0 failures, 629 warnings |
| DataForSEO live SERPs | 48 checks, 1 Innate top-20 result |
| DataForSEO cost | $0.0035 |
| Merchant Center | connected, but setup blockers found |

## 6. What is working

### Organic visibility is improving

GSC clicks and impressions both increased materially against the previous 28-day window. Average position improved from about 22.0 to 16.5. This means search surface area is growing, but the low CTR says the pages/snippets are not yet converting enough visibility into visits.

### Dining remains the largest organic surface

GSC grouped signal:

- Dining: 59 clicks / 8,548 impressions / CTR 0.69% / average position 16.5.
- `/collections/dining-tables`: 85 clicks / 7,930 impressions / CTR 1.07% / average position 15.5.

This is one of the biggest sprint candidates because small improvements to title/meta/above-fold clarity could affect a lot of impressions.

### Timber Panels / benchtops is a strong AI Factory candidate

GSC and GA4 both show commercial intent:

- `/pages/timber-panels`: 119 clicks / 6,551 impressions / CTR 1.82% / average position 13.9.
- GA4 90-day page events show 4,091 page views, 369 CTA clicks, 156 configurator views, 87 configurator starts, 96 size changes, and 74 timber selections.

This is the best current candidate for connecting website behaviour to quote/order outcomes without storing PII.

### Privacy-safe event tracking is producing usable learning signals

Recent GA4 event signals include:

- `cta_click`: 812 events / 146 users in 7-day sample.
- `page_context_view`: 612 events / 345 users.
- `faq_opened`: 43 events / 16 users.
- `timber_swatch_selected`: 32 events / 8 users.
- `product_card_click`: 28 events / 19 users.
- `form_start_contextual`: 9 events / 6 users.
- `form_submit_contextual`: 9 events / 6 users.
- `commercial_enquiry_started`: 1 event / 1 user.

This should feed the AI-native business layer, but only if page ownership and quote outcomes are tied together consistently.

### AI Assistant traffic is visible

GA4 source/channel evidence includes:

- `AI Assistant / chatgpt.com / ai-assistant`: 64 sessions, 33 users, 47 engaged sessions, 22 conversions, revenue $0.

Treat attribution carefully, but preserve the signal. Do not over-optimise from it yet.

## 7. Biggest leaks and risks

### 1. CTR remains the core leak

GSC CTR is 0.80% across 42,136 impressions. That is the clearest commercial leak. This points to snippet, page ownership, above-fold clarity, quote language and internal-path work rather than broad visual redesign.

### 2. Live SERP checks are weaker than GSC average position suggests

DataForSEO checked 48 live mobile Google SERPs across Christchurch, Auckland and New Zealand. Innate appeared in the top 20 for only 1/48 checked live SERPs.

The one strong result:

- Christchurch / `custom dining tables nz`: rank #1 — homepage ranked with title `Custom Timber Furniture NZ | Dining Tables, Benchtops & More | Innate`.

This should be treated as directional rather than absolute because DataForSEO is a stricter sampled live-SERP check than GSC, but it reinforces that broad/commercial/local visibility needs work.

### 3. Merchant Center is blocked for meaningful free-listings use

Read-only Merchant Center check found:

- critical: website not claimed;
- critical: missing business address;
- no usable feed/products returned by Content API.

This is a separate approved setup project, not a copy tweak. It may become high-value once Guido approves commerce-platform work.

### 4. Crawl flags are manageable but should be cleaned up

Public crawl found 136 URLs and 8 review flags:

- `/agents.md`: H1 count 0; short/no meta.
- `/products/exterior-coffee-table`: short/no meta.
- `/pages/avada-sitemap-blogs`: H1 count 0; short/no meta.
- `/pages/warranty`: H1 count 2.
- `/pages/materials`: short/no meta.
- `/blogs/our-purpose`: risky term `maintenance-free`.
- `/blogs/our-purpose/making-the-panels`: risky term `maintenance-free`.
- `/blogs/our-purpose/gather-around-our-summer-outdoor-dining-tables`: risky term `maintenance-free`.

Do not make these into a broad redesign. They are cleanup tasks.

### 5. Visual QA passed core pages, but warnings need triage

Core visual QA passed: 0 failures across 10 routes × 4 viewports.

Warnings include repeated console/header/shop-app noise, small action targets, low-contrast slider dots, broken hidden/collapsed images, and some broken visible Google review/profile images. The first broad visual run timed out on long blog routes after partial screenshots, so blog visual QA should be a smaller separate pass.

## 8. Priority implementation roadmap

### Priority 1 — Hospitality Furniture CTR/conversion batch

Status: draft exists, not applied.

Why next:

- It sits in the commercial cluster after Boardroom and Commercial overview.
- It owns hospitality/café/restaurant/bar venue demand.
- GSC page-level signal: `/pages/hospitality-furniture` had 7 clicks / 2,044 impressions / CTR 0.34% / average position 25.9.
- Earlier query evidence showed hospitality, café, restaurant and commercial hospitality terms with impressions but few clicks.

Suggested scope:

- SEO title/meta polish.
- H1 and hero support line sharpened around cafés, restaurants and bars.
- Combine Christchurch provenance with NZ-wide delivery.
- Make the primary CTA slightly more quote-led.
- Do not redesign layout, change imagery, navigation, form behaviour, products or collection structure.

Approval needed before live application.

### Priority 2 — Dining collection CTR sprint

Why next:

- Largest current organic surface.
- `/collections/dining-tables`: 85 clicks / 7,930 impressions / CTR 1.07% / average position 15.5.
- Query examples from the opportunity map:
  - `dining table` → `/collections/dining-tables`: 6 clicks / 1,236 impressions / CTR 0.49% / position 14.8.
  - `dining table nz` → `/collections/dining-tables`: 3 clicks / 722 impressions / CTR 0.42% / position 15.4.
  - `dining tables` → `/collections/dining-tables`: 2 clicks / 277 impressions / CTR 0.72% / position 15.8.

Suggested scope:

- Inspect live collection page, current SEO title/meta/H1/hero/intro/product cards.
- Draft small CTR-focused title/meta and first-screen copy improvements.
- Preserve custom-made / timber / NZ-made positioning.
- Avoid giant SEO text blocks above products.
- Keep buyer path clear: browse sizes/styles, choose timber, ask for custom sizing or quote.

Approval needed before live application.

### Priority 3 — Timber Panels / benchtop quote-readiness + AI Factory bridge

Why next:

- Strong commercial and behavioural signal.
- GSC: `/pages/timber-panels` 119 clicks / 6,551 impressions / CTR 1.82% / position 13.9.
- GA4: configurator views, starts, size changes and timber selections show intent.

Suggested scope:

- Inspect live Timber Panels page and configurator path.
- Improve quote-readiness language if needed.
- Create/validate a non-PII learning bridge that records page/session category, product intent, timber/material selection, region/project type if available, and eventual quote/order outcome.
- Do not store personal details in analytics events.
- Do not alter pricing, checkout or quoting logic without explicit approval.

Approval needed for any tracking/configurator changes.

### Priority 4 — Merchant Center / free listings setup

Why next:

- Merchant Center is connected but blocked.
- Critical blockers: website not claimed and missing business address.
- Product/feed/free listings could support organic shopping visibility once configured safely.

Suggested scope:

- Prepare a read-only status pack first.
- Then ask Guido for explicit approval for the setup actions.
- Claim/verify website only if approved.
- Add business address/profile details only if approved.
- Plan product feed/free listings carefully, especially for custom-made products where price/availability/variants can be nuanced.

This is not a normal website copy task. Treat it as an external commerce-platform setup project.

### Priority 5 — Blog/outdoor risky-claims and visual audit cleanup

Why next:

- Crawl found remaining `maintenance-free` wording in blog/outdoor areas.
- Outdoor timber must not be described as maintenance-free.
- The broad visual run timed out on long blog routes, so a blog-specific visual pass is needed.

Suggested scope:

- Run a smaller blog/outdoor read-only visual and copy scan.
- Replace absolute care/performance claims with careful maintenance language.
- Preserve useful SEO value from Kwila/outdoor education pages.
- Do not over-polish educational pages into generic sales pages.

Approval needed before live edits.

## 9. Page ownership map for future work

Use this to avoid keyword cannibalisation and bloated pages:

- Homepage: brand, custom timber furniture NZ, broad trust/provenance.
- Dining collection: dining tables NZ, custom dining tables, round/oval/table size/product browsing.
- Timber Panels page: timber panels, benchtops, butcher block panel/bench use cases, configurator/quote intent.
- Boardroom page: boardroom tables, meeting tables, conference tables, power/data planning where supported.
- Commercial overview: commercial furniture NZ, custom commercial fit-out, workplace/hospitality gateway, counters/leaners/tables overview.
- Hospitality page: hospitality furniture NZ, café tables, restaurant tables, bar leaners, venue fit-out pieces.
- Outdoor collection/products: outdoor dining tables, exterior bar leaners, Kwila alternatives, Alfresco/porcelain/steel product intent.
- Kwila blog: educational/comparative timber content, not primary product landing page.

## 10. Data and collector gaps to harden

Codex should treat these as future tooling tasks, not blockers to copy sprints:

1. Shopify Admin read-only snapshot in this audit process said not configured, even though other approved Shopify Admin scripts/env exist. Harden the audit runner so Admin read-only checks are consistently available without printing secrets.
2. Bing Webmaster check is basic. Build deeper keyword/page/sitemap collectors.
3. GBP performance endpoint returned partial details. Harden method and preserve local visibility trend.
4. Lighthouse/PageSpeed was not part of this final report. Add stable PageSpeed/Lighthouse collection when dependencies are available.
5. Blog visual audit needs its own route subset because broad run timed out on long blog pages.
6. Merchant product/feed snapshot will only become useful after Merchant setup blockers are resolved.

## 11. Suggested Codex working sequence

If Guido asks Codex to continue implementation, use this order:

1. Read this handover and the primary scan report.
2. Confirm current live page/source for the specific page only.
3. Draft a narrow before/after batch for one page.
4. Show Guido the draft and wait.
5. If Guido approves, back up exact live assets/records.
6. Apply only approved scope.
7. Verify with readback, raw HTML, rendered desktop/mobile and status checks.
8. Update any current-state/reference docs if an approved live baseline changes.
9. Report changed / not changed / blocked, proof, backup, and next approval needed.

Recommended first implementation prompt for Guido, if he wants Codex to act:

> Read `docs/handover-codex-ai-native-master-deep-scan-2026-06-29.md` and the scan report it references. Continue with Priority 1 only: inspect the current live Hospitality Furniture page, confirm source of truth, show the already drafted CTR/conversion batch as before/after, and wait for my explicit approval before making any live change.

## 12. Current recommended next action

Do **Priority 1: Hospitality Furniture CTR/conversion batch** as a narrow approved sprint.

Keep it small:

- no layout redesign;
- no image changes unless a current image is provably wrong/broken;
- no navigation changes;
- no contact-form changes;
- no collection/product structure changes;
- no Merchant Center changes;
- no unapproved Shopify/theme writes.

After that, let Boardroom, Commercial overview and Hospitality collect GSC data for a few days before judging CTR/rank movement.

## 13. Quick summary for Guido

The scan says Innate is getting more search surface, but it is still leaking clicks and quote confidence. The right next move is not a big redesign. It is a controlled sequence of page-level CTR/quote-readiness improvements, starting with Hospitality, then Dining, then Timber Panels/benchtops, while separately hardening Merchant/Bing/GBP/PageSpeed collectors for the AI-native learning layer.

**Live touched by the audit:** no.
