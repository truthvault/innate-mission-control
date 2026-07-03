# Relationship Intelligence — Open Questions / Blockers

Created: 2026-06-29

## Hard blockers before implementation writes

1. Explicit approval is required before applying any Supabase migration, backfill, internal write, UI/API change, cron, or external-system change.
2. Google Drive helper is currently blocked by `google_scope_missing`; Drive evidence cannot be safely searched/read until scope is fixed through the approved Google token route.
3. Shopify CLI theme list timed out in this worker. Live website pages were inspectable, and docs identify live theme `141308166203`, but Shopify Admin customer/order read-only capability was not proven in this run.
4. Entity resolution must not auto-merge name-only matches. Exact email/phone/external IDs can create candidates, but human review rules are needed before any durable linking.

## Naming / model decisions

1. Should the canonical centre be named `parties`, `relationships`, or `contacts` in Tuesday UI? Recommendation: database table `parties`; user-facing label `Relationships` or `People & Companies`.
2. Should opportunities replace leads immediately or sit alongside `leads` during transition? Recommendation: sit alongside first, with `legacy_lead_id` linkage.
3. Should supplier relationships use the same `parties` model or stay in separate supplier tables? Recommendation: same party spine plus supplier-specific costing/material extensions.
4. Should `source_evidence` be global or per-domain? Recommendation: global, because Gmail/Drive/Xero/Monday evidence crosses leads/orders/suppliers/issues.

## Source/access questions

1. Which Monday boards beyond Orders, Production Plan and Samples stock should be mapped for relationship history: leads, purchase orders, freight booking, customer issues, supplier/stock?
2. Which Shopify Admin objects are safely available read-only: customers, orders, draft orders, contact forms, products, themes, pages, metafields?
3. Should Gmail ingestion eventually include all customer/supplier traffic, or only qualified threads linked to active leads/orders/suppliers?
4. How should public web enrichment be triggered: all leads, hot leads only, designers/specifiers only, or strategic relationships only?
5. What retention/privacy policy should apply to raw email bodies, public enrichment excerpts, phone numbers and customer issue notes?

## Data-quality questions

1. What is the minimum confidence threshold for creating a canonical party automatically? Recommendation: none at first; create review candidates only except exact source IDs already inside one source system.
2. How should conflicting names be presented? Example: Xero contact name differs from Gmail sender and Monday item title.
3. Should phone numbers/emails be visible in Tuesday relationship cards by default, or behind a restricted/privacy toggle?
4. How should the system handle intermediaries (designer/specifier vs end client) when the end client is unknown, as in Ruth Findlay's lead?
5. What is the first live UI surface: `/relationships`, a relationship drawer inside `/leads`, or a hidden admin/review screen?

## Recommended decision sequence

1. Approve a no-migration implementation branch/worktree to turn the draft schema into a reviewed migration + tests + fixtures.
2. Approve a read-only candidate export/backfill for 10 messy examples only: Ruth Findlay, Gaynor Rodgers/Earl, Danny/TubeFab, Paul Quinlan, one repeat customer, one completed order, one customer issue, one Xero-only contact, one Monday legacy customer, one Drive-heavy project.
3. Review the candidate output and false-positive risks.
4. Only then approve migrations/internal writes.
