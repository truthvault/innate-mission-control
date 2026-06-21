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
- Quantities should be updated from receipted goods, materials used by costing sheets/orders, and monthly physical stocktake reconciliation.
- Prices should be kept fresh from Xero bill/item evidence and flagged when stale or conflicting.
- Human effort should be exception handling, not routine stock data entry.

## Core jobs-to-be-done
- See true available stock by material/species/category/location.
- Understand on-hand vs reserved vs consumed vs supplier-held.
- Reserve materials for active jobs from costing sheets/orders.
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
- Condition/confidence
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
- Xero remains accounting/price/bill authority.
- Monday.com is legacy/import evidence only during transition.
- Workshop records/photos and supplier confirmations are supporting evidence.

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
- reserved
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
- Does stocktake need product-style inventory, slab/timber inventory, hardware, or all of the above?
- Which fields from Monday are essential vs noise?
