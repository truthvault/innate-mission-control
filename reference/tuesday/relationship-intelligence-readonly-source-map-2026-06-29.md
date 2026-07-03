# Relationship Intelligence Source Map and Prototype Plan

Created: 2026-06-29  
Worker mode: read-only inventory and architecture recommendation  
Boundary: no Supabase migrations, no Supabase row writes, no Tuesday UI/API changes, no Gmail/Drive/Xero/Monday/Shopify writes, no sends, no deploys/restarts/cron changes.  
Output files written only under `reference/tuesday/` as requested.

## 1. Executive summary

Innate already has the pieces of a relationship intelligence spine, but they are fragmented across flat lead/order/sample rows, relationship/supplier drafts, source-capture tables, Gmail, Xero, Monday, Drive, Shopify/website/configurator, and local reference docs.

The current core gap is still the one identified in the working plan:

> people/organisations/projects are not yet the canonical centre. Leads, orders, samples, supplier records, Xero financial documents and Monday production records still duplicate contact/customer fields.

Read-only checks confirm that Supabase/Tuesday is far enough along to support a master relationship graph:

- Live Supabase has relationship-adjacent tables and data: `leads` 162, `orders` 51, `source_captures` 530, `extracted_nuggets` 625, `action_items` 292, `organisations` 4, `contacts` 6, `relationship_records` 13, `relationship_links` 9, `sample_dispatches` 9, `freight_quote_events` 58.
- Tuesday already has read paths and safety patterns for Supabase leads, Monday orders/production/samples, Xero proof, freight/configurator events and call intelligence.
- Gmail read-only works and exposes message/thread IDs and relationship context; Ruth was not found in Gmail, but supplier and issue examples were found.
- Xero read-only works via current credentials and confirms financial document truth is available.
- Monday read-only works and mutation guard passes; board metadata confirms Orders, Production Plan and Samples stock sources.
- Drive helper is blocked by missing Google scope and must not be worked around through stale tokens.
- Shopify/live website pages are inspectable and should be product/customer-facing truth; Shopify Admin/theme list was not proven because the CLI theme-list command timed out in this run.

Recommendation: build the next phase as a **review-mode relationship prototype**, not as an immediate migration/backfill. Create a no-migration implementation branch that turns this draft into reviewed schema/tests and a read-only candidate export for 10 messy real examples. Only after false positives are reviewed should Guido approve migrations or internal writes.

## 2. Sources inspected and proof

### Planning-grill classification

- Owner: Tuesday / neutral worker, with Hermes/default strategy and Website/Midas input later.
- Mode: inspect + draft.
- Sensitivity: high because this touches customer/contact, financial, email and source-of-truth data.
- Allowed action: read-only inspection plus writing requested artifacts under `reference/tuesday/`.

### Local/reference context inspected

Read/search inspected:

- `AGENTS.md`
- `/Users/mack-mini/.hermes/reference/platform/tool_routing.md`
- `/Users/mack-mini/.hermes/reference/guido/innate-ai-factory-north-star.md`
- `docs/current/business-operating-context.md`
- `reference/INDEX.md`
- `reference/tuesday/README.md`
- `reference/tuesday/leads.md`
- `reference/tuesday/source-of-truth-reconciliation-handover-2026-05-25.md`
- `reference/tuesday/tuesday-readiness-audit-2026-05-24.md`
- `reference/tuesday/tuesday-master-hub-ui-architecture.md`
- source plan and working plan named in the task

Important current rule confirmed:

- Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records.
- Monday remains current workshop/legacy truth for stock, customer history and production tasks until migration gates are met.
- Xero remains accounting authority.
- Shopify/live website remains product/customer-facing truth.
- Read-only/draft is safe; writes/sends/deploys/migrations/source-of-truth changes need explicit approval.

### Supabase schema/reference files inspected

- `supabase-leads-schema-2026-05-17.sql`
- `supabase-orders-spine-schema-2026-05-25.sql`
- `supabase-order-customer-mirror-schema-2026-06-18.sql`
- `supabase-call-intelligence-schema-2026-06-10.sql`
- `supabase-relationships-suppliers-schema-draft-2026-05-25.sql`
- `supabase-sample-dispatches-schema-2026-06-02.sql`
- `supabase-order-intake-schema-2026-05-28.sql`
- `supabase-payment-lifecycle-schema-2026-06-10.sql`
- `supabase-costings-schema-2026-06-18.sql`
- `supabase-stock-ledger-schema-draft-2026-06-18.sql`
- `reference/supabase-freight-schema-2026-05-17.sql`

### Live/read-only source checks performed

- Current time check: `2026-06-29 16:09:49 NZST`.
- Supabase read-only count/select check against host `funixetndgeffnsozhat.supabase.co` at `2026-06-29T04:10:58Z`.
- Exact Ruth lead SELECT readback: lead id `2c2ae544-aee8-4451-9cae-34cdfc7b8b37`.
- Gmail helper help/search checks:
  - Ruth searches returned 0 messages.
  - `pdq@pqla.co.nz has:attachment` returned 3 message metadata rows.
  - `Gaynor Earl` returned 3 message metadata rows.
- Drive helper search checks returned `google_scope_missing` for Ruth queries.
- Xero read-only OAuth/API check succeeded for tenant/organisation `Innate Furniture`; recent invoice sample returned 3 invoice summaries.
- Monday read-only GraphQL board metadata succeeded for:
  - Orders board `18404972673`, 41 items.
  - Production Plan board `7301377614`, 122 items.
  - Samples stock board `18412532131`, 9 items.
- `npm run check:mutations` passed: `OK: no Monday mutation operations found in app/ or lib/.`
- Live website extracts:
  - `https://innatefurniture.co.nz/pages/boardroom-tables`
  - `https://innatefurniture.co.nz/pages/timber-panels`
  - `https://innatefurniture.co.nz/pages/commercial-1`
- Public web for Ruth:
  - LinkedIn profile extract.
  - Autex Te Huruhi School project extract.
  - Abodo Te Huruhi School project extract.

## 3. Current-state data/source map

### Supabase / Tuesday live counts

| Table / object | Count | Relationship relevance |
|---|---:|---|
| `leads` | 162 | Forward lead/enquiry records, but still flat customer/contact/opportunity fields. |
| `orders` | 51 | Approved order spine; duplicates customer/contact fields and Xero/Monday IDs. |
| `order_items` | 58 | Product/spec line detail. |
| `order_events` | 311 | Status/touchpoint/audit events. |
| `order_links` | 123 | External ID bridge: Xero, Monday, Shopify, Gmail/other. |
| `order_financial_documents` | 32 | Xero quote/invoice truth cache. |
| `order_payments` | 28 | Payment signals/evidence. |
| `order_intake_reviews` | 24 | Accepted-job intake/review state. |
| `production_order_tasks` | 204 | Supabase-side production task/intake layer. |
| `order_customer_mirror` | 1 | Source-backed customer-known promises/spec summaries. |
| `order_documents` | 4 | Private order docs with Gmail/source attachment refs. |
| `source_captures` | 530 | Raw call/email/document/internal note capture headers. |
| `extracted_nuggets` | 625 | Extracted contact/action/research/opportunity/waiting facts. |
| `action_items` | 292 | Action queue generated from captures. |
| `organisations` | 4 | Existing supplier/relationship draft already live. |
| `contacts` | 6 | Existing contacts draft already live. |
| `relationship_records` | 13 | Relationship memory records. |
| `relationship_links` | 9 | Links to Gmail/Drive/content/order/lead/Xero/Monday. |
| `sample_dispatches` | 9 | Sample/customer touchpoints; duplicates contact fields. |
| `sample_dispatch_events` | 9 | Sample events. |
| `sample_dispatch_links` | 1 | Sample external links. |
| `costing_suppliers` | 16 | Supplier/vendor list for costing. |
| `costing_materials` | 78 | Supplier/material identity and source mapping. |
| `costing_source_links` | 32 | Costing evidence links. |
| `costing_price_observations` | 78 | Supplier/Xero/Drive/PDF/Gmail price observations. |
| `product_costing_sheets` | 4 | Product costing docs/sheets. |
| `product_costing_versions` | 4 | Versioned costing evidence. |
| `product_costing_lines` | 59 | Line-level cost evidence. |
| `stock_*` draft tables | 0 each | Stock model exists but not populated. |
| `freight_quote_events` | 58 | Website/configurator/freight intent events. |

### External/current source roles

| Source | Current role | Source-backed IDs to preserve |
|---|---|---|
| Supabase/Tuesday | Forward structured spine for approved internal records. | UUIDs for leads/orders/events/links/captures/nuggets/samples/costings. |
| Gmail | Communication evidence and touchpoint truth. | `message.id`, `threadId`, sender/recipient, date, subject, attachment refs. |
| Drive | Document/spec/photo/drawing/sheet evidence once scope is fixed. | file ID, folder ID, title, URL, mime type, modified time. |
| Xero | Financial/accounting truth. | ContactID, InvoiceID, InvoiceNumber, QuoteID, payment IDs if available. |
| Monday | Current workshop/legacy truth for stock, customer history and production until gates met. | board ID, item ID, column ID, update ID/comment IDs. |
| Shopify/live website | Customer-facing product/page truth and intent capture. | Shopify customer/order/product/variant IDs, page URLs, product handles, theme ID, configurator/freight event IDs. |
| Public web | Business/professional enrichment evidence only. | URL, title, excerpt, captured timestamp, confidence. |

## 4. Duplicate contact/customer field map

The detailed CSV is in `relationship-intelligence-field-map-2026-06-29.csv`.

Highest-risk duplications:

| Field concept | Current locations | Risk | Canonical home |
|---|---|---|---|
| Person name | `leads.contact_name`, `orders.contact_name`, `sample_dispatches.contact_name`, `contacts.full_name`, Xero/Gmail/Monday names | Name-only false matches; person vs org ambiguity. | `parties` + `party_aliases` |
| Organisation/customer | `leads.customer_name`, `orders.customer_name`, `sample_dispatches.customer_name`, `organisations.name`, Xero contact, Monday item | One field mixes person/org/project/intermediary. | `parties` with `party_type` + relationships |
| Email | leads/orders/samples/contacts/Xero/Gmail/Shopify | Stale copied fields; multiple addresses; privacy. | `contact_methods` |
| Phone | leads/orders/samples/contacts/orgs/forms | Shared/stale/sensitive. | `contact_methods` with privacy level |
| Lead/opportunity | `leads` combines identity, opportunity, notes and next action | Flat row cannot represent designer + unknown client + future referral. | `opportunities` linked to parties |
| Financial contact | Xero + `order_financial_documents.contact_*` + orders invoice fields | Xero contact is not full relationship truth. | `source_evidence` + `external_identities`/links |
| Source evidence | source URLs/IDs scattered through metadata and link tables | Hard to prove facts later. | global `source_evidence` |
| Notes/summaries | `leads.notes`, `orders.notes`, `relationship_records.summary`, `source_captures.summary`, `extracted_nuggets.detail` | Mixed claims, AI/manual summaries, sensitive data. | `fact_claims`, `touchpoints`, `commitments_promises` |

## 5. Source-of-truth hierarchy

| Domain | Preferred source | Secondary evidence | Conflict handling |
|---|---|---|---|
| Lead/opportunity state | Supabase/Tuesday `leads`, then future `opportunities` | Gmail/calls/Shopify forms | Flag source mismatch; no auto-overwrite without approved workflow. |
| Person/org canonical identity | Future `parties` after review | Exact email/phone/external IDs; Xero/Monday/Gmail/Drive | Name-only creates weak candidate only. |
| Contact methods | Evidence-backed `contact_methods` | Gmail headers/signatures, Supabase lead fields, Xero contacts, Shopify forms | Keep multiple methods; last verified timestamp and source. |
| Financial status | Xero | Akahu/bank, Supabase payment caches | Xero/bank mismatch goes to review. |
| Official invoices/quotes | Xero | Gmail sent proof, Supabase financial document cache | Invoice exists ≠ invoice sent unless Xero/Gmail proves sent. |
| Production/stock/customer history | Monday until migration gates met | Supabase orders/tasks/events | Treat drift as transition issue; do not assume Monday retired. |
| Approved Tuesday-owned records | Supabase/Tuesday | Monday/Xero/Gmail evidence | Supabase is forward truth only for approved workflows/tables. |
| Customer promises | Sent Gmail, quote docs, call/source capture | Supabase notes/order_customer_mirror | Preserve source excerpt and confidence. |
| Website/product truth | Live Shopify/live website | Local files only if freshly compared | State source checked; no local stale assumptions. |
| Website/configurator intent | Supabase `freight_quote_events`, Shopify forms/orders if read | Page URL/product handle/variant IDs | Anonymous events stay aggregate until contact signal exists. |
| Supplier prices/material evidence | Xero bills/products + latest supplier invoices; costings source links | Gmail/Drive supplier PDFs | Price freshness and source required before quoting. |
| Public professional profile | Public URL/excerpt with timestamp | AI summary | Store only business-relevant source-backed claims; re-check if stale. |

## 6. Proposed canonical relationship graph

The canonical centre should be a graph, not a flat CRM table.

Recommended core tables:

1. `parties` — any person, organisation, project, household, supplier, customer, designer, architect, contractor, internal/team entity.
2. `party_roles` — a party can be lead, customer, designer, specifier, supplier, contractor, referral source, freight partner, etc.
3. `party_aliases` — source-specific names and display variants.
4. `contact_methods` — email/phone/website/social/address with source, confidence and privacy.
5. `party_relationships` — person-to-organisation, designer-to-client, supplier-to-material, customer-to-project.
6. `opportunities` — commercial lead/enquiry separate from the person.
7. `touchpoints` — phone calls, emails, meetings, website events, quotes sent, invoice paid, samples sent, supplier advice, customer issue raised.
8. `source_evidence` — global evidence table for Gmail, Xero, Monday, Drive, Shopify, public web, calls, screenshots, docs.
9. `fact_claims` — atomic source-backed facts and inferences.
10. `questions_objections_intent` — structured sales/product/website intelligence from recurring questions and objections.
11. `commitments_promises` — what Innate promised, what customers/suppliers promised, status/due/source.
12. `research_profiles` — public/business enrichment for strategically useful parties.
13. `entity_resolution_candidates` — possible matches, with signals and human review status.
14. `human_review_queue` — safe queue for duplicates/conflicts/uncertain claims.

Draft SQL is in `relationship-intelligence-schema-draft-2026-06-29.sql` and was **not applied**.

### Migration/backfill stance

Do not delete or replace existing lead/order fields initially. Add canonical links in review-mode first, because existing operational surfaces still depend on current tables.

Safe sequence:

1. Draft schema and tests.
2. Read-only candidate export for a small messy set.
3. Human review of false positives and privacy display.
4. Approved migrations.
5. Exact/low-risk links only.
6. UI after data model proves useful.

## 7. Entity-resolution and confidence policy

| Confidence | Signals | Allowed action in first phase |
|---|---|---|
| Exact | Same normalized email/phone; same Xero/Gmail/Monday/Shopify/Drive external ID; existing explicit Supabase foreign key | Create candidate; auto-link only after review rules are proven and approved. |
| Strong | Same name + same organisation/company + same project/thread/order or same invoice/order context | Human review candidate. |
| Probable | Similar name + location/context/product/project timing | Human review only; no merge. |
| Weak | Name only, generic company name only, or same city only | Do not merge; maybe record as search result. |
| Conflict | Same details but contradictory identity/context, or shared accounts/admin email/phone | Stop and review; preserve both records. |

False-positive examples to guard against:

- Designer/intermediary and end client sharing the same project but not the same identity.
- Xero contact name being a billing entity rather than the actual decision-maker.
- Monday item name being a project/customer label rather than a person.
- Gmail CC list including suppliers/consultants not central to the relationship.
- Shared office phone or accounts email causing unrelated people to match.
- Name-only matches such as common first/last names.

Every link or claim should carry:

- source evidence ID or source ref,
- confidence,
- captured/verified timestamp,
- privacy level,
- whether it is fact vs inference vs AI summary.

## 8. Ruth Findlay prototype profile

Full profile file: `relationship-intelligence-example-profile-ruth-findlay-2026-06-29.md`.

### Current Supabase source row

Read-only SELECT found lead `2c2ae544-aee8-4451-9cae-34cdfc7b8b37`:

- Customer name: `Ruth Findlay / Auckland boardroom table client`
- Contact: Ruth Findlay
- Source: Phone call / `manual_phone_call`
- Product category: Boardroom table
- Estimated value: 7000
- Status: qualifying
- Priority: hot
- Next follow-up: 2026-07-02
- Summary: Auckland spatial/interior designer/specifier; boardroom table enquiry for client; $6k-$8k ballpark discussed.
- Notes mention: 3–3.5m boardroom table, possible double Crossroads base, pebble-shaped top, colours/shapes/styles flexibility, possible power unit, easy Auckland delivery, boardroom designs and benchtops/configurator page.

### Public enrichment

Source-backed facts:

- LinkedIn extract presents Ruth Findlay as Auckland-based Spatial Designer + Interiors / consultant.
- Autex and Abodo project pages credit Ruth Findlay and Kirsten Newton / SPACEINBTWN on Te Huruhi School/Waiheke work.
- The public project evidence is relevant because it shows spatial, material, cultural/acoustic and supplier-coordination experience.

Privacy stance:

- Store public professional facts as normal privacy.
- Store direct phone/contact method as restricted.
- Keep “potential referral source” as an inference with medium confidence, not a fact.

### How the graph should represent Ruth

```text
Party: Ruth Findlay (person)
  roles: lead contact, spatial designer, specifier, potential referral source
  contact_methods: phone (restricted, Supabase lead source)
  opportunity: Auckland boardroom table for unknown client
    product_intent: 3-3.5m, boardroom table, possible double Crossroads, pebble top, colours, power/data, Auckland delivery
    source: 2026-06-29 phone call / Supabase lead
  public_profile: LinkedIn, Autex, Abodo evidence
  unknowns: client identity, exact dimensions/spec, power/data requirements, timeline, budget approval
```

## 9. Privacy/risk controls

Key risks:

- Over-collection of personal data.
- AI hallucinated facts in lead notes/research summaries.
- Wrongly merged contacts/customers/suppliers.
- Stale public profiles.
- Source conflicts between Supabase, Monday, Xero, Gmail and Shopify.
- Accidental live writes or customer-visible messages.
- Sensitive details leaking into Tuesday UI.
- Drive/Gmail raw bodies/attachments over-indexed without retention rules.

Controls:

- Evidence-first model: important facts require `source_evidence` or explicit source ref.
- Confidence levels on parties, contact methods, facts, roles and entity-resolution candidates.
- Human review queue for probable/weak/conflict matches.
- Privacy levels on evidence, contact methods, fact claims and research profiles.
- No auto-send, no auto-merge, no external writes by default.
- Audit event for every later write.
- Keep direct contact details and raw email/document excerpts restricted by default.
- Separate fact, inference and AI summary in data model.
- Public web enrichment limited to business-relevant public facts with URLs and timestamps.

## 10. Recommended next implementation step

Recommended next step: **No-migration prototype implementation branch.**

Goal:

- Convert the draft schema into reviewed migrations/tests/fixtures, but do not apply them.
- Build a read-only candidate export for 10 real examples:
  - Ruth Findlay.
  - Gaynor Rodgers / Earl issue.
  - Danny / TubeFab.
  - Paul Quinlan.
  - one repeat customer.
  - one completed order.
  - one customer issue.
  - one Xero-only contact.
  - one Monday legacy customer.
  - one Drive-heavy project after Drive scope is fixed.

Verification/proof gates:

- Static schema review passes.
- No live migrations run.
- Candidate export written to `reference/tuesday/` or `reference/evidence/` only after approved scope.
- False-positive examples are visible.
- Privacy labels are present.
- No customer/team-visible changes.
- No Gmail/Xero/Monday/Drive/Shopify writes.

Approval needed:

- Guido approval to start implementation branch/worktree and draft migrations/tests.
- Separate approval later to apply Supabase migrations or backfill any relationship records.

## 11. Open questions / blockers

Full file: `relationship-intelligence-open-questions-2026-06-29.md`.

Blockers found:

1. Drive helper lacks required Google scope (`google_scope_missing`).
2. Shopify CLI theme list timed out; live website pages were checked, but Shopify Admin object read-only was not proven in this run.
3. Exact entity-resolution thresholds and UI privacy display need decision before implementation.
4. No approval exists yet for migrations/backfill/UI/API changes.
5. Ruth has no Gmail match in tiny searches; current Ruth evidence is Supabase phone-call row + public web.

Highest-leverage open decisions:

- Database table name `parties` vs UI label `Relationships`/`People & Companies`.
- Whether public enrichment is hot/strategic-only or broad.
- Whether first UI is `/relationships` or a relationship drawer inside `/leads`.
- What auto-linking threshold, if any, is allowed after review.

## 12. Appendix: commands, files, IDs, sample schemas

### Commands/checks run

```bash
date '+%Y-%m-%d %H:%M:%S %Z'
/Users/mack-mini/.local/bin/hermes-gmail-readonly --help
/Users/mack-mini/.local/bin/hermes-drive-readonly --help
/Users/mack-mini/.local/bin/hermes-gmail-readonly search --max 5 '"Ruth Findlay" OR ruth.findlay OR (Ruth Findlay)'
/Users/mack-mini/.local/bin/hermes-gmail-readonly search --max 5 'Ruth boardroom table'
/Users/mack-mini/.local/bin/hermes-gmail-readonly search --max 3 'pdq@pqla.co.nz has:attachment'
/Users/mack-mini/.local/bin/hermes-gmail-readonly search --max 3 'Gaynor Earl'
/Users/mack-mini/.local/bin/hermes-drive-readonly search --max 5 'Ruth Findlay'
/Users/mack-mini/.local/bin/hermes-drive-readonly search --max 5 'boardroom table Ruth'
npm run check:mutations
node Supabase count/select scripts (read-only SELECT/count only)
node Monday board metadata query (read-only GraphQL query only)
node Xero organisation/recent invoice summary query (read-only API only)
shopify version
shopify theme list --store innate-furniture.myshopify.com --json  # timed out
```

### Important IDs checked

- Supabase host: `funixetndgeffnsozhat.supabase.co`
- Ruth lead: `2c2ae544-aee8-4451-9cae-34cdfc7b8b37`
- Monday Orders board: `18404972673`
- Monday Production Plan board: `7301377614`
- Monday Samples stock board: `18412532131`
- Live Shopify theme from current docs/AGENTS: `141308166203`
- Live pages checked:
  - `/pages/boardroom-tables`
  - `/pages/timber-panels`
  - `/pages/commercial-1`

### Supporting artifacts created

- `relationship-intelligence-source-inventory-2026-06-29.csv`
- `relationship-intelligence-field-map-2026-06-29.csv`
- `relationship-intelligence-example-profile-ruth-findlay-2026-06-29.md`
- `relationship-intelligence-schema-draft-2026-06-29.sql` — draft only, not applied.
- `relationship-intelligence-open-questions-2026-06-29.md`

### Schema draft summary

The draft schema includes:

- `parties`
- `party_roles`
- `party_aliases`
- `contact_methods`
- `party_relationships`
- `opportunities`
- `source_evidence`
- `touchpoints`
- `fact_claims`
- `questions_objections_intent`
- `commitments_promises`
- `research_profiles`
- `entity_resolution_candidates`
- `human_review_queue`

It intentionally omits RLS/grants pending security review.
