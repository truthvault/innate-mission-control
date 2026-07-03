# Relationship Intelligence Spine — First Read-Only Worker Task Plan

Created: 2026-06-29  
Owner: Hermes/default strategy  
Implementation owner later: Tuesday / neutral worker, with Midas and Website input where relevant  
Status: Worker-ready planning draft  
Mode: Read-only inventory and architecture recommendation  
Related working plan: `reference/tuesday/relationship-intelligence-spine-working-plan-2026-06-29.md`

## Approval boundary

This task is strictly read-only.

Allowed:

- Inspect schemas, local reference docs, safe read-only helper output, and existing source-system exports/readbacks.
- Search/read Gmail, Drive, Xero, Monday, Shopify/website, Supabase/Tueaday context using existing read-only routes where available.
- Produce reports, diagrams, schema proposals, candidate mapping tables, and example profiles.
- Identify duplicate contact fields, source-of-truth conflicts, and integration opportunities.

Not allowed without fresh explicit Guido approval:

- Apply Supabase migrations.
- Create/edit/delete Supabase rows.
- Change Tuesday UI or APIs.
- Send emails or customer messages.
- Write to Gmail, Xero, Monday, Drive, Shopify, website, or other external systems.
- Run bulk enrichment jobs that persist data externally.
- Merge/dedupe contacts in any live system.
- Change cron jobs, credentials, providers, gateways, or deployment config.
- Publish/deploy/restart anything.

## Task goal

Produce a read-only **Relationship Intelligence Source Map and Prototype Plan** that shows how Innate can move from fragmented leads/customers/suppliers/orders to a source-backed master relationship spine.

The worker should answer:

1. What relationship/contact/customer/supplier data currently exists across Supabase, Xero, Monday, Gmail, Google Drive, Shopify/website, and local/Tueaday reference docs?
2. Which systems contain duplicate or conflicting contact/customer fields?
3. Which identifiers can safely connect records across systems?
4. What should the canonical relationship schema look like?
5. What should be treated as source of truth for each domain?
6. What would a Ruth Findlay-style enriched profile look like if represented in the proposed graph?
7. What is the safest next implementation step after the read-only report?

## Desired output artifacts

The worker should produce a dated report in `reference/tuesday/`:

`relationship-intelligence-readonly-source-map-YYYY-MM-DD.md`

Optional supporting files, if useful:

- `relationship-intelligence-source-inventory-YYYY-MM-DD.csv`
- `relationship-intelligence-field-map-YYYY-MM-DD.csv`
- `relationship-intelligence-example-profile-ruth-findlay-YYYY-MM-DD.md`
- `relationship-intelligence-schema-draft-YYYY-MM-DD.sql` as **draft only**, not applied
- `relationship-intelligence-open-questions-YYYY-MM-DD.md`

## Success criteria

The task is complete when the report includes:

- A source inventory for each relevant system.
- A current-state schema/field map for known Supabase/Tueaday relationship-adjacent tables.
- A list of duplicate contact/customer/supplier fields across current tables/systems.
- A proposed canonical relationship graph model.
- A source-of-truth hierarchy by data domain.
- A safe entity-resolution approach with confidence levels and human-review rules.
- A Ruth Findlay prototype showing how one real lead/contact would connect across the proposed model.
- A risk/privacy section.
- A phased implementation recommendation.
- A clear list of what remains unknown or inaccessible.
- Proof of read-only checks performed, including commands/tools used and source files inspected.

## Primary sources to inspect

### Local/reference context first

Start with local/reference files before broad web or source-system calls.

Required local files:

- `/Users/mack-mini/.hermes/reference/platform/tool_routing.md`
- `/Users/mack-mini/.hermes/reference/guido/innate-ai-factory-north-star.md`
- `/Users/mack-mini/innate-mission-control/AGENTS.md`
- `/Users/mack-mini/innate-mission-control/reference/tuesday/relationship-intelligence-spine-working-plan-2026-06-29.md`
- `/Users/mack-mini/innate-mission-control/reference/tuesday/leads.md`
- `/Users/mack-mini/innate-mission-control/reference/tuesday/source-of-truth-reconciliation-handover-2026-05-25.md`
- `/Users/mack-mini/innate-mission-control/docs/current/business-operating-context.md`, if present
- `/Users/mack-mini/innate-mission-control/reference/INDEX.md`, if useful

Required schema/reference files, if present:

- `reference/tuesday/supabase-leads-schema-2026-05-17.sql`
- `reference/tuesday/supabase-orders-spine-schema-2026-05-25.sql`
- `reference/tuesday/supabase-order-customer-mirror-schema-2026-06-18.sql`
- `reference/tuesday/supabase-call-intelligence-schema-2026-06-10.sql`
- `reference/tuesday/supabase-relationships-suppliers-schema-draft-2026-05-25.sql`
- `reference/tuesday/supabase-sample-dispatches-schema-2026-06-02.sql`
- any current supplier, costing, stock, payment, freight, or customer-issue schema drafts found under `reference/tuesday/`

### Supabase / Tuesday

Read-only objectives:

- Identify current relationship-adjacent tables and columns.
- Record row counts where safe/read-only routes exist.
- Identify duplicated contact fields across tables.
- Identify existing link/event/document tables.
- Identify current write boundaries and source-of-truth rules.
- Inspect existing lead APIs/UI only as read-only source references.

Likely tables/areas to map:

- `leads`
- `orders`
- `order_items`
- `order_events`
- `order_links`
- `order_customer_mirror`
- `order_documents`
- `source_captures`
- `extracted_nuggets`
- `action_items`
- `organisations`
- `contacts`
- `relationship_records`
- `relationship_links`
- `sample_dispatches` or equivalent sample tables
- supplier/costing/stock/payment tables or drafts

### Gmail

Use the approved read-only route:

`/Users/mack-mini/.local/bin/hermes-gmail-readonly search|get|thread|latest-sent`

Read-only objectives:

- Determine what Gmail can provide for relationship intelligence.
- Sample a tiny number of relevant known threads only if needed, such as Ruth, Gaynor/Earl, or a supplier thread.
- Identify message IDs/thread IDs as possible source evidence keys.
- Note extractable fields: senders, recipients, signatures, subject, dates, bodies, questions, promises, attachments.

Do not send, draft, archive, label, or mutate Gmail.

### Google Drive

Use the approved read-only route:

`/Users/mack-mini/.local/bin/hermes-drive-readonly search|doc|sheet|export`

Read-only objectives:

- Identify how customer/project/spec/supplier documents could be linked as evidence.
- Search for a small number of known example terms only if useful.
- Map available source identifiers: file ID, folder ID, title, URL, mime type, modified date.

Do not create/edit/share/delete Drive files.

### Tuesday Supabase Mirror Google Sheet

Guido supplied the current Tuesday/Supabase mirror workbook after the first worker was launched:

`https://docs.google.com/spreadsheets/d/1SSdDuUlG76o14H-1hoE6CWWJG0EDovME_puGiiLRuqk/edit`

Read-only metadata check confirmed title: `Tuesday Supabase Mirror — Source Truth — 2026-06-29`.

Treat this workbook as an important source to inspect in future read-only iterations because it exposes Supabase data in a human-readable shape and includes review/fix tabs.

Recommended handling:

- Treat RAW/VIEW tabs as mirror/readback evidence, not canonical truth ahead of Supabase.
- Treat FIX tabs as human review/change-request queues.
- Map FIX tabs to the proposed `human_review_queue`, `entity_resolution_candidates`, `commitments_promises`, and `source_evidence` concepts.
- Preserve sheet IDs/tab names as source evidence where sheet rows influence future Supabase updates.
- Do not write to the sheet unless Guido explicitly approves a sheet write task.

Known tabs at time of check include:

- `RAW Leads`, `RAW Orders`, `RAW Order Items`, `RAW Order Events`, `RAW Order Links`, `RAW Financial Documents`, `RAW Payments`, `RAW Intake Reviews`, `RAW Production Tasks`, `RAW Customer Mirror`, `RAW Order Documents`, `RAW Sample Dispatches`
- `VIEW Customers`, `VIEW Orders`, `VIEW Leads`, `VIEW Needs Review`, `VIEW Source Health`
- `FIX Proposed Fixes`, `FIX Proposed Customer Fixes`, `FIX Proposed Order Fixes`, `FIX Status Questions`, `FIX Duplicate Candidates`, `FIX Approved Supabase Updates`
- `AUDIT Sync Log`, `AUDIT Change Log`

### Xero

Use existing read-only Xero helper/MCP routes if available and safe. If not available, inspect local read-only tooling and document the blocker.

Read-only objectives:

- Map Xero contact/quote/invoice/payment fields that matter to relationship intelligence.
- Identify source-of-truth role: financial evidence, quote/invoice/payment truth.
- Identify durable IDs: contact ID, quote ID/number, invoice ID/number, payment IDs if available.
- Document how Xero contacts may duplicate Gmail/Supabase/Monday names.

Do not create/update/delete Xero contacts, quotes, invoices, payments, or tracking records.

### Monday

Use existing known read-only routes/helpers if available. If no safe helper is available, inspect local references and document the blocker rather than improvising mutations.

Read-only objectives:

- Identify boards/columns that contain leads, customers, production status, supplier/stock or customer history.
- Identify durable IDs: board ID, item ID, column IDs, update/comment IDs.
- Document Monday’s current role as legacy/workshop/customer-history evidence during transition.

Do not mutate Monday boards, items, statuses, comments, automations or files.

### Shopify / website / configurator

Read-only objectives:

- Identify what website/Shopify/configurator data can provide relationship or intent signals.
- Treat live website/Shopify as product/customer-facing truth if inspecting website content.
- Map source identifiers: Shopify customer/order/product IDs, page URLs, configurator submission IDs if available.

Do not edit themes, products, pages, customers, orders or publish anything.

### Public web enrichment

Use only for the Ruth prototype or to define enrichment method.

Read-only objectives:

- Show what a lead enrichment packet can contain.
- Keep facts source-backed with URLs and confidence.
- Avoid private/sensitive/unrelated scraped data.

## Work plan

### Step 1: Load operating rules

Read relevant AGENTS/context/reference files and confirm:

- read-only boundary,
- source-of-truth split,
- AI Factory north star,
- tool routing,
- no mutation routes.

### Step 2: Build current Supabase/Tueaday schema map

Create a table of known relationship-adjacent structures:

| Table/file | Purpose | Key identity/contact fields | Link fields | Event/evidence fields | Notes |
|---|---|---|---|---|---|

Flag fields such as:

- customer/contact name
- email
- phone
- organisation/company
- source URL/system
- Xero IDs
- Monday IDs
- Shopify IDs
- Gmail message/thread IDs
- Drive file/folder IDs

### Step 3: Inventory external source capabilities

For Gmail, Drive, Xero, Monday, Shopify/website:

| Source | Available route | Can inspect now? | Key IDs | Valuable fields | Known limitation/blocker |
|---|---|---|---|---|---|

If a source cannot be safely inspected, mark it as blocked or reference-only. Do not use random unverified tools.

### Step 4: Identify duplicate contact/customer structures

Produce a duplication map:

| Field concept | Current locations | Risk | Recommended canonical home |
|---|---|---|---|
| Person name | leads.contact_name, orders.contact_name, Xero contact, Gmail sender, etc | duplicates/drift | parties + contact_methods |
| Phone | leads.phone, orders.phone, Gmail signature, Xero contact | stale copies | contact_methods |
| Customer/org | leads.customer_name, orders.customer_name, Xero contact name, Monday item | ambiguous person/org/project | parties + party_roles + opportunities/orders |

### Step 5: Propose canonical graph schema

Draft schema-level recommendations for:

- `parties`
- `party_roles`
- `party_aliases`
- `contact_methods`
- `party_relationships`
- `opportunities`
- `touchpoints`
- `questions_objections_intent`
- `commitments_promises`
- `source_evidence`
- `fact_claims`
- `research_profiles`
- `entity_resolution_candidates`
- `human_review_queue`

For each table, include:

- purpose,
- key fields,
- links to existing tables,
- uniqueness/de-dupe rules,
- privacy/confidence fields,
- migration/backfill notes.

### Step 6: Define entity-resolution rules

Create a safe matching policy:

| Confidence | Signals | Action |
|---|---|---|
| Exact | Same email or phone, same Xero/Gmail IDs | auto-candidate, maybe auto-link after review rules proven |
| Strong | Same name + company + same project/thread/order | candidate for human review |
| Probable | Similar name + location/context | human review only |
| Weak | Name only | do not merge |
| Conflict | Same details but contradictory identity/context | stop and review |

Include examples of false-positive risks.

### Step 7: Define source-of-truth hierarchy

Produce a domain table:

| Domain | Preferred source | Secondary evidence | Conflict handling |
|---|---|---|---|
| Financial status | Xero | bank/Akahu, Supabase notes | flag mismatch |
| Customer promises | sent Gmail, quote docs, call transcript | Supabase notes | preserve source excerpt |
| Production status | Monday until Tuesday migration complete | Supabase orders/events | flag drift |
| Forward lead/opportunity state | Supabase/Tueaday | Gmail/calls | update only with approval/standing rule |
| Website/product truth | live Shopify/website | local files only if freshly verified | state source checked |
| Public profile | source URL/excerpt | AI summary | confidence timestamp |

### Step 8: Create Ruth Findlay prototype

Using current known Ruth context and, only if safe/read-only, source checks:

Produce an example profile showing how the graph would represent:

- Party: Ruth Findlay
- Roles: spatial designer, specifier, lead contact, potential referral source
- Location: Auckland
- Opportunity: 3-3.5m boardroom table for Ruth’s client
- Product interests: boardroom table, possible double Crossroads, pebble top, colours, power unit, easy Auckland delivery
- Touchpoint: phone call with Guido
- Ballpark: $6k-$8k
- Website pages mentioned: boardroom designs and benchtops/configurator
- Public research profile, if source-backed
- Unknowns: client identity, exact dimensions/spec, power/data requirements, timeline, budget approval
- Next action: wait for client contact or light Ruth follow-up by date

This prototype should be illustrative, not a live data migration.

### Step 9: Risks and privacy review

Include risks:

- over-collection of personal data,
- hallucinated AI facts,
- duplicate/merged wrong contacts,
- stale public profiles,
- source conflicts,
- accidental live writes,
- customer-visible privacy issues,
- sensitive info leaking into UI.

Include recommended controls:

- source evidence for important facts,
- confidence levels,
- human review queue,
- privacy level per fact/evidence/contact method,
- read-only first,
- no auto-send/no auto-merge by default,
- audit trail for every write later.

### Step 10: Recommend next implementation phase

End with a concrete recommendation:

- what to build first,
- what not to build yet,
- what approval would be needed,
- estimated implementation chunks,
- verification/proof gates.

## Stop conditions

The worker should stop and report instead of continuing if:

- a required source route would require mutation/auth change/reconfiguration,
- source credentials or tokens are exposed,
- a tool appears to be write-capable and no read-only mode is available,
- source outputs are too large to inspect safely without narrowing,
- matching logic would require guessing identities,
- conflicts are discovered that could affect live operational claims,
- the task drifts from read-only planning into implementation.

## Reporting format

Final report should use this structure:

1. Executive summary
2. Sources inspected and proof
3. Current-state data/source map
4. Duplicate contact/customer field map
5. Source-of-truth hierarchy
6. Proposed canonical relationship graph
7. Entity-resolution and confidence policy
8. Ruth Findlay prototype profile
9. Privacy/risk controls
10. Recommended next implementation step
11. Open questions / blockers
12. Appendix: commands, files, IDs, sample schemas

## Worker dispatch note

This plan is ready to hand to a read-only worker. Do not launch the worker unless Guido explicitly asks to run it.

Recommended dispatch wording when approved:

> Run the Relationship Intelligence first read-only worker task. Stay strictly read-only. Produce the source map, schema recommendation, duplication map, source-of-truth hierarchy and Ruth prototype. Do not write to Supabase, Gmail, Xero, Monday, Drive, Shopify, Tuesday UI, cron, config or any external system. Stop and report if a needed route is not safely read-only.
