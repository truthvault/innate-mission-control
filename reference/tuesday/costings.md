# Tuesday Costings

Source-backed supplier/material/product costing data for Tuesday lives in Supabase `costing_*` and `product_costing_*` tables.

## Principles

- Do not invent costs, quantities, margins, freight, or sell prices.
- Unknown values stay null/blank. In the UI, use workshop-friendly operational labels such as `Needs source`, `No approved price`, or `Needs review` instead of repeated raw `Unknown` boxes.
- Costings is an oversight command view, not a field dump: lead with what can be used for quoting, what needs review, what is blocked, and where the proof came from; keep raw source detail secondary in the selected-row detail panel.
- `costing_price_observations` stores observed evidence from Drive, Xero, Gmail, supplier PDFs, calculators, or manual notes.
- `costing_current_prices` is intentionally separate and remains empty until Guido or an approved process selects an observation as the current approved price.
- Inbound freight and customer delivery/quote allowance are separate fields.
- Product costing uses gross margin fields for canonical pricing. Markup is only stored when the source sheet explicitly has a markup-style value.

## Current schema files

- `supabase-costings-schema-2026-06-18.sql` creates the additive schema, summary views, indexes, comments, and RLS enablement.
- `supabase-costings-schema-fix-2026-06-18.sql` aligns applied databases with the source schema by allowing `machining` line types and adding line `raw_payload` evidence.

## Current import

The repeatable import script is:

```bash
/Users/mack-mini/.local/bin/hermes-python scripts/import-costings-drive-sheets.py
```

It reads selected Google Sheets through `/Users/mack-mini/.local/bin/hermes-drive-readonly` and writes only to Tuesday Costings Supabase tables. It does not print secrets and does not promote any values into `costing_current_prices`.

Imported source sheets, re-opened and source-hashed on 2026-06-18:

- Product Costing Sheet - Element 17 - cleaned source-control copy 2026-06-11 2204
- Quintin Te Rūnanga boardroom table - simple costing
- Innate Table Quote Calculator - Quintin v1
- Jo Walsh - Timber Vision 2200 costing - 2026-05-07
- Westimber Price Calculator

## Source verification pass, 2026-06-18

`/Users/mack-mini/.local/bin/hermes-python scripts/apply-costings-source-verification.py --apply` re-opened the five Drive source sheets, stored source hashes on product costing versions/source links, marked exact-matching observations and product lines as `fresh`, and added audit events. Xero read-only evidence also confirmed the Precision Woodworks and Jackson Electrical supplier-bill lines used by the boardroom-table costings.

Current state after the pass:

- `costing_current_prices` remains empty. No observed value has been promoted to approved current price.
- Active material observations: 51 source-reverified observations, all `fresh`; 12 also have Xero line-level confirmation.
- Product costing sheets: 4 active source-verified sheets, all still `needs_review` / `unapproved` for quoting approval.
- Product costing lines: 59 source-reverified lines, all `fresh`; 12 also have Xero line-level confirmation.
- Orders may show source-verified costing context when an order can be matched by strict product code or unique customer/project source label. It must still label unapproved costings as needing approval before quote use.
