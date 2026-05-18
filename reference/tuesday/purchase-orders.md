# Tuesday lane: Purchase Orders

Created: 2026-05-17

## Purpose
Replicate the useful parts of the Monday purchase orders board inside Tuesday so buying, supplier follow-up, and job-linked purchasing are easier to see.

## Primary users
- Guido
- Nick
- Future admin/ops helper

## Captured requirements
- Add a top tab for Purchase Orders.
- It should replicate the Monday.com purchase orders board.

## Core jobs-to-be-done
- See outstanding purchase orders.
- Track supplier, order status, expected arrival, and linked job/customer.
- Spot blockers for production.
- Draft supplier follow-up emails without sending automatically.

## Likely data needed
- PO number/id
- Supplier
- Linked job/customer
- Items/materials
- Quantity
- Order date
- Expected arrival
- Actual arrival
- Status
- Cost/estimate
- Invoice/payment link if relevant
- Monday item link/id
- Notes

## Source of truth
- Monday purchase orders board initially.
- Xero may be supporting read-only context for invoices/bills, not an automatic write target.

## Actions/buttons to consider
- Open Monday item
- Draft supplier follow-up
- Mark arrival/check-in draft
- Filter overdue arrivals
- Filter by supplier/job/status

## Status model draft
- to order
- ordered
- awaiting confirmation
- in transit
- arrived
- issue
- closed

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Open questions
- Which Monday PO board/columns are canonical?
- Is there an existing PO numbering convention Tuesday must preserve?
