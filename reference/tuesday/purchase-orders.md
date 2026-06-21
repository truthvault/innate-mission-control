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
- It should replicate the useful workshop shape of the Monday.com purchase orders board, not reinterpret it as customer orders.
- The first/name column is the **materials/items ordered**.
- Dedicated columns must carry:
  - supplier,
  - date ordered,
  - notes = either `stock` or the customer/order it is for,
  - clickable Xero invoice/bill link so workshop can check exact supplier details while receipting goods.
- For PO rows with attached Xero-generated PO PDFs/updates, read the PDF/reference before classifying the row; legacy Monday notes may only contain rough material shorthand.

## Core jobs-to-be-done
- See outstanding purchase orders.
- Track materials/items ordered, supplier, ordered date, order status, received date, invoice/admin approval, and stock/customer allocation.
- Give Nick/workshop a clickable Xero invoice/bill link for exact receipting detail.
- Spot blockers for production.
- Draft supplier follow-up emails without sending automatically.

## Likely data needed
- Materials/items ordered (Monday first/name column)
- Supplier
- Date ordered
- Notes: `stock` or customer/order name
- Xero invoice/bill URL
- PO number/id where available
- Quantity
- Expected arrival
- Actual arrival / Date Received
- Invoice approved / Date Approved
- Status/group
- Cost/estimate
- Monday item link/id

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
- Use the current source-of-truth split: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met; Xero remains accounting authority; Shopify remains website/product truth.


## Open questions
- Which Monday PO board/columns are canonical?
- Is there an existing PO numbering convention Tuesday must preserve?
