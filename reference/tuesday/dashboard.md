# Tuesday lane: Dashboard

Created: 2026-05-17

## Purpose
Make Tuesday’s home/dashboard view a warm, useful command centre for Innate instead of a noisy Monday clone.

## Primary users
- Guido
- Nick

## Captured requirements
- Include a top Dashboard/Home tab in the durable Tuesday lane system.

## Core jobs-to-be-done
- Show today’s most important sales/ops/cash signals.
- Surface urgent follow-ups, blockers, overdue payments, production issues, and freight problems.
- Route quickly into Leads, Purchase Orders, Stocktake, Freight, and Foundations-backed views.

## Likely data needed
- Hot leads/follow-ups
- Active jobs/production blockers
- Purchase order blockers
- Stock alerts
- Freight issues
- Xero cash/payment review snippets where relevant
- Last refresh/source health

## Source of truth
- Aggregates from other Tuesday lanes plus approved read-only integrations.

## Actions/buttons to consider
- Open hot lead
- Open overdue blocker
- Jump to lane
- Refresh read-only snapshot
- Draft next action

## Status model draft
Dashboard should not invent its own statuses; it should summarize statuses from the source lanes.

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Open questions
- What are the top 5 widgets Guido wants every morning?
- Should dashboard prioritize cash, jobs, sales, or exceptions by default?
