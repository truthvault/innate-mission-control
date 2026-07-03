# Tuesday / Innate Mission Control readiness audit

Date: 2026-05-24
Repository: `/Users/mack-mini/innate-mission-control`
Mode: read-only analysis, except writing this report

## Executive summary

Tuesday is no longer just a concept doc. It has a working Next.js Mission Control app with real lanes for Leads, active Orders/Production, Production Plan, Samples stock, Dispatch/QC, Freight quote logging, and read-only Xero proof. The strongest implemented areas are Monday-backed production/order visibility and the warm Nick/workshop-style Production Plan view. Leads and Freight have real Supabase-oriented data paths, but are less proven as end-to-end daily operating lanes. Purchase Orders, broad Stocktake, Inbox, and generic Workboard/Projects are still mostly planning/reference docs.

My estimate:

- Fully functional Innate lighthouse system: 56%
- Repeatable external Workshop OS product: 28%

The core “lighthouse” proof exists: Tuesday can read live Monday production/order data, show a simple production plan, manage lead records in Supabase, log website freight quote events, and safely keep assistant-like actions approval-gated. The missing middle is trust and closure: automatic hot enquiry capture, robust quote/follow-up workflow, accepted-job handoff fields, production-to-customer promise loop, owner daily brief, and generic implementation templates.

## Percent scores

### Overall

| Target | Readiness | Why |
|---|---:|---|
| Fully functional Innate lighthouse system | 56% | Real app + real integrations exist, especially Monday orders/plan/samples. Still fragmented, some lanes are docs only, and the owner daily brief / lead-to-job loop is incomplete. |
| Repeatable external Workshop OS product | 28% | Good prototype/lighthouse ingredients, but heavily Innate-specific, no generic tenant/config/status model, no standard onboarding checklist, and few externally reusable abstractions. |

### Lane-by-lane lighthouse readiness

| Lane | Readiness | Implemented app? | Real data? | Notes |
|---|---:|---|---|---|
| Dashboard / owner daily brief | 20% | Partial `/today`, root redirect/home shell | Mostly hardcoded/local | `/today` is a nice workshop-task mock but hardcoded. No true daily owner brief combining leads, blocked/late jobs, cash, decisions. |
| Leads | 55% | Yes `/leads`, API create/update | Supabase | Supabase `leads` read/write path exists. Needs verified intake/capture, Gmail/Shopify/web form integration, follow-up automation/draft workflow, conversion to jobs. |
| Active orders / production overview | 75% | Yes `/production` | Monday Orders NEW + snapshots | Solid read-only Monday mirror with mappings, health flags, links to source/order context. Needs richer job handoff/customer promise fields. |
| Production Plan / Nick workshop view | 70% | Yes `/production/plan` | Monday Production Plan + encrypted Blob overlays | Strongest workshop-facing lane: warm UI, DnD planning, order rail, plan health, task/order linking. Writes overlays to Blob rather than Monday. Needs live adoption testing and persistence/merge rules. |
| Dispatch / QC / collection | 45% | Yes `/production/dispatch` plus workflow API | Monday + encrypted Blob workflow state | Dispatch view exists and workflow state API stores collection/QC/tasks, but it is not yet a fully operational shipment/collection lane. |
| Samples stock | 65% | Yes `/production/samples` | Monday sample stock board + snapshot | Good implemented matrix/top-up queue from Monday board. Narrow samples lane, not full stocktake/inventory. |
| Stocktake / inventory | 25% | Partial samples only | Monday samples only | Reference docs for stocktake exist; broad materials/slab/hardware/allocated stock lane is not implemented. |
| Freight / shipping | 50% | Yes `/freight-quotes`, freight APIs | Supabase preferred, Airtable fallback, Mainfreight API, Shopify caller implied | Good quote-event logging and Mainfreight estimator seed. Not yet full booking/tracking/reconciliation lane. |
| Purchase Orders | 15% | No dedicated app route found | Planning says Monday initially, not implemented | Reference doc only; no PO board fetcher/page/API found. |
| Inbox / untriaged ideas | 10% | No app route found | None | Reference capture doc only. |
| Projects / Tasks / Workboard | 20% | No app route found | Planned Supabase | Detailed handover/planned schema exists, but not implemented in app routes. |
| Xero / cash context | 35% | API proof only, used in plan detail | Xero read-only credentials if configured | Read-only invoice lookup exists. Not yet integrated into owner brief/cash-sensitive prioritisation. |
| AI/draft assistance | 25% | Some UI language/planning | Mostly procedural guardrails | Safety posture is strong, but productised assistant workflows are not deeply implemented in UI. |

## 1. Current repo structure for Tuesday

Tuesday is structured as a Next.js app with business-specific Mission Control routes and integrations:

- `app/`
  - `app/page.tsx` root page.
  - `app/today/page.tsx` simple hardcoded workshop-tasks dashboard/mock.
  - `app/leads/page.tsx` + `app/leads/LeadsClient.tsx` Leads UI.
  - `app/production/page.tsx` + `ProductionClient.tsx` active orders/production overview.
  - `app/production/plan/page.tsx` + `PlanClient.tsx` main production planning board.
  - `app/production/dispatch/page.tsx` + `DispatchClient.tsx` dispatch/QC candidates.
  - `app/production/samples/page.tsx` + `SampleStockClient.tsx` samples stock matrix.
  - `app/freight-quotes/page.tsx` freight quote log/admin view.
  - `app/configurator/page.tsx` configurator project dashboard, separate from core Workshop OS lanes.
  - `app/api/...` API routes for leads, Monday refresh/webhook, production workflow overlays, freight, and Xero proof.
- `components/`
  - `mission-control-shell.tsx` shared shell/nav/source status.
  - `mission-control-ui.tsx` shared primitives such as chips.
- `lib/`
  - `lib/monday/*` read-only Monday fetch/mapping/cache/snapshot layers for orders, production plan, sample stock.
  - `lib/leads/*` Supabase lead read/write/types.
  - `lib/production/*` order display, planning suggestions, DnD/task support.
  - `lib/freight/*` freight package/rate/logging/public access logic.
  - `lib/xero/read-only.ts` Xero proof/read-only invoice lookup.
  - `lib/tuesday/encrypted-blob-store.ts` encrypted Vercel Blob storage for Tuesday-owned overlays.
- `scripts/`
  - local planning tests, smoke scripts, mutation guard.
- `reference/tuesday/`
  - canonical lane docs and handovers for Dashboard, Leads, Purchase Orders, Stocktake, Freight, Inbox, Foundations, Production Plan, Workboard.

The repo is not clean. `git status --short` showed existing modified/untracked work, including changes in `.gitignore`, lead files, reference files, scripts, and many untracked reference/evidence files. I did not clean/reset/reformat anything.

## 2. Functional lanes that exist now

### Leads

Implemented:

- `/leads` page and `LeadsClient.tsx`.
- `lib/leads/fetch-leads.ts` reads `public.leads` from Supabase via REST when Supabase env is configured.
- `lib/leads/write-leads.ts` supports create/update.
- `app/api/leads/route.ts` POST create.
- `app/api/leads/[id]/route.ts` PATCH update.

Reference/planning:

- `reference/tuesday/leads.md` says Supabase `public.leads` is forward source of truth and Monday is legacy/reference.

Current judgement:

- Real lane, not just docs.
- Needs proof that all hot enquiries are captured automatically and not manually curated.

### Dashboard / owner daily brief

Implemented:

- `/today` exists, but it is hardcoded with three tasks.
- Shell and nav create an app-like foundation.

Reference/planning:

- `reference/tuesday/dashboard.md` defines desired hot leads, production blockers, cash/payment snippets, stock/freight issues, decisions needed.

Current judgement:

- Mostly not implemented as the real daily owner brief.

### Production / planning / order health

Implemented:

- `/production` reads active orders with `getOrdersWithFallback()`.
- `lib/monday/client.ts` is read-only GraphQL for Monday.
- `lib/monday/fetch-orders.ts` uses cached/fresh/snapshot fallback.
- `lib/monday/mapping.ts` maps Monday Orders NEW board fields to `UiOrder`, including status, product, quantity, value, dates, Xero invoice/link, freight ref, delivery location.
- `/production/plan` reads Monday production plan rows and Monday orders, then renders a large DnD planning UI.
- Plan UI includes order rail, order health strip, new-order planning suggestions, plan task/order links, workshop tasks, collection/QC/workflow details, and Xero proof lookup hooks.
- `app/api/production/plan-task-links/route.ts` stores task-to-order links in encrypted Blob JSON.
- `app/api/production/order-workflow/route.ts` stores per-order collection/QC/tasks workflow state in encrypted Blob JSON.
- `/production/dispatch` shows dispatch/QC candidates from Monday orders.
- `app/api/production/order-photos/route.ts` exists, but I did not inspect it in depth.

Reference/planning:

- `reference/tuesday/handover-plan-health-2026-05-21.md` documents production plan health-strip work and prior verification.

Current judgement:

- This is the most mature system area.
- It is still mostly a read model plus Tuesday-owned overlay state, not a full source-of-truth production control system.

### Inbox

Implemented:

- No app route found.

Reference/planning:

- `reference/tuesday/inbox.md` is a small capture policy for gym-mode/untriaged ideas.

Current judgement:

- Reference only.

### Purchase Orders

Implemented:

- No app route, library, or API dedicated to purchase orders found in current app route list.

Reference/planning:

- `reference/tuesday/purchase-orders.md` defines purpose, likely fields, Monday as initial source of truth, and draft supplier follow-up actions.

Current judgement:

- Mostly planning doc only.

### Stocktake

Implemented:

- `/production/samples` is implemented for sample stock.
- `lib/monday/sample-stock.ts` reads a Monday sample stock board, maps sample types/species/finishes/counts into stock levels.
- `lib/monday/fetch-sample-stock.ts` has cache/snapshot fallback.

Reference/planning:

- `reference/tuesday/stocktake.md` defines broader material/species/dimension/location/allocation stocktake.

Current judgement:

- Samples stock is implemented and useful, but full stocktake is not.

### Freight

Implemented:

- `/freight-quotes` shows recent freight quote events and logging status.
- `app/api/freight/dining-estimate/route.ts` estimates dining freight, calls Mainfreight when configured, handles local Pinpoint/local delivery rules, logs quote events.
- `lib/freight/quoteLog.ts` writes quote events to Supabase if enabled/configured, with Airtable as legacy fallback.
- `lib/freight/mainfreightRate.ts` calls Mainfreight Rate API when configured.
- Public access guard/rate guard exists in `lib/freight/publicAccess.ts` by reference from route.

Reference/planning:

- `reference/tuesday/freight.md` explicitly says `/freight-quotes` is the current seed of future Freight/Shipping tab.

Current judgement:

- Good seed lane. Not yet complete freight OS: no booking/tracking/reconciliation workflow visible as a full lane.

### Projects / tasks / Workboard

Implemented:

- No app route found for Workboard/Projects/Tasks.

Reference/planning:

- `reference/tuesday/projects-tasks-workboard-handover-2026-05-20.md` is detailed, including Supabase schema concept for `work_sources`, `work_projects`, `work_tasks`.

Current judgement:

- Planning/handover only.

## 3. Implemented code vs reference/planning docs

### Actually implemented in app code

- Mission Control shell/nav/source status: `components/mission-control-shell.tsx`.
- Shared UI primitives: `components/mission-control-ui.tsx`.
- Leads UI and Supabase API: `app/leads/*`, `app/api/leads/*`, `lib/leads/*`.
- Active production/orders: `app/production/*`, `lib/monday/client.ts`, `lib/monday/fetch-orders.ts`, `lib/monday/mapping.ts`.
- Production Plan: `app/production/plan/*`, `lib/monday/fetch-plan.ts`, `lib/monday/production-plan.ts`, `lib/monday/production-plan-mapping.ts`, `lib/production/new-order-planning.ts`, `lib/production/plan-drag.ts`.
- Tuesday-owned plan/order overlays: `app/api/production/plan-task-links/route.ts`, `app/api/production/order-workflow/route.ts`, `lib/tuesday/encrypted-blob-store.ts`.
- Dispatch/QC seed: `app/production/dispatch/*`.
- Samples stock: `app/production/samples/*`, `lib/monday/sample-stock.ts`, `lib/monday/fetch-sample-stock.ts`.
- Freight quote log/estimator: `app/freight-quotes/page.tsx`, `app/api/freight/*`, `lib/freight/*`.
- Xero read-only proof: `app/api/xero/proof/route.ts`, `lib/xero/read-only.ts`.
- Safety checks/tests: `scripts/check-no-monday-mutations.sh`, planning test scripts, smoke scripts.

### Mostly reference/planning only

- Dashboard/owner brief beyond a hardcoded `/today` mock.
- Purchase Orders.
- Full stocktake/inventory beyond sample stock.
- Inbox/untriaged ideas.
- Workboard/Projects/Tasks.
- Standard external Workshop OS implementation checklist/playbook.
- Generic statuses/fields/config per business.

## 4. Visible real data-source connections

No secrets were exposed or copied. I identified only env variable names, endpoint types, and code paths.

| Source | Visible connection | Direction | Notes |
|---|---|---|---|
| Monday | `https://api.monday.com/v2`, `MONDAY_API_TOKEN`, `MONDAY_ORDERS_BOARD_ID`, production plan board/default IDs, sample stock board default `18412532131` | Read-only | `assertReadOnlyBody()` used. Mutation guard passed. Cache/snapshot fallback for orders/plan/samples. |
| Supabase | `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` | Leads read/write, freight quote event write/read | Leads use `public.leads`. Freight uses `freight_quote_events`. |
| Airtable | `AIRTABLE_API_KEY`, default base/table IDs in `quoteLog.ts` | Legacy freight quote fallback | Explicitly marked legacy fallback, not preferred. |
| Xero | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, fallback read from `/Users/mack-mini/.hermes/secrets/innate-integrations.json` | Read-only proof/invoice lookup | `app/api/xero/proof/route.ts`; sanitises auth secrets in errors. Uses OAuth/client credentials style. |
| Gmail | Search found no implemented Gmail app/lib integration in inspected code | None visible | Reference docs mention Gmail/context as supporting evidence only. |
| Shopify | Freight endpoint designed for Shopify/theme caller; product/page/variant fields logged | Public API called by Shopify/theme, not Shopify Admin integration | No Shopify Admin writes found in inspected code. |
| Mainfreight | `MAINFREIGHT_RATE_API_KEY`, account/service envs, API URL | Rate quote read/call | Used by freight estimator. |
| Vercel Blob | `@vercel/blob`, `BLOB_READ_WRITE_TOKEN` implied | Snapshots and encrypted Tuesday overlays | Orders/plan/samples snapshots private; Tuesday workflow/link overlays encrypted but stored with Blob public access envelope. |
| Local mocks/static | `/today` hardcoded tasks; configurator dashboard localStorage | Local/mock | Useful UI prototypes, not production source-of-truth. |

## 5. Readiness toward fully functional Innate lighthouse system

Overall: 56%

Scoring rationale against the definition:

| Requirement | Readiness | Evidence / gap |
|---|---:|---|
| Every hot enquiry captured and visible | 45% | Leads Supabase lane exists, but no proven automatic capture from website/Gmail/Shopify/all channels. |
| Quote/follow-up pipeline works | 50% | Lead statuses/next actions exist; needs verified follow-up workflow, reminders, draft generation, max-follow-up guard. |
| Accepted jobs hand off into production with specs/promises | 45% | Monday orders/production views exist; handoff-specific customer promises/spec completeness not systematically modelled. |
| Nick/workshop-facing view simple/warm/low-change | 70% | Production Plan and Dispatch/Samples UI are warm and purpose-built. Needs live adoption proof with Nick. |
| Owner daily brief shows leads, blocked/late jobs, cash, decisions | 25% | `/today` is hardcoded. No true aggregated daily brief. |
| Customer context/promises retained | 45% | Lead notes, order fields, workflow state exist; no unified customer timeline/promise model. |
| Safe drafts/AI approval-gated | 40% | Strong docs/guardrails, no automatic sends; limited implemented draft workflows. |
| Core live data trusted enough for 1–2h/day | 55% | Monday production read paths mature; leads/freight partial; dashboard/integration health not yet enough to trust blindly. |

## 6. Readiness toward repeatable external Workshop OS product

Overall: 28%

What is repeatable already:

- The conceptual shape is good: lead-to-job control, owner brief, simple workshop view, safe assistant rules.
- The app proves a small-manufacturer operating layer can sit above messy source systems.
- Read-only integration posture, source labels, and warm/non-enterprise UI are reusable principles.
- Freight quote logging, production health strips, and order/task linking are useful product patterns.

Key blockers to productisation:

1. Innate-specific fields, statuses, board IDs, people, product categories, sample species/finishes, and visual copy are hardcoded.
2. No tenant/customer config model for statuses, fields, lanes, users, data sources, or permissions.
3. No standard discovery/onboarding checklist converted into app setup tasks.
4. No generic lead-to-job schema spanning enquiries, quotes, accepted jobs, promises, production stages, and delivery.
5. No integration boundary catalogue saying which source systems are read-only, write-back, or Tuesday-owned per client.
6. No reusable owner brief template implemented in code.
7. No external-client security/hosting story: auth, roles, audit log, secrets, backups, retention.
8. No implementation runbook for Taylor to repeat with low custom work.
9. No pilot success metrics/instrumentation.
10. No packaged 80/20 template with optional adapters for Monday/Xero/Gmail/Shopify/Airtable/Supabase.

## 7. Top 10 gaps, ranked by impact and speed to fix

| Rank | Gap | Impact | Speed | Why it matters |
|---:|---|---|---|---|
| 1 | No real owner daily brief | Very high | Medium | This is the 1–2h/day control surface and lighthouse promise. |
| 2 | Lead capture not proven end-to-end from all hot sources | Very high | Medium | Dropped enquiries are the core pain. |
| 3 | No accepted-job handoff checklist/spec completeness model | Very high | Medium | Production trust depends on clear promises/specs. |
| 4 | Production Plan overlay persistence is Tuesday-owned but not clearly operationally governed | High | Medium | Task/order links and workflow state need merge/reset/audit rules. |
| 5 | Purchase Orders lane absent | High | Medium | PO blockers are part of production/cash risk. |
| 6 | Full stocktake absent beyond samples | Medium-high | Medium/slow | Materials availability affects quoting and production promises. |
| 7 | Freight is quote-log seed, not booking/tracking/reconciliation | Medium-high | Medium | Delivery promises and actual-vs-quoted freight remain leaky. |
| 8 | Xero/cash is proof endpoint, not daily cash-sensitive signal | Medium-high | Medium | Cash-sensitive decisions are explicitly part of America Mode / owner brief. |
| 9 | No generic external Workshop OS config/schema | High for product | Slow | Blocks repeatability and Taylor implementation scale. |
| 10 | No adoption metrics / live trust checks | Medium | Fast | Need proof that Nick/Guido can rely on it without memory management. |

## 8. Top 10 next build tasks with paths and verification

1. Build real Owner Daily Brief aggregator
   - Paths:
     - `app/today/page.tsx`
     - new `lib/tuesday/daily-brief.ts`
     - possibly `components/mission-control-ui.tsx`
   - Scope:
     - Replace hardcoded tasks with hot leads, overdue/stale leads, late/blocked orders, plan health, sample/freight issues, Xero/cash flags.
   - Verification:
     - Local render of `/today`.
     - Unit fixture test for `buildDailyBrief()` with sample leads/orders/plan/freight data.
     - `npm run lint`.

2. Add lead intake/source health panel
   - Paths:
     - `app/leads/LeadsClient.tsx`
     - `lib/leads/fetch-leads.ts`
     - `reference/tuesday/leads.md`
   - Scope:
     - Show lead counts by source/status, stale leads, missing next action, no-contact leads, last sync/source labels.
   - Verification:
     - Supabase-unconfigured fallback still renders.
     - Mock fixture or local test for stale/hot lead derivation.
     - `npm run lint`.

3. Define and implement accepted-job handoff checklist
   - Paths:
     - `lib/monday/mapping.ts`
     - new `lib/production/handoff-health.ts`
     - `app/production/ProductionClient.tsx`
     - `app/production/plan/PlanClient.tsx`
   - Scope:
     - Derive missing promise/spec fields: ship date, product/spec, value, delivery location/freight, Xero invoice, notes/context, plan link.
   - Verification:
     - Fixture test for complete/incomplete jobs.
     - UI shows a clear “Ready for workshop / Needs detail” signal.
     - `npm run test:planning`, `npm run lint`.

4. Add Production Plan overlay audit/status panel
   - Paths:
     - `app/api/production/plan-task-links/route.ts`
     - `app/api/production/order-workflow/route.ts`
     - `app/production/plan/PlanClient.tsx`
     - `lib/tuesday/encrypted-blob-store.ts`
   - Scope:
     - Show whether overlay storage is connected, last updated, counts of linked/unlinked tasks, save failures.
   - Verification:
     - With missing Blob token, UI shows disabled state not silent failure.
     - Local API GET returns default state safely.
     - `npm run lint`.

5. Build Purchase Orders read-only Monday lane MVP
   - Paths:
     - new `app/purchase-orders/page.tsx`
     - new `app/purchase-orders/PurchaseOrdersClient.tsx`
     - new `lib/monday/fetch-purchase-orders.ts`
     - new `lib/monday/purchase-orders-mapping.ts`
     - update `components/mission-control-shell.tsx`
   - Scope:
     - Read Monday PO board fields, show supplier/status/expected arrival/linked job/blockers.
   - Verification:
     - Dry-run fetch with no writes.
     - `npm run check:mutations` must pass.
     - `npm run lint`.

6. Promote Samples into broader Stocktake shell
   - Paths:
     - new `app/stocktake/page.tsx`
     - existing `app/production/samples/*`
     - new `lib/monday/fetch-stocktake.ts` if a broad board is identified.
   - Scope:
     - Keep sample stock as first tab/card; add placeholders/source status for timber/material inventory.
   - Verification:
     - `/stocktake` renders with current sample matrix and clear “broad stock not connected” status.
     - `npm run lint`.

7. Expand Freight from quote log to action queue
   - Paths:
     - `app/freight-quotes/page.tsx`
     - `lib/freight/quoteLog.ts`
     - new `lib/freight/freight-actions.ts`
   - Scope:
     - Add queue for manual checks, high quotes, missing booking, quote-vs-order handoff candidates.
   - Verification:
     - Fixture test for manual-check/high-quote classification.
     - No live freight API call required.
     - `npm run lint`.

8. Integrate Xero proof into daily cash-sensitive signals
   - Paths:
     - `lib/xero/read-only.ts`
     - `app/api/xero/proof/route.ts`
     - new `lib/tuesday/cash-signals.ts`
     - `app/today/page.tsx`
   - Scope:
     - Summarise missing invoice links, unpaid/overdue proof if safely available read-only.
   - Verification:
     - If Xero unconfigured, daily brief still renders with “Xero not connected”.
     - Error sanitisation remains.
     - `npm run lint`.

9. Create generic Workshop OS schema/config draft from Innate lanes
   - Paths:
     - new `reference/workshop-os/implementation-template.md`
     - new `reference/workshop-os/schema-core.md`
     - optionally new `lib/workshop-os/config.ts`
   - Scope:
     - Extract generic lead/job/production/promise/owner-brief model and mark Innate-specific mappings as adapters.
   - Verification:
     - Review doc has clear 80/20 core vs client-specific adapter sections.
     - No app mutation needed.

10. Add local source-of-truth/readiness smoke report
   - Paths:
     - new `scripts/audit-tuesday-readiness.mjs`
     - update `package.json` with non-mutating script, e.g. `audit:tuesday`
   - Scope:
     - Check route files exist, env presence only by boolean, mutation guard, lane implementation status.
   - Verification:
     - Script outputs no secrets.
     - `npm run audit:tuesday` exits 0 locally.
     - `npm run check:mutations` passes.

## 9. Guido/Taylor discussion points before external pilots

1. What exactly is the sellable wedge: “lead-to-job control” only, or includes production/stock/freight from day one?
2. Which client systems are acceptable for first pilots: Monday, Airtable, Google Sheets, Xero, Gmail, Shopify, or “whatever they have”?
3. What is Taylor implementing: a bespoke Next/Supabase template, a Retool/Stacker/Softr-style layer, or automation around existing tools?
4. What is the 80/20 standard data model: lead, quote, job, promise, production step, shipment, invoice/cash flag?
5. Which actions are never automated externally: emails, invoices, payments, customer SMS, supplier POs, source-system writes?
6. How will approval-gated AI be explained simply to non-technical owners and staff?
7. Who owns support after setup: Taylor technical support, Guido workflow/product support, or both?
8. What minimum adoption proof does Innate need first: Nick uses plan daily, Guido uses daily brief, hot lead capture complete, fewer missed follow-ups?
9. How will pilots be priced and bounded so they do not become open-ended custom ERP projects?
10. What client data/security baseline is non-negotiable: auth, roles, audit trail, backups, retention, secrets handling, access revocation?
11. How much Innate-specific UI warmth becomes generic Workshop OS style versus per-client branding?
12. What are the “stop signs” for bad-fit clients: too custom, no owner buy-in, messy data with no process owner, wants full ERP replacement?

## Evidence table

| Evidence | Path | Interpretation |
|---|---|---|
| App routes list | `app/**/page.tsx` | Found routes for leads, production, production plan, dispatch, samples, freight quotes, today, configurator. No PO/stocktake/workboard route. |
| Package scripts | `package.json` | Local lint, mutation guard, planning tests, smoke scripts exist. |
| Leads source | `lib/leads/fetch-leads.ts`, `lib/leads/write-leads.ts`, `app/api/leads/*` | Supabase-backed lead lane with create/update. |
| Monday order source | `lib/monday/client.ts`, `lib/monday/fetch-orders.ts`, `lib/monday/mapping.ts` | Read-only Monday orders with cache/snapshot fallback and UI mapping. |
| Production plan source | `lib/monday/production-plan.ts`, `lib/monday/fetch-plan.ts`, `app/production/plan/PlanClient.tsx` | Read-only Monday production plan plus local overlay interactions. |
| Tuesday overlay storage | `lib/tuesday/encrypted-blob-store.ts`, `app/api/production/order-workflow/route.ts`, `app/api/production/plan-task-links/route.ts` | Tuesday-owned workflow/task-link state stored in encrypted Blob JSON. |
| Samples source | `lib/monday/sample-stock.ts`, `app/production/samples/SampleStockClient.tsx` | Implemented Monday sample stock matrix/top-up lane. |
| Freight source | `lib/freight/quoteLog.ts`, `app/api/freight/dining-estimate/route.ts`, `app/freight-quotes/page.tsx` | Supabase/Airtable quote logging and Mainfreight estimator seed. |
| Xero source | `lib/xero/read-only.ts`, `app/api/xero/proof/route.ts` | Read-only proof/invoice lookup exists. |
| Reference lanes | `reference/tuesday/*.md` | Dashboard, Leads, PO, Stocktake, Freight, Inbox, Foundations, Workboard docs define intended lanes and guardrails. |
| Safety check | `scripts/check-no-monday-mutations.sh` | Confirmed no Monday mutations in `app/` or `lib/`. |

## Checks run

Commands run from `/Users/mack-mini/innate-mission-control`:

```bash
npm run check:mutations
npm run test:planning
npm run lint
```

Results:

- `npm run check:mutations`: passed. Output: `OK: no Monday mutation operations found in app/ or lib/.`
- `npm run test:planning`: passed. Planning, colour, and drag stress tests passed. Node warned that package lacks `"type": "module"` for `.ts` ES-module imports.
- `npm run lint`: passed.

Skipped:

- `npm run build`: skipped because it may write `.next` build output and was not necessary for this read-only audit.
- Live smoke scripts/API refreshes: skipped to avoid live service reads/writes beyond static/local inspection. No Supabase/Monday/Xero/Mainfreight live calls were intentionally made by me.

## Risks and blockers

- The repo has significant existing dirty/untracked work. Any build task should use a clean worktree/branch and avoid stomping current reference/script changes.
- Some app lanes depend on env configuration. If Supabase, Blob, Monday, Xero, or Mainfreight envs are missing, UI may show empty/disabled/error states rather than live data.
- Vercel Blob encrypted overlay storage uses encrypted envelopes, but Blob access is configured as public for the stored envelope in `encrypted-blob-store.ts`; this may be acceptable because ciphertext is encrypted, but it deserves a security review before external pilots.
- The Production Plan is large and highly Innate-specific. It is valuable as lighthouse proof but not yet a generic product module.
- Xero fallback now reads current Hermes integrations storage. External productisation should still use explicit deployment env vars rather than local machine secrets.
- Gmail is not visibly integrated in code, so customer context still likely depends on manual inspection or separate Hermes workflows.
- Purchase Orders and broad Stocktake are not implemented, despite being named as durable lanes in docs.
