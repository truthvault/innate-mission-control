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
- Likely local Tuesday table first, with supporting data from Shopify/orders, Monday/jobs, Xero bills, and existing freight estimator work.
- Existing reference: `reference/supabase-freight-schema-2026-05-17.sql` may be relevant before build.

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
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Open questions
- Should Freight be the first custom Tuesday-owned table?
- Which carriers and estimator logic are v1?
- Does this tab include incoming supplier freight as well as outgoing customer freight?
