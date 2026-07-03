# Tuesday lane: Leads

Created: 2026-05-17

## Purpose
Replicate the useful parts of the Monday leads board inside Tuesday, but make it faster and clearer for day-to-day Innate sales follow-up.

## Primary users
- Guido
- Future admin/sales helper

## Captured requirements
- Add a top tab for Leads.
- Make the Monday.com leads board obsolete for Guido’s day-to-day work.
- Use Supabase as the database/source of truth going forward.
- Build the board to be highly functional for managing leads this coming week.
- Keep Monday as legacy/reference/migration source only where needed.

## Core jobs-to-be-done
- See all active leads without opening Monday.
- Prioritise hot/cash-relevant leads.
- See next follow-up date/status at a glance.
- Open the source record/context quickly.
- Draft next action without accidentally sending anything.

## Likely data needed
- Lead/customer name
- Email/phone
- Source
- Product/category
- Estimated value
- Status
- Owner
- Next follow-up date
- Last interaction
- Monday item link/id
- Notes

## Source of truth
- Supabase `public.leads` going forward.
- Draft schema: `reference/tuesday/supabase-leads-schema-2026-05-17.sql`.
- Monday leads board is legacy/reference/migration source only.
- Gmail/context read-only as supporting evidence if approved for the task.

## Actions/buttons to consider
- Create new Supabase lead.
- Update Supabase-only status, priority, next follow-up date, estimated value, next action, last-touch summary, and notes.
- Open legacy/source link if present.
- Filter hot leads.
- Filter stale/no next action.

## Status model draft
- new
- qualifying
- quoted
- follow-up due
- waiting on customer
- won
- lost/parked

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Use the current source-of-truth split: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met; Xero remains accounting authority; Shopify remains website/product truth.


## Open questions
- Which exact Monday board id/columns are canonical?
- Should Tuesday be read-only mirror first, or have approved write-back later?
