# Tuesday lane: Stocktake

Created: 2026-05-17

## Purpose
Replicate and improve the Monday stocktake board inside Tuesday so timber/material availability is visible without spreadsheet hunting.

## Primary users
- Guido
- Nick
- Workshop team/future ops helper

## Captured requirements
- Add a top tab for Stocktake.
- It should replicate the Monday.com stocktake board.

## Core jobs-to-be-done
- See available stock by material/species/category.
- Understand what is allocated to jobs vs free.
- Spot low-stock or high-value stock needing attention.
- Support quoting and production planning.

## Likely data needed
- Material/category
- Species
- Dimensions
- Quantity/count
- Location
- Condition
- Allocated job/customer
- Available/reserved status
- Cost/value if tracked
- Last counted date
- Monday item link/id
- Notes/photos if available

## Source of truth
- Monday stocktake board initially.
- Workshop records/photos may be supporting evidence if explicitly added later.

## Actions/buttons to consider
- Open Monday item
- Filter by species/category/location
- Show available only
- Flag count needed
- Draft allocation note

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
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Open questions
- Does stocktake need product-style inventory, slab/timber inventory, hardware, or all of the above?
- Which fields from Monday are essential vs noise?
