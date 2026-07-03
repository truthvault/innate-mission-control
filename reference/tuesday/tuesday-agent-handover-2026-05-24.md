# Tuesday agent handover

Date: 2026-05-24
Audience: `tuesday` Hermes profile and any Codex/Hermes worker building Innate Mission Control
Repo: `/Users/mack-mini/innate-mission-control`
Status: working handover after Workshop OS one-pager + Tuesday readiness audit

## Mission

Tuesday owns the **Tuesday / Innate Mission Control app**, with special responsibility for:

- production planning
- Nick-facing workshop views
- dashboard / daily-control surfaces
- lead-to-job operational flow inside the app
- making the system useful enough for Guido to run Innate from America in August with about 1–2 hours/day

The goal is not a shiny app. The goal is **exception-based control**:

> Guido should see what needs his decision, Nick should see what matters in the workshop, and the business should stop depending on Guido’s memory.

## First files to read before serious work

Always start here:

1. `/Users/mack-mini/innate-mission-control/AGENTS.md`
2. `/Users/mack-mini/innate-mission-control/reference/INDEX.md`
3. `/Users/mack-mini/innate-mission-control/reference/august-america-mode-operating-plan-2026.md`
4. `/Users/mack-mini/innate-mission-control/reference/tuesday/README.md`
5. `/Users/mack-mini/innate-mission-control/reference/tuesday/tuesday-readiness-audit-2026-05-24.md`
6. Relevant lane docs under `/Users/mack-mini/innate-mission-control/reference/tuesday/`

For the emerging external product direction, also read:

- `/Users/mack-mini/innate-mission-control/reference/workshop-os-one-pager-2026-05-24.md`

## Current architecture snapshot

The readiness audit estimates:

- **Innate lighthouse readiness:** 56%
- **External Workshop OS product readiness:** 28%

Interpretation:

- Tuesday is real, not vaporware.
- Strongest area: Monday-backed production / Production Plan / Nick-style workshop view.
- Weakest critical area: true owner daily brief and complete lead-to-job closure.
- External product readiness is early because the app is still heavily Innate-specific.

## Repo and app structure

Core app paths:

- `app/today/page.tsx` — current daily view; mostly hardcoded and needs to become the real owner brief.
- `app/leads/page.tsx`, `app/leads/LeadsClient.tsx` — Supabase-backed Leads UI.
- `app/api/leads/*` — lead create/update APIs.
- `app/production/page.tsx`, `app/production/ProductionClient.tsx` — active orders / production overview.
- `app/production/plan/page.tsx`, `app/production/plan/PlanClient.tsx` — main Production Plan / workshop board.
- `app/production/dispatch/page.tsx`, `app/production/dispatch/DispatchClient.tsx` — dispatch/QC seed.
- `app/production/samples/page.tsx`, `app/production/samples/SampleStockClient.tsx` — sample stock matrix.
- `app/freight-quotes/page.tsx` — freight quote log/admin seed.
- `app/api/freight/*` — freight estimator/logging APIs.
- `app/api/xero/proof/route.ts` — read-only Xero proof endpoint.
- `components/mission-control-shell.tsx` — shared navigation/shell/source status.
- `components/mission-control-ui.tsx` — shared UI primitives.

Core library paths:

- `lib/monday/*` — read-only Monday fetch/mapping/cache/snapshot layers.
- `lib/leads/*` — Supabase lead read/write/types.
- `lib/production/*` — order display, planning suggestions, DnD/task support.
- `lib/freight/*` — freight package/rate/logging/public access logic.
- `lib/xero/read-only.ts` — Xero read-only proof logic.
- `lib/tuesday/encrypted-blob-store.ts` — encrypted Vercel Blob storage for Tuesday-owned overlays.

Safety/test paths:

- `scripts/check-no-monday-mutations.sh`
- `scripts/test-new-order-planning.mjs`
- `scripts/test-plan-new-order-colours.mjs`
- `scripts/test-plan-drag-stress.mjs`
- `scripts/smoke-tuesday.mjs`
- `scripts/smoke-freight.mjs`

## Current lane status

### Dashboard / owner daily brief

Readiness: 20%

- `/today` exists but is mostly hardcoded.
- This is the highest-priority missing control surface.
- It needs to combine hot leads, blocked/late orders, production plan health, cash/Xero flags, freight/sample issues, and decisions needed.

### Leads

Readiness: 55%

- `/leads` exists.
- Supabase `public.leads` read/write path exists.
- Needs proven capture from all hot sources: Gmail, website/forms, Shopify/configurator, manual notes.
- Needs stronger stale lead / next action / quote follow-up logic.

### Active orders / production overview

Readiness: 75%

- `/production` is a real Monday-backed read model.
- Maps active orders, values, dates, links, freight refs, Xero invoice links, and status.
- Needs richer accepted-job handoff health: specs, promises, missing detail, customer context.

### Production Plan / Nick workshop view

Readiness: 70%

- Strongest Tuesday lane.
- `/production/plan` has warm workshop UI, DnD planning, order rail, order health, task/order linking, workflow overlays.
- Needs live adoption proof with Nick and clearer overlay audit/merge/reset rules.

### Dispatch / QC

Readiness: 45%

- `/production/dispatch` exists.
- Order workflow state exists through encrypted Blob overlays.
- Needs to mature into a real shipment/collection/QC action queue.

### Samples stock

Readiness: 65%

- `/production/samples` is implemented from Monday sample stock board.
- Useful matrix/top-up queue.
- Not a full stocktake/materials inventory lane yet.

### Stocktake / inventory

Readiness: 25%

- Reference docs exist.
- Full timber/material/hardware/allocated stock view is not implemented.

### Freight

Readiness: 50%

- `/freight-quotes` and freight APIs exist.
- Supabase quote logging with Airtable fallback.
- Mainfreight estimator seed exists.
- Not yet booking/tracking/reconciliation or “delivery promise risk” lane.

### Purchase Orders

Readiness: 15%

- Reference doc only.
- No dedicated PO route/lib/API found in audit.

### Inbox / untriaged ideas

Readiness: 10%

- Reference capture policy only.
- No implemented app route.

### Projects / Tasks / Workboard

Readiness: 20%

- Detailed handover/spec exists.
- No app route found yet.

### Xero / cash context

Readiness: 35%

- Read-only proof endpoint exists.
- Not yet part of daily brief / cash-sensitive prioritisation.

## Current data-source posture

Do not expose or write secrets.

Known integrations from code inspection:

- Monday: read-only GraphQL source for orders, production plan, sample stock.
- Supabase: forward source for leads and preferred freight quote event logging.
- Airtable: legacy freight quote fallback.
- Xero: read-only invoice/proof lookup.
- Mainfreight: rate quote read/call through freight estimator.
- Shopify: public/theme caller implied for freight/configurator events; no Shopify Admin write path found in Tuesday audit.
- Gmail: no direct app integration found; still likely handled by Hermes workflows.
- Vercel Blob: encrypted overlay/snapshot storage.

## Non-negotiable boundaries

Tuesday may inspect, draft, test, and build local code when approved.

Tuesday must not, without exact approval:

- deploy to Vercel
- push or merge branches
- mutate Monday, Xero, Shopify, Gmail, Supabase production data, or customer records
- send emails/SMS/messages
- publish website/content/product changes
- delete files, records, branches, or worktrees
- restart services or alter gateway/provider/cron settings
- store secrets in files, memory, reports, screenshots, or chat

Monday must remain read-only unless Guido gives exact approval for a specific write. Run `npm run check:mutations` before claiming code is safe.

## Working practice for Tuesday agent

Before editing:

1. Inspect `git status --short`.
2. Inspect `git worktree list` if doing code work.
3. Use an isolated `agent-task/tuesday-*` branch/worktree unless Guido explicitly says otherwise.
4. Do not stomp dirty files or unrelated reference/website work.
5. Read the relevant lane doc first.

During work:

- Prefer small, verifiable changes.
- Keep UI blatantly simple, warm Innate, low-change, not Monday-like or dark/jumpy.
- Use source-status labels when data may be stale, mocked, or disconnected.
- Preserve graceful fallback when env vars are missing.
- Do not turn Nick-facing views into admin dashboards.

Before reporting ready:

- `npm run lint`
- `npm run check:mutations`
- `npm run test:planning` when Production Plan is touched
- targeted smoke for affected route if safe
- `READ_ONLY_MONDAY_SYNC=true npm run build` when doing serious code work and build output is acceptable

If a test is skipped, say why.

## Immediate build priority

The next Tuesday build should focus on becoming a true Innate lighthouse system, not on external productisation yet.

Priority order:

1. **Real Owner Daily Brief**
   - Replace hardcoded `/today` tasks.
   - Create `lib/tuesday/daily-brief.ts`.
   - Pull in hot/stale leads, blocked/late orders, plan health, cash/Xero flags, sample/freight issues, and decisions needed.

2. **Lead intake/source health**
   - Show lead counts by source/status.
   - Flag stale hot leads, missing next action, no-contact leads, and uncertain source sync.
   - Make it obvious whether every hot enquiry is actually captured.

3. **Accepted-job handoff health**
   - Add “Ready for workshop / Needs detail” logic.
   - Check product/spec, due date, delivery/freight, Xero/invoice link, customer promise, notes/context, and production-plan linkage.

4. **Production Plan overlay audit/status**
   - Show whether Blob overlay state is connected.
   - Show last updated, linked/unlinked task counts, and save failures.
   - Avoid silent trust failures.

5. **PO read-only lane MVP**
   - Build a simple source-labelled view before any write-back.
   - Supplier, status, expected arrival, linked job, blocker.

6. **Stocktake shell**
   - Promote Samples into a broader stocktake surface.
   - Clearly label broad materials stock as not connected until source is defined.

7. **Freight action queue**
   - Move from quote log toward manual checks, high quotes, missing bookings, and order handoff candidates.

8. **Xero cash-sensitive daily signals**
   - Add read-only cash flags to Owner Daily Brief.
   - Gracefully show “Xero not connected” when unavailable.

9. **Workshop OS generic schema docs**
   - Extract generic lead/job/production/promise/owner-brief model.
   - Mark Innate-specific mappings as adapters.

10. **Readiness smoke script**
   - Add a non-mutating `audit:tuesday` script that checks lane file presence, env booleans, mutation guard, and basic route readiness without exposing secrets.

## First task recommendation

Start with **Owner Daily Brief MVP**.

Suggested scope:

- Add `lib/tuesday/daily-brief.ts`.
- Replace `/today` hardcoded cards with derived sections:
  - hot leads
  - stale/waiting leads
  - production blockers
  - late/due-soon jobs
  - customer promises at risk
  - freight/sample issues
  - Xero/cash status placeholder or read-only signal
  - one most important decision
- Use clear source labels: Supabase, Monday, Blob overlay, Xero, fallback/mock.
- If a source is unavailable, show a plain disabled/warning state instead of pretending.

Verification:

- Fixture test for `buildDailyBrief()`.
- `/today` renders with mock/fallback data.
- `npm run lint`.
- `npm run check:mutations`.

## Workshop OS productisation note

Workshop OS is the emerging external product idea:

> A simple operating system for small NZ manufacturers that keeps enquiries, quotes, jobs, workshop priorities, customer promises, and owner decisions out of people’s heads and in one calm place.

Do not productise too early.

First make Innate/Tues a credible lighthouse. Then extract the repeatable pattern.

External product blockers today:

- too much Innate-specific hardcoding
- no tenant/client config model
- no generic lead-to-job schema
- no Taylor implementation checklist/runbook
- no external security/hosting/support story
- no standard integration boundary catalogue

When working on generic Workshop OS docs, keep the split clear:

- **Core repeatable model:** lead, quote, job, promise, production step, delivery, invoice/cash flag, owner brief.
- **Innate adapter:** timber/products, Monday board IDs, Nick view, Innate-specific statuses, sample species/finishes.

## Taylor discussion points

Before external pilots, Guido and Taylor should decide:

1. Is the first sellable wedge only lead-to-job control, or does it include production/stock/freight?
2. Which client systems are acceptable for pilots: Monday, Airtable, Google Sheets, Xero, Gmail, Shopify?
3. What stack will Taylor implement and maintain?
4. What is the standard data model?
5. Which actions are never automated externally?
6. How are approval-gated AI drafts explained to non-technical owners?
7. Who owns support after setup?
8. What proof must Innate show first?
9. How are pilots priced and bounded?
10. What client data/security baseline is mandatory?
11. What are the stop signs for bad-fit clients?

## Reporting format

Use this format when reporting to Guido/Hermes:

```text
Tuesday report

Changed:
- ...

Checked:
- ...

Not changed:
- no deploy
- no live data mutations
- no sends/publishes

Blocked / risks:
- ...

Next approval:
- exact approval needed, if any
```

Keep it short. Guido should not have to manage the agent.

## Current blockers / cautions

- Repo has significant dirty/untracked work. Do not clean/reset/reformat without explicit approval.
- Build work should happen in a clean task branch/worktree.
- Some lanes depend on env config. Do not assume live data exists.
- Vercel Blob encrypted overlays should get a security review before external pilots.
- Xero fallback reads current Hermes integrations storage at `/Users/mack-mini/.hermes/secrets/innate-integrations.json`. Do not expand retired OpenClaw dependencies.
- Gmail is not visibly integrated in app code, so customer context still likely depends on Hermes workflows.
- Purchase Orders and full Stocktake are named lanes but not implemented yet.

## North star question

When choosing what to build next, ask:

> What makes Tuesday more useful for Guido/Nick before August without creating merge chaos?
