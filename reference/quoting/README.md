# Innate Quote Spine V1

Created 2026-05-27.

This folder contains the additive Supabase schema for the internal Innate quoting spine. V1 is draft-only by default and does not change public website/configurator pricing.

## Current state

- Deterministic quote engine, Hermes CLI, protected API route, tests, and SQL schema are implemented in Mission Control.
- Live Supabase `quote_*` tables and seed rules were applied on 2026-05-27 through the Node Supabase MCP path.
- REST verification returned the core rules: `standard_gross_margin_50`, `westimber_whole_job_pickup_dropoff`, and `xero_draft_only_until_approved`.
- First reference price snapshots are seeded for Kelven and James/The Shed Shop examples.
- Quote draft persistence remains guarded by `QUOTE_SPINE_WRITES_ENABLED=true`. Keep it off unless Guido explicitly wants draft rows written while testing.


## Owner approval UI

Open the internal Mission Control route:

```text
/quoting
```

This page shows the category pricing logic for steel framed dining tables, timber framed dining tables, benchtops/panels, boardroom tables, outdoor tables, commercial/hospitality fit-outs, and custom one-off work. Guido can mark each category approved or needing review. The approval state is stored in `quote_category_pricing_policies` and exposed to Hermes through `/api/quote/policies`.

## Re-apply or verify later

```bash
cd /Users/mack-mini/innate-mission-control
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin /opt/homebrew/bin/node scripts/apply_supabase_quote_spine_via_mcp.mjs
```

Direct Management API helper, if a valid API path/token is available:

```bash
cd /Users/mack-mini/innate-mission-control
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin python3 scripts/apply_supabase_quote_spine.py
```

The SQL is:

```text
reference/quoting/supabase-quote-spine-schema-2026-05-27.sql
```


## Current Tuesday backlog item

Guido reviewed a local Quote Pricing Workbench prototype on 2026-05-27. The next work is to turn that direction into a genuinely usable Mission Control quoting approval workflow.

Read:

```text
reference/tuesday/quoting.md
reference/quoting/quote-pricing-workbench-local-review-2026-05-27.md
.hermes/plans/2026-05-27_quote-pricing-workbench-review.md
```

Local prototype path on Guido Mac:

```text
/Users/guidoloeffler/innate-shopify-air/local-previews/innate-quote-pricing-workbench.html
```

Do not build or deploy from this backlog item unless Guido explicitly approves. Keep V1 internal and draft-only.
