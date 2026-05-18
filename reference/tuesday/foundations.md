# Tuesday lane: Foundations

Created: 2026-05-17

## Purpose
Define the shared Tuesday architecture so each tab does not invent its own schema, statuses, sync rules, or safety boundaries.

## Primary users
- Hermes/default as intake/router
- Website/Tues specialist for UI/review
- Implementation workers when Guido says `BUILD`

## Captured requirements
- Durable lanes for Leads, Purchase Orders, Stocktake, Freight, Dashboard, and Foundations.
- Capture/dedupe ideas during Gym Mode.
- Consult Website where useful.
- Build only when Guido says `BUILD`.

## Foundation decisions to make before broad build
- Top tab list and labels.
- Shared layout pattern for board-like tabs.
- Read-only vs write-back boundaries per source.
- Naming conventions for fields/statuses.
- Local database/table strategy for Tuesday-owned data, especially Freight.
- Permission/safety model for draft vs external action.
- Smoke test path and rollback approach for local UI changes.

## Initial top tabs
- Dashboard
- Leads
- Purchase Orders
- Stocktake
- Freight

## Shared board requirements
- Fast filter/search.
- Status chips.
- Clear source-of-truth labels.
- Open original source link where relevant.
- Mobile-readable key fields.
- Draft-only actions unless explicitly approved.

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Open questions
- Should Tuesday mirror Monday exactly first, or build cleaner opinionated views from Monday data?
- What is the v1 local data store for custom Tuesday-only objects?
- Which tab should be first build priority after capture?
