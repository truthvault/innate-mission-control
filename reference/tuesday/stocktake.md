# Tuesday lane: Stocktake

Created: 2026-05-17

## Purpose
Build the ultimate Tuesday-owned stock system so timber/material availability, reservations, usage, pricing, stocktake reconciliation, and Xero evidence are visible without spreadsheet hunting.

Correction 2026-06-18: Stock/WIP should be done in Tuesday, not Monday.com. Monday may be legacy/import evidence during transition only. Target architecture is captured in `ultimate-stock-tab-architecture-2026-06-18.md`.

## Primary users
- Guido
- Nick
- Workshop team/future ops helper

## Captured requirements
- Add a top tab for Stocktake.
- Tuesday should become the operational source of truth for stock, not Monday.com.
- June 1 Monday board stock count is the opening/baseline stock count for Tuesday stock.
- July 1 and future monthly stocktakes should reconcile against the Tuesday ledger baseline/movements.
- Tuesday stock should include everything: timber, slabs/panels, hardware, components, steel, supplier-held material, and any other stock-relevant items.
- Job-specific items should be treated as work in progress (WIP), not general available stock.
- Any stock change/movement should be captured.
- Quantities should be updated from receipted goods, materials used by costing sheets/orders, and monthly physical stocktake reconciliation.
- Prices should be kept fresh from Xero bill/item evidence and flagged when stale or conflicting.
- Tuesday should propose new min/maxes where appropriate based on usage/reorder evidence.
- Human effort should be exception handling, not routine stock data entry.

## Core jobs-to-be-done
- See true available stock by material/species/category/location.
- Understand on-hand vs reserved vs consumed vs supplier-held.
- Reserve materials for active jobs from costing sheets/orders.
- Keep job-specific material visible as WIP.
- Spot shortages before production starts.
- Spot low-stock, stale-price, stale-count, variance, and unmapped-bill issues.
- Support quoting, purchasing, production planning, month-end stock/WIP journals, and gross-margin reporting.

## Likely data needed
- Canonical stock item/material/component
- Category
- Species/material
- Dimensions/spec
- Unit
- Quantity on hand
- Quantity reserved
- Quantity available
- Quantity consumed this month
- Location
- Supplier-held yes/no
- Supplier-held location/supplier name
- Condition/confidence
- Allocation type: general stock vs WIP/job-specific
- Allocated job/customer/order
- Current unit cost ex GST
- Latest Xero price source
- Stock value ex GST
- Last movement date
- Last counted date
- Source evidence links: Xero bill, costing sheet, stocktake session, supplier confirmation
- Notes/photos if available

## Source of truth
- Tuesday stock ledger is the target operational source of truth.
- June 1 Monday board stock count is the accepted opening/baseline count for Tuesday stock.
- Xero remains accounting/price/bill authority.
- Monday.com is legacy/import evidence only during transition.
- Workshop records/photos and supplier confirmations are supporting evidence.
- Supplier-held stock counts as on hand but must be marked at the supplier. Current supplier-held categories known from Guido: Silver Beach at Westimber; steel at Tube Fab that was purchased from Vulcan.
- Future direction: stock item supplier details, descriptions, product codes, and prices should sync between Tuesday and Xero, but Xero tidy/sync work is explicitly later and not part of the first stocktake build.

## Actions/buttons to consider
- Open source evidence: Xero bill, costing sheet, stocktake session, supplier confirmation, legacy Monday item if imported
- Filter by species/category/location/status
- Show available only
- Show reserved/shortage only
- Show supplier-held only
- Flag count needed
- Create proposed reservation from costing sheet
- Create proposed stocktake variance note
- Draft purchase/reorder list

## Status model draft
- available
- supplier-held
- reserved
- WIP / job-specific
- allocated
- used
- needs count
- damaged/issue

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Use the current source-of-truth split: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met; Xero remains accounting authority; Shopify remains website/product truth.


## Open questions
- Which fields from Monday are essential vs noise?
- What exact format should the July 1 monthly physical stocktake use for count capture and variance approval?
