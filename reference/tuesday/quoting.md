# Tuesday lane: Quoting / Quote Spine

Created: 2026-05-27
Status: active backlog lane, internal-only
Owner: Tuesday / Hermes, with Guido approval required before build or live writes

## Purpose

Make Innate quoting reliable enough that Hermes drafts from source-backed pricing logic instead of memory. This lane covers the Mission Control Quoting tab, the Supabase quote spine, category pricing policies, quote-draft workflows, supplier price freshness, Xero dry-runs, and owner approval UX.

## Current backlog priority

### Quote Pricing Workbench review to production-ready Quoting page

Guido reviewed the local quote-pricing workbench prototype on 2026-05-27. The direction is right, but the workflow needs to be more useful before it becomes the production Mission Control quoting page.

Local prototype on Guido Mac:

```text
/Users/guidoloeffler/innate-shopify-air/local-previews/innate-quote-pricing-workbench.html
/Users/guidoloeffler/innate-shopify-air/local-previews/innate-quote-pricing-logic-review.html
```

Durable implementation brief:

```text
reference/quoting/quote-pricing-workbench-local-review-2026-05-27.md
```

Related Quote Spine context:

```text
reference/quoting/README.md
reference/quoting/supabase-quote-spine-schema-2026-05-27.sql
app/quoting/page.tsx
lib/quoting/categoryPolicies.ts
lib/quoting/engine.ts
app/api/quote/policies/route.ts
app/api/quote/draft/route.ts
```

## What Guido actually needs from the page

The page is not a marketing UI and not a large hero page. It should be a dense internal approval and workbench surface.

The first screen should answer:

1. What quote categories exist?
2. Which ones are approved, draft, or needing review?
3. Which categories are blocked by stale or missing source prices?
4. What are the current target margin, test sell price, gross profit, and next action?
5. What does Hermes need before it can draft safely?

The workflow should be:

1. Scan all categories in an overview table.
2. Select a category.
3. Review and edit policy and rules.
4. Test a quote scenario with source freshness and margin gates.
5. Approve only when evidence and assumptions are good enough.
6. Let Hermes draft from approved policy only. No sending, publishing, or customer-visible action without Guido approval.

## Current categories

- Steel framed dining tables
- Timber framed dining tables
- Benchtops and timber panels
- Boardroom and meeting tables
- Outdoor tables
- Commercial and hospitality fit-outs
- Custom one-off work

## Guardrails

- Draft-only by default.
- No public website or configurator pricing migration in V1.
- No Xero write unless Guido explicitly approves a dry-run-to-write step.
- Stale supplier prices must block quote-ready status.
- Missing material, machining, finishing, or freight cost must block quote-ready status.
- Customer-facing wording must not expose internal cost or margin logic.
- Build or production changes start only when Guido says BUILD or otherwise explicitly approves implementation.

## Next actions for Tuesday

When Guido asks Tuesday to continue quoting work:

1. Read this file first, then reference/quoting/README.md, then reference/quoting/quote-pricing-workbench-local-review-2026-05-27.md.
2. Inspect the current production Quoting page and compare it with the local workbench brief.
3. Propose a production-ready UX that starts with category overview and owner approval, not a decorative shell.
4. Keep the production-plan work separate. Do not collide with agents working on /production/plan.
5. Before any code change, confirm scope and whether Guido wants local prototype work, production Mission Control work, or Supabase data work.
