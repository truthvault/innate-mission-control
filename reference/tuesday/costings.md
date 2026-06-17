# Tuesday Costings

Source-backed supplier/material/product costing data for Tuesday lives in Supabase `costing_*` and `product_costing_*` tables.

## Principles

- Do not invent costs, quantities, margins, freight, or sell prices.
- Unknown values stay null/blank and should display as `Unknown`.
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

Imported source sheets on 2026-06-18:

- Product Costing Sheet - Element 17 - cleaned source-control copy 2026-06-11 2204
- Quintin Te Rūnanga boardroom table - simple costing
- Innate Table Quote Calculator - Quintin v1
- Jo Walsh - Timber Vision 2200 costing - 2026-05-07
- Westimber Price Calculator

