# Tuesday durable lanes

Created: 2026-05-17

Purpose: fast capture and durable routing for Innate Mission Control, also called Tuesday. Hermes stays the Telegram front door; implementation workers use these lane briefs when Guido says `BUILD`.

This README is the canonical router for Tuesday reference files. Dated handovers, audits, prompts, and implementation notes are current only when listed here as active; otherwise treat them as searchable evidence/history and re-check current source systems before acting.

## Source-of-truth transition rule

- Supabase/Tuesday is the forward source of truth for leads and for approved Tuesday-owned records.
- Monday remains the current workshop/legacy source for stock, customer history, and production tasks until the Tuesday migration gates in `/Users/mack-mini/innate-mission-control/docs/current/business-operating-context.md` are met.
- Old backfill or reconciliation handovers do not retire Monday by themselves.
- Xero remains the accounting authority for invoices, quotes, payments, bills, and official accounting records.

## Current routers and lane briefs

- `page-contracts.md` — route/view purpose contracts for Tuesday UI/design work. Load this before redesigning a page, tab, or route.
- `leads.md`
- `quoting.md` — quote spine, pricing policy approval, Hermes draft-only quote workflow, supplier freshness gates
- `purchase-orders.md`
- `stocktake.md`
- `freight.md`
- `dashboard.md`
- `foundations.md`
- `inbox.md`
- `costings.md` or `supabase-costings-schema-2026-06-18.sql` for source-backed supplier/material/product costing data.
- `../../docs/current/tuesday-agent-design-standard.md` — active design standard for Tuesday/Mission Control UI work.
- `../../docs/current/tuesday-visual-audit-protocol.md` — active desktop/tablet/mobile proof protocol and scanner route.

## Active operating handovers / current prep

- `../../docs/current/tuesday-agent-design-standard.md` — active design standard for Tuesday/Mission Control UI work
- `../../docs/current/tuesday-visual-audit-protocol.md` — active desktop/tablet/mobile proof protocol and scanner route
- `tuesday-simplification-plan-of-plan-2026-07.md` — planning guardrail for the Tuesday simplification master plan. Load before any simplification planning/build so work stays in Pass 1/2/3 and does not sprawl into an unapproved rebuild.
- `tuesday-simplification-master-plan-2026-07.md` — Pass 1 master skeleton for simplifying Tuesday around stable Supabase read models, collectors/reconciliation, Daily Control, Nick board, Leads, action safety, and verification gates. Draft only until Guido reviews.
- `projects-tasks-workboard-handover-2026-05-20.md` — handover/spec for a Supabase-backed Workboard tab seeded from the Stephen meeting
- `tuesday-readiness-audit-2026-05-24.md` — current percent-readiness audit for Innate lighthouse + external Workshop OS productisation
- `tuesday-agent-handover-2026-05-24.md` — current operating handover for the Tuesday profile/worker
- `nick-production-rollout-guide-2026-06-15.md` — short rollout script for introducing the Production Plan to Nick
- `nick-live-order-trust-audit-2026-06-14.md` — live read-only order/intake shortlist for Nick's first guided training session

## Historical / evidence unless re-verified

- `source-of-truth-reconciliation-handover-2026-05-25.md` — useful reconciliation/backfill evidence, but its blanket wording that Supabase/Tuesday is already source of truth for orders/production must be read through the transition rule above.
- `handover-plan-health-2026-05-21.md` — old restart/push-auth handover.
- `codex-prompt-tuesday-master-shell.md` — task prompt, not durable operating truth.
- `tuesday-overnight-goal-2026-06-08.md` and `tuesday-workshop-process-map-2026-06-08.md` — pointer notes to Air-side drafts; re-check before use.

## Gym Mode protocol

Guido can send short ideas like:
- `Tuesday Leads: ...`
- `Tuesday Quoting: ...`
- `Tuesday PO: ...`
- `Tuesday Stocktake: ...`
- `Tuesday Freight: ...`
- `Tuesday Dashboard: ...`
- `Tuesday Foundations: ...`
- `Tuesday priority: ...`

Hermes should:
1. classify to a lane,
2. append/dedupe into the relevant lane,
3. give a short receipt,
4. consult Website where useful,
5. avoid build/external actions until explicit approval,
6. before calling UI/design work ready, prove the exact route and review source, then check desktop/tablet/mobile using the active Tuesday visual audit protocol,
7. before changing UI/design for a route or tab, load `page-contracts.md`; if no matching contract exists, add a short contract first instead of guessing the screen's purpose.

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Use the current source-of-truth split: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met; Xero remains accounting authority; Shopify remains website/product truth.
- Before calling UI/design work ready, prove the exact route and review source, then check desktop/tablet/mobile using the active Tuesday visual audit protocol.
- Before changing UI/design for a route or tab, load `page-contracts.md`; if no matching contract exists, add a short contract first instead of guessing the screen's purpose.
