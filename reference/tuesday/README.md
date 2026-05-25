# Tuesday durable lanes

Created: 2026-05-17

Purpose: fast capture and durable routing for Innate Mission Control, also called Tuesday. Hermes stays the Telegram front door; implementation workers use these lane briefs when Guido says `BUILD`.

## Active lanes
- `leads.md`
- `purchase-orders.md`
- `stocktake.md`
- `freight.md`
- `dashboard.md`
- `foundations.md`
- `inbox.md`
- `projects-tasks-workboard-handover-2026-05-20.md` — handover/spec for a Supabase-backed Workboard tab seeded from the Stephen meeting
- `workboard-linear-product-brief-2026-05-20.md` — Linear-inspired Workboard product translation for Tuesday
- `workboard-mvp-implementation-plan-2026-05-20.md` — local Workboard MVP implementation plan
- `innate-2talk-sms-setup-2026-05-19.md` — inbound/outbound 2talk SMS setup notes and safety boundaries
- `supabase-sms-messages-schema-2026-05-19.sql` — draft SMS message table schema
- `vercel-cli-deploy.md` — safe Vercel CLI deploy workflow, live links, and post-deploy verification checklist
- `realtime-update-research-2026-05-25.md` — researched Supabase Realtime path for Monday-like cross-computer updates
- `production-plan-task-links-supabase-2026-05-25.sql` — notes for the current Supabase-backed Production Plan task-link storage rollout
- `tuesday-readiness-audit-2026-05-24.md` — current percent-readiness audit for Innate lighthouse + external Workshop OS productisation
- `tuesday-agent-handover-2026-05-24.md` — current operating handover for the Tuesday profile/worker

## Gym Mode protocol

Guido can send short ideas like:
- `Tuesday Leads: ...`
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
5. avoid build/external actions until explicit approval.

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.
