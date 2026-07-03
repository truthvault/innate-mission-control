# Tuesday lane: Freight

Created: 2026-05-17

## Purpose
Create a Tuesday Freight tab for quoting, booking, tracking, and reconciling freight without hunting through emails or recalculating manually.

## Primary users
- Guido
- Nick
- Future admin/ops helper

## Captured requirements
- Add a top tab for Freight.
- This does not currently exist in Monday in the same way.
- It may cover freight, bookings, quote-vs-actual, tracking, and related logistics.
- Keep website freight quote logs as a deliberate Tuesday data source.
- The quote log should record the addresses/details people put into the freight calculator, product/table details, estimate shown, raw carrier result where available, and manual-check prompts.
- `/freight-quotes` is the current seed of the future Freight / Shipping tab.

## Core jobs-to-be-done
- Estimate freight for quotes/orders.
- Choose carrier/service.
- Record booked shipments.
- Track pickup/delivery.
- Compare quoted freight vs actual invoice.
- Flag undercharged/overcharged freight.
- Keep carrier references and links in one place.

## Likely data needed
- Customer/job/order
- Destination suburb/postcode
- Item size/category/dimensions
- Weight/volume if needed
- Carrier
- Service type
- Quoted freight
- Actual freight
- Booking status
- Pickup date/window
- Delivery date/window
- Tracking/reference
- Carrier portal/contact
- Invoice/check status
- Notes

## Source of truth
- Local Tuesday/Supabase table first, with supporting data from Shopify/orders, Monday/jobs, Xero bills, and existing freight estimator work.
- Freight quote calculator events should write to Supabase `freight_quote_events` when `FREIGHT_QUOTE_LOGGING_ENABLED=true` and Supabase service env is configured.
- Public website freight endpoints should be protected before production deploy with `FREIGHT_PUBLIC_ACCESS_TOKEN` in both Vercel and the Shopify/theme caller; without it they only allow trusted Origin/Referer as a backwards-compatible fallback.
- Public freight endpoints include a lightweight per-runtime rate guard; tune with `FREIGHT_PUBLIC_RATE_LIMIT_MAX` or disable only for local debugging with `FREIGHT_PUBLIC_RATE_LIMIT_DISABLED=true`.
- Existing schema: `reference/supabase-freight-schema-2026-05-17.sql`.
- Raw visitor IP should not be stored; only a salted hash may be stored for internal/test filtering.
- Airtable is legacy fallback only, not the preferred long-term store.

## Actions/buttons to consider
- New freight quote
- Recalculate
- Mark booked
- Mark collected
- Mark delivered
- Copy booking email draft
- Open carrier portal
- Attach/check invoice reference
- Flag issue

## Status model draft
- to quote
- quoted
- to book
- booked
- collected
- delivered
- invoice checked
- issue

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Use the current source-of-truth split: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met; Xero remains accounting authority; Shopify remains website/product truth.


## Open questions
- Should Freight include incoming supplier freight as well as outgoing customer freight?
- What retention period should apply to freight quote event addresses and metadata?
- Who besides Guido should be able to see internal/test calculator entries?
- When approved for production, set `FREIGHT_QUOTE_LOGGING_ENABLED=true`, set `FREIGHT_PUBLIC_ACCESS_TOKEN`, update the Shopify/theme caller to send the same public token, and confirm the Supabase schema/env before deploy.
