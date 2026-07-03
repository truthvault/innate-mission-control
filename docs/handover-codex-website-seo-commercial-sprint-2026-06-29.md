# Codex Handover — Innate Website SEO / Commercial Sprint

**Prepared:** 2026-06-29 08:58 NZST  
**For:** Codex / implementation agent taking over Innate Furniture website work  
**Reviewer:** Guido  
**Site:** https://innatefurniture.co.nz  
**Latest verified live Shopify theme:** `141308166203`

## 1. Non-negotiables

- **No live Shopify/theme/product/page/media/redirect/contact-form/checkout changes without Guido approving the exact action.** Draft/inspect freely; publish only after approval.
- **Do not rely on local Shopify theme files as source-of-truth.** Start from the live rendered storefront and fresh Shopify Admin/theme API readback for the current live theme. Local theme folders are stale/forensic unless freshly duplicated.
- **Back up before every write.** Theme/page backups go under `/Users/mack-mini/innate-mission-control/backups/shopify-theme/`; product backups under `/Users/mack-mini/innate-mission-control/backups/shopify-products/`.
- **Verify after every write:** Shopify readback, raw public HTML with cache-buster + browser UA, rendered desktop/mobile screenshots, status 200, correct server theme, new phrases present, old phrases absent, zero horizontal overflow.
- **Tone/copy:** premium, plain-spoken, NZ spelling, product-truthful. Do not invent specs/materials/dimensions/lead times/power modules/care claims.
- **Christchurch positioning:** OK as provenance/trust, but pair with **delivered NZ-wide** on national pages so Auckland/NZ buyers do not read the site as local-only.
- **Outdoor/material care:** timber is not “maintenance-free”. Porcelain/Alfresco may be “low-maintenance”, not absolute.
- **Do not print/store secrets.** Redact any token/API key/password as `[REDACTED]`.

## 2. Project purpose

The 2026-06-28 audit showed Innate has improving visibility and strong demand, but is leaking value because high-impression / near-page-one pages are not turning into enough confident clicks and quote-ready enquiries.

This is a **page-by-page CTR + conversion clarity sprint**, not a redesign. The workflow is:

1. inspect current live page + GSC/GA4 evidence;
2. draft small title/meta/above-fold/CTA/internal-link changes;
3. show Guido before/after and rationale;
4. wait for approval;
5. back up exact live assets/records;
6. apply only approved scope;
7. verify via readback, raw HTML, rendered desktop/mobile;
8. report URL, changed files, backup/proof paths, verification, next step.

## 3. Audit source pack

Primary audit folder:

`/Users/mack-mini/innate-mission-control/seo/weekly-audits/2026-06-28_202112_master-deep-scan/`

Key files:

- `report.md` — master narrative and recommendations
- `context/seo-tracking-report.md` — GSC/GA4/crawl summary
- `gsc/master_gsc_windows.json` — detailed GSC windows/query/page data
- `ga4/ga4_useful_snapshot.json` — GA4 evidence
- `dataforseo/latest-rank-benchmark/report.md` — rank benchmark
- `visual/rendered-priority/report.md` — rendered QA
- `crawl/public_crawl_master.json` — crawl flags
- `merchant/merchant_deep_readonly.json` — Merchant Center status

## 4. Overall audit findings

### Top-line metrics

- GSC clicks: **353 vs 254** (**+39.0%**)
- GSC impressions: **43,310 vs 31,847** (**+36.0%**)
- GSC CTR: **0.82% vs 0.80%** — still weak
- GSC avg position: **16.5 vs 22.2** — visibility improved materially
- GA4 30-day: **4,033 sessions**, **2,961 active users**, **12,966 views**, **2,207 engaged sessions**, **35 conversions**, **286 revenue**
- Organic Search: **1,682 sessions**, **1,363 users**, **5,023 views**

### What is working

- Strong custom dining rankings: `custom dining table nz`, `custom dining tables nz`, `custom made dining table nz`, `bespoke dining table nz` mostly rank #1–#3 across checked NZ locations.
- Timber panels/benchtops have commercial signal: `/pages/timber-panels` had **6,744 impressions / 123 clicks / CTR 1.82% / avg pos 13.9**; GA4 showed **152 configurator views** and **84 starts** in 90 days.
- AI Assistant traffic is visible: 28-day read showed **56 AI Assistant sessions**; 90-day source read had `chatgpt.com / ai-assistant` at **58 sessions / 22 conversions**. Treat attribution carefully, but preserve the signal.
- Privacy-safe tracking events are firing: `page_context_view`, `cta_click`, `faq_opened`, `timber_swatch_selected`, `product_card_click`, `collection_filter_used`, contextual form events, dining freight events.

### Biggest leaks/risks

1. **CTR remains weak despite improving rankings.** Many broad/commercial/product terms get impressions without enough clicks.
2. **Boardroom/commercial cluster was severely under-clicking:** 935 impressions, 1 click, 0.11% CTR, avg pos 8.8.
3. **Hospitality had image/care-language issues in audit:** broken `Kokomo.heic` and `innate-commercial-gin-gin-new-regent.jpg` in desktop visual QA; risky `maintenance-free` language. This was later fixed at image/care level, but CTR copy is still only drafted.
4. **Merchant Center is connected but not commercially usable:** website not claimed, missing business address, no feeds/products, free listings auto-tagging off.
5. **Outdoor/Kwila gap:** Kwila education ranks/clicks, but product intent such as `outdoor dining table nz` was not top 20 in DataForSEO checks.
6. **Crawl cleanup remains:** 136 pages checked; 9 metadata/H1/risky-term flags. Lighthouse/PageSpeed did not run because Lighthouse CLI was missing.

## 5. Priority page/query evidence

| Page | Clicks | Impr. | CTR | Avg pos. | Status |
|---|---:|---:|---:|---:|---|
| `/` | 224 | 9,612 | 2.33% | 12.8 | Later review |
| `/collections/dining-tables` | 90 | 8,149 | 1.10% | 15.5 | Remaining priority |
| `/pages/timber-panels` | 123 | 6,744 | 1.82% | 13.9 | Remaining priority |
| Kwila blog | 66 | 4,422 | 1.49% | 6.6 | Outdoor bridge started |
| `/products/bar-leaner` | 10 | 2,336 | 0.43% | 13.8 | Done |
| `/pages/commercial-1` | 5 | 2,249 | 0.22% | 18.0 | Done |
| Bean bag product | 13 | 2,238 | 0.58% | 12.2 | Later/non-core |
| `/pages/hospitality-furniture` | 7 | 2,137 | 0.33% | 25.8 | Drafted, not applied |
| `/collections/hospitality` | 1 | 1,633 | 0.06% | 67.4 | Later review |
| `/products/exterior-bar-leaner` | 6 | 1,489 | 0.40% | 21.1 | Done |
| `/collections/outdoor` | 4 | 1,354 | 0.30% | 21.9 | Started |

Important query leaks:

- Boardroom: `boardroom table` 202 impr/0 clicks/pos 7.6; `boardroom tables` 131/0/7.5; `boardroom table nz` 128/1/6.4; `boardroom tables nz` 77/0/4.9; `boardroom tables auckland` 32/0/6.8.
- Commercial/hospitality: `hospitality furniture` 194/1/11.5; `hospitality furniture nz` 174/0/12.0; `commercial hospitality furniture` 103/0/10.7; `commercial cafe furniture` 90/0/6.9; `commercial furniture restaurant` 85/0/6.3; `nz made hospitality furniture` 87/0/6.8.
- Bar leaners: `bar leaner` 532/0/6.4; `bar leaner nz` 438/4/10.9.
- Dining: `dining table` 1,257/8/14.8; `dining table nz` 742/3/15.6; `dining tables nz` 159/0/21.1.
- Benchtops: `kitchen benchtops nz` 338/1/8.1; `timber benchtops` 171/0/4.8; `timber benchtops nz` 111/0/3.4.
- Outdoor/Kwila: `kwila` 891/9/6.2; `kwila timber` 297/6/4.9; `outdoor tables nz` 118/0/31.5; `outdoor dining table nz` not top 20 in DataForSEO location checks.

## 6. Completed live work

### 6.1 Hospitality image/care fix — completed before this sprint

URL: https://innatefurniture.co.nz/pages/hospitality-furniture  
Theme: `141308166203`

- Replaced problematic hero image setting: `shopify://shop_images/Kokomo.heic` → `shopify://shop_images/Kokomo-hospitality-hero.jpg`.
- Updated care wording to: `Natural materials need normal care, so we set clear expectations before anything is built.`
- Removed/verified absence of `maintenance-free` on that page surface.
- Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260628_214747_hospitality_option2_live_141308166203/`
- Proof: `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-28/hospitality-option2-visual-20260628_094841/`
- Verified raw HTML, desktop/tablet/mobile visuals, mobile lazy image loads.

### 6.2 Global CTR/query SEO meta batch — completed

Theme: `141308166203`

- Touched `snippets/innate-seo-title-override.liquid` and `snippets/innate-seo-description-override.liquid`.
- Affected `/`, `/pages/timber-panels`, `/collections/dining-tables`, `/pages/boardroom-tables`.
- Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260628_225828_live_ctr_query_seo_meta_141308166203/`
- Verification summary: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260628_225951_live_ctr_query_seo_meta_141308166203/summary.json`
- Scope: metadata only; no layout/product/nav/redirect/checkout/body copy changes.

### 6.3 Outdoor/Kwila CTR batch 1 — completed

Theme: `141308166203`

- Outdoor collection title/meta override.
- Kwila article title/meta override.
- Kwila article small contextual CTA linking to `/collections/outdoor` and `/products/west-coast-beech-decking`.
- Kwila article SEO metafields aligned.
- Verified backup/proof: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_072437_live_outdoor_kwila_batch1_141308166203/`
- Earlier folder `20260629_072333_live_outdoor_kwila_batch1_141308166203` aborted on stale readback after snippet update; use `072437` as the verified record.
- Verified: status 200, server theme, title/meta, CTA present, zero `maintenance-free` matches.

### 6.4 Bar Leaner products — completed

Products: `bar-leaner`, `exterior-bar-leaner`

- Updated approved product body/SEO metafields.
- `exterior-bar-leaner` title/H1 changed to `Outdoor Hardwood Bar Leaner`.
- Backup/proof: `/Users/mack-mini/innate-mission-control/backups/shopify-products/20260629_073900_bar_leaner_ctr_batch/`
- Verified Admin readback, product JS, raw public HTML, live theme header.

### 6.5 Alfresco Bar Leaner SEO — completed

Product: `alfresco-bar-leaner`

- SEO metafields only:
  - Title: `Alfresco Bar Leaner NZ | Porcelain & Steel | Innate`
  - Meta: `Porcelain and steel outdoor bar leaner made in Christchurch for patios, courtyards and hospitality spaces. Lower-care surface, custom sizes and NZ-wide delivery.`
- Product title/H1/body/variants/prices/images unchanged.
- Backup/proof: `/Users/mack-mini/innate-mission-control/backups/shopify-products/20260629_074819_alfresco_bar_leaner_ctr/`
- Verified Admin readback, product JS, raw HTML, live theme header.

### 6.6 Boardroom Tables CTR batch + NZ-wide micro-fix — completed

URL: https://innatefurniture.co.nz/pages/boardroom-tables  
Theme: `141308166203`

Touched:

- `snippets/innate-seo-title-override.liquid`
- `snippets/innate-seo-description-override.liquid`
- `templates/page.boardroom-tables.json`

Current live state:

- SEO title: `Boardroom Tables NZ | Custom Timber & Power/Data | Innate`
- H1: `Custom timber boardroom tables`
- Hero sentence: `Made in Christchurch and delivered NZ-wide for offices, studios and commercial spaces. We design around your room size, seating count, timber choice, base style and power or data requirements.`
- CTAs: `Get a boardroom table quote`; `Send room dimensions or plans`

Backups/proof:

- Main batch: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_080530_live_boardroom_ctr_batch_141308166203/`
- Visual CTA tighten: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_081036_live_boardroom_secondary_cta_visual_tighten_141308166203/`
- NZ-wide micro-fix: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_081906_live_boardroom_nzwide_microfix_141308166203/`
- Final proof: `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-29-boardroom-nzwide-microfix/`

Important: `fix_boardroom_hero_secondary_support_20260629.py` exited `Readback mismatch`; do **not** count it as successful. Later scripts fixed the visual CTA and NZ-wide wording correctly.

### 6.7 Commercial overview CTR batch — completed

URL: https://innatefurniture.co.nz/pages/commercial-1  
Theme: `141308166203`

Touched:

- `snippets/innate-seo-title-override.liquid`
- `snippets/innate-seo-description-override.liquid`
- `templates/page.commerical.json`

Important: the page template suffix is misspelled `commerical`; preserve it unless a separate approved cleanup is planned.

Current live state:

- SEO title: `Commercial Furniture NZ | Hospitality & Fit-Out | Innate`
- Meta: `Custom commercial furniture for NZ hospitality, workplace and fit-out projects. Tables, bar leaners and counters made in Christchurch and delivered NZ-wide.`
- H1: `Custom commercial furniture for fit-outs across NZ`
- Hero eyebrow: `MADE IN CHRISTCHURCH. DELIVERED NZ-WIDE.`
- Hero/support/pathway wording includes hospitality, bar leaners, workplace pieces, and NZ-wide clarity.

Backup/proof:

- Backup: `/Users/mack-mini/innate-mission-control/backups/shopify-theme/20260629_084310_live_commercial_overview_ctr_batch_141308166203/`
- Visual proof: `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-29-commercial-overview-ctr-live/`
- Verified: status 200, server theme, title/meta/H1/body phrases, old phrases absent, desktop/mobile pass, zero overflow.

## 7. Drafted but not applied

### Hospitality CTR/conversion batch — draft only

URL: https://innatefurniture.co.nz/pages/hospitality-furniture  
Read-only proof: `/Users/mack-mini/innate-mission-control/reference/evidence/2026-06-29-hospitality-draft-readonly/`

Do **not** apply without Guido approval. Draft was prepared after read-only inspection:

| Item | Current | Draft |
|---|---|---|
| SEO title | `Hospitality Furniture NZ | Cafe & Restaurant Tables | Innate` | `Hospitality Furniture NZ | Café & Bar Tables | Innate` |
| Meta | `Custom cafe tables, restaurant tables, bar leaners and fit-out pieces made in Christchurch for hospitality venues across New Zealand.` | `Custom café tables, restaurant tables, bar leaners and fit-out pieces for NZ hospitality venues. Made in Christchurch and delivered NZ-wide.` |
| H1 | `Custom hospitality furniture, made in New Zealand` | `Custom hospitality furniture for cafés, restaurants and bars` |
| Hero support | `Tables, bar leaners and fit-out pieces made around your venue layout, service flow and daily use.` | `Café tables, restaurant tables, bar leaners and fit-out pieces made around your venue layout, service flow and daily use.` |
| Proof | separate `Made in Christchurch.` + `Nationwide delivery available.` | `Made in Christchurch and delivered NZ-wide.` |
| CTA | `Start a hospitality enquiry` | `Start a hospitality quote` |
| Intro | `We build hospitality tables and commercial furniture...` | `We build custom hospitality tables and commercial furniture for cafés, restaurants, bars, breweries, wineries, lodges, hotels and shared commercial spaces across New Zealand.` |

Recommendation: next approval-gated implementation should likely be this Hospitality batch.

## 8. Remaining work list

### 1. Hospitality CTR batch

Why: page is commercially relevant, already improved visually, but CTR/copy opportunity remains. Query evidence includes `hospitality furniture`, `hospitality furniture nz`, `commercial hospitality furniture`, `cafe tables nz`, `restaurant furniture nz`, `nz made hospitality furniture`.

Next: re-inspect live page, show/confirm draft with Guido, back up snippets/template/section, apply exact approved text, verify raw/rendered.

### 2. Dining collection CTR sprint

Why: `/collections/dining-tables` has 8,149 impressions and only 1.10% CTR despite strong custom dining rankings. Broad terms like `dining table`, `dining table nz`, `dining tables nz` under-click.

Guard: do not push products down or create a big SEO block above the product grid. Keep it commercially useful.

### 3. Timber panels / benchtops quote-readiness

Why: `/pages/timber-panels` has 6,744 impressions and a real configurator funnel. Queries like `timber benchtops nz` rank well but under-click.

Guard: correct configurator source/proof is embedded Shopify `/pages/timber-panels` only. Do not use retired standalone `innate-benchtop-quote`/Vite designer as source or review link.

### 4. Outdoor / Kwila / outdoor product follow-up

Why: Kwila education performs, but outdoor product intent is weak. Need bridge from education to products while respecting care/truth limits.

Guard: no “maintenance-free” for timber; no absolute weatherproof/lifetime claims.

### 5. Merchant Center/free listings setup

Why: connected but blocked by website not claimed, missing business address, no feeds/products, free listings auto-tagging off.

Guard: separate approval required before any Merchant Center changes, website claiming, feed creation, or product data changes.

### 6. Crawl/technical cleanup

Remaining: risky terms, missing/short meta, H1 anomalies, hidden/visible broken images, Lighthouse/PageSpeed tooling gap, Bing deeper collectors.

### 7. Tracking / AI Factory layer

Goal: better connect page context, CTA clicks, configurator/freight actions, timber preference, region, quote-readiness and outcome follow-up without sending PII/full addresses/free-text into analytics.

Guard: any live tracking/contact-form/email automation changes need explicit approval.

## 9. Page ownership map

- **Boardroom page** owns: boardroom table, boardroom tables NZ, meeting table, conference table, boardroom table with power, timber boardroom table.
- **Commercial overview** owns: custom commercial furniture, fit-out pieces, counters, tables, leaners, workplace/hospitality gateway.
- **Hospitality page** owns: hospitality furniture NZ, café tables, restaurant tables, bar leaners, venue fit-out furniture.
- **Outdoor collection/products** own: outdoor tables, outdoor dining table, outdoor bar leaner, hardwood/Alfresco outdoor intent.
- **Kwila article** is education/authority and should bridge to relevant alternatives/products, not become the main product landing page.
- **Timber panels page** owns: timber benchtops, kitchen benchtops, timber panels, configurator/quote readiness.

## 10. Codex implementation checklist

Before any live update:

- [ ] Read current `current-website-state.md` and this handover.
- [ ] Inspect the live page with cache-busting URL.
- [ ] Confirm active live theme ID via Shopify/API or response header where relevant.
- [ ] Fetch current snippets/templates/product records from Shopify/Admin API; do not use stale local files.
- [ ] Produce a before/after draft and get Guido's approval.
- [ ] Back up exact records/assets to timestamped folder.
- [ ] Apply only approved changes.
- [ ] Read back changed assets/records.
- [ ] Verify raw HTML and rendered desktop/mobile.
- [ ] Save screenshots/summary JSON/diffs.
- [ ] Report backup path, proof path, verification, cache caveats, and next step.

Useful notes:

- Use `/Users/mack-mini/.local/bin/hermes-python` for scripts with dependencies.
- Use Playwright for rendered desktop/mobile QA.
- Server/raw/browser cache can disagree; use cache-busting, Chrome-like UA, Admin readback, and DOM checks before deciding a write failed.

## 11. One-sentence handover

Innate has improving rankings and strong custom-furniture demand, but weak CTR and quote clarity are leaking value; Boardroom, Commercial overview, Bar Leaner, Alfresco Bar Leaner, Outdoor/Kwila, global meta, and Hospitality image/care fixes have been completed with backups/proof, Hospitality copy is drafted but not approved, and the next work is a strictly approval-gated page-by-page CTR/conversion sprint plus later Merchant, tracking, and technical cleanup projects.
