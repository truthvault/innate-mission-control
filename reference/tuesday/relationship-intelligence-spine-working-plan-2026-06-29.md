# Innate Relationship Intelligence Spine — Working Plan

Created: 2026-06-29  
Owner: Hermes/default strategy, with Tuesday / Midas / Website implementation later  
Status: Working document, not locked in stone  
Approval boundary: Planning/reference only. Do not treat this as approval to migrate schemas, backfill data, alter Tuesday UI, change Xero/Monday/Gmail/Drive/Shopify, or run bulk enrichment jobs.

## Purpose

Build Innate toward an AI-native relationship intelligence system where every person, organisation, enquiry, quote, invoice, order, email, call, website action, sample, supplier touchpoint, issue, delivery, payment and outcome can become connected, source-backed business knowledge.

The goal is not simply to improve the current leads table. The goal is to create a master relationship spine that helps Innate answer:

- Who is this person or organisation?
- What roles do they play for Innate?
- What have they asked, bought, supplied, influenced, complained about, or helped with?
- What have we promised them?
- What evidence proves the current understanding?
- What should Innate do next?
- What can this teach sales, quoting, production, finance, website, suppliers, customer experience, and growth?

Plain-English target:

> A business brain that never loses relationship context and turns every interaction into better future decisions.

## Current planning stance

This is a living working document. It should be refined through real examples and source checks before implementation.

Current recommended path:

1. Read-only source inventory.
2. Canonical schema draft.
3. Ruth-style prototype using a small number of real examples.
4. Bulk extraction/backfill only in review mode first.
5. Approved migrations/writes only after the model has been proven.

## Current source systems and their roles

| System | Proposed role |
|---|---|
| Supabase / Tuesday | Canonical operating spine and relationship graph |
| Gmail | Communication evidence: messages, promises, questions, threads, attachments |
| Xero | Financial truth: contacts, quotes, invoices, payments, line items |
| Monday | Legacy/workshop/customer-history evidence during transition |
| Google Drive | Document, spec, drawing, photo, PDF and sheet evidence |
| Shopify / website / configurator | Customer-facing product truth and customer intent capture |
| Hermes / Telegram / calls | Human-reported context, call summaries, decisions, corrections, orchestration |
| Public web | Professional/business enrichment evidence |

### 2026-06-29 refinement: Tuesday Supabase Mirror Google Sheet

Guido supplied the Google Sheet `Tuesday Supabase Mirror — Source Truth — 2026-06-29`:

`https://docs.google.com/spreadsheets/d/1SSdDuUlG76o14H-1hoE6CWWJG0EDovME_puGiiLRuqk/edit`

Read-only metadata check confirmed the workbook contains RAW mirror tabs, VIEW tabs, FIX/request tabs, and AUDIT tabs, including:

- `RAW Leads`, `RAW Orders`, `RAW Order Events`, `RAW Order Links`, `RAW Financial Documents`, `RAW Payments`, `RAW Production Tasks`, `RAW Customer Mirror`, `RAW Sample Dispatches`
- `VIEW Customers`, `VIEW Orders`, `VIEW Leads`, `VIEW Needs Review`, `VIEW Source Health`
- `FIX Proposed Fixes`, `FIX Proposed Customer Fixes`, `FIX Proposed Order Fixes`, `FIX Status Questions`, `FIX Duplicate Candidates`, `FIX Approved Supabase Updates`
- `AUDIT Sync Log`, `AUDIT Change Log`

Impact on the relationship-intelligence approach:

- Treat the sheet as an **interim operator console / mirror / review queue**, not a new canonical source of truth.
- Supabase remains the canonical structured database; the sheet makes Supabase-visible data easier for Guido to inspect and mark for correction.
- The FIX tabs are especially relevant to the future `human_review_queue`, `entity_resolution_candidates`, and `source_evidence` model.
- The sheet can accelerate the first prototype because it exposes leads, orders, payments, tasks, samples, customer views, duplicate candidates, and proposed fixes in a human-readable way.
- Do not let the sheet become an unstructured second CRM. RAW/VIEW tabs should mirror; FIX/REQUEST tabs should queue reviewed changes; approved writes must still read back from Supabase.

## Observed current Supabase/Tueaday structures

Current reference docs indicate useful pieces already exist or have been drafted, but they are fragmented.

| Area | Current / drafted structures |
|---|---|
| Leads | `leads`: flat lead rows with customer/contact, source, category, status, priority, value, notes |
| Orders | `orders`, `order_items`, `order_events`, `order_links` |
| Customer mirror | `order_customer_mirror`, `order_documents` |
| Call intelligence | `source_captures`, `extracted_nuggets`, `action_items` |
| Relationships draft | `organisations`, `contacts`, `relationship_records`, `relationship_links` |
| Samples / dispatches | Sample follow-up structures exist in Tuesday references |
| Costings / suppliers / stock | Various Supabase/Tues reference schemas exist |

Current core gap:

> Contacts/people/organisations are not yet the canonical centre. Leads, orders, suppliers and customer issues still duplicate contact fields instead of linking to one master party.

## North-star architecture

The master list should be a human-friendly view over a relationship graph, not a single flat spreadsheet.

### 1. `parties`

Canonical record for any real-world person, organisation, household, project, supplier, customer, designer, architect, freight partner or other entity.

Suggested fields:

| Field | Meaning |
|---|---|
| `id` | Canonical party ID |
| `party_type` | person, organisation, household, project, unknown |
| `display_name` | Human-readable name |
| `canonical_name` | Normalised matching name |
| `primary_location` | Auckland, Christchurch, Northland, etc |
| `primary_role_summary` | Short summary, e.g. Auckland spatial designer/specifier |
| `business_relevance_summary` | Why this party matters to Innate |
| `relationship_status` | new, active, dormant, strategic, watch, archived |
| `relationship_value` | unknown, low, normal, high, strategic |
| `confidence` | low, medium, high |
| `last_seen_at` | Latest source-backed interaction |
| `next_best_action` | Suggested next action |
| `privacy_level` | normal, sensitive, restricted |
| `created_at`, `updated_at` | Audit timestamps |

### 2. `party_roles`

A party can wear multiple hats.

Examples:

- Ruth Findlay: lead contact, spatial designer, specifier, referral source, client intermediary.
- TubeFab: supplier, powdercoater, remediation partner, quality investigation source.
- Gaynor Rodgers: designer/contact, customer issue intermediary, sales lead source.

Possible role values:

- lead
- customer
- designer
- architect
- specifier
- supplier
- contractor
- business partner
- referral source
- freight partner
- workshop contact
- customer issue contact
- internal/team
- strategic relationship

### 3. `contact_methods`

Phone, email, web and social details should be evidence-backed records, not buried in notes.

Suggested fields:

- `party_id`
- `method_type`: email, phone, mobile, website, LinkedIn, Instagram, etc
- `value`
- `label`: work, mobile, accounts, admin, personal if willingly supplied and relevant
- `source_system`
- `source_ref`
- `confidence`
- `last_verified_at`

### 4. `organisations` and party relationships

People and organisations should be linkable.

Examples:

- person → organisation
- designer → client
- customer → project
- supplier → material/source
- contractor → supplier organisation
- architect/designer → project/opportunity/order

Relationship records should support direction, role, evidence, confidence and dates.

### 5. `opportunities`

A lead should become a commercial opportunity, not the person itself.

Example:

> Auckland 3-3.5m boardroom table for Ruth Findlay’s client.

Suggested fields:

- `id`
- `primary_contact_party_id`
- `client_party_id`, if known
- `influencer_party_ids` or relationship links
- `opportunity_type`
- `product_interest`
- `estimated_value`
- `stage`
- `priority`
- `source`
- `next_action`
- `expected_close_path`
- `lost_reason`
- `won_order_id`
- `confidence`

### 6. `touchpoints`

Every meaningful interaction becomes a source-backed event.

Examples:

- inbound call
- outbound call
- email received
- email sent
- quote sent
- invoice paid
- customer issue raised
- supplier technical advice
- delivery booked
- sample sent
- website form submitted
- configurator session

Suggested fields:

- `id`
- `party_id`
- `related_opportunity_id`
- `related_order_id`
- `related_issue_id`
- `channel`
- `direction`
- `summary`
- `questions_asked`
- `promises_made`
- `product_intent`
- `sentiment`
- `follow_up_needed`
- `next_action`
- `source_evidence_id`
- `created_at`

This is a high-value AI-native table because it captures what people actually ask and what Innate actually promises.

### 7. `questions_objections_intent`

Capture recurring customer questions, objections and preferences as structured business intelligence.

Examples:

- approximate pricing
- delivery to Auckland
- power/data integration
- timber species
- colour and finish flexibility
- custom shapes
- lead time
- salt/sea durability
- care/warranty concerns
- designer/client sign-off needs

Business uses:

- sales scripts
- quote templates
- product-page improvements
- configurator options
- FAQs
- content ideas
- production/quality prevention
- price guidance

### 8. `source_evidence`

Every important fact should be traceable.

Suggested fields:

- `id`
- `source_system`: Gmail, Xero, Monday, Drive, Shopify, website, phone_call, Telegram, public_web, Supabase, etc
- `source_type`: email, invoice, quote, board_item, doc, sheet, image, transcript, URL, screenshot
- `source_id`
- `source_url` or internal ref
- `source_title`
- `source_date`
- `captured_at`
- `quoted_excerpt`
- `content_hash`, where relevant
- `privacy_level`
- `confidence`

Rule:

> AI summaries are useful, but the system must retain where the underlying fact came from.

### 9. `fact_claims`

Atomic claims extracted from evidence.

Examples:

| Claim | Source | Confidence |
|---|---|---|
| Ruth Findlay is a spatial designer in Auckland | phone call + public web | high |
| Ruth’s client may contact Innate directly | phone call | medium/high |
| Ruth is interested in boardroom table designs | phone call | high |
| Ballpark given was $6k-$8k | phone call | high |
| Danny said TubeFab had not seen the Earl issue before | phone call | high |
| Salt/sea exposure was raised as a possible concern | Gaynor email | medium |

Atomic claims allow later AI reasoning without relying on vague notes.

### 10. `research_profiles`

Public/business enrichment for relevant parties.

Suggested fields:

- `party_id`
- `research_summary`
- `business_relevance_summary`
- `known_experience`
- `public_projects`
- `style_or_positioning_clues`
- `recommended_sales_angle`
- `risk_or_uncertainty`
- `last_researched_at`
- `research_confidence`
- linked source evidence

### 11. `commitments_promises`

Structured promises made by or to Innate.

Examples:

- Guido gave $6k-$8k boardroom table ballpark.
- Gaynor will ask customer for additional photos.
- Danny will talk to Dulux.
- Innate will stand behind the product and work through a solution.
- Customer was told lead time is approximately six weeks from payment.

Fields should include source, due date if any, owner, status, and related party/order/issue/opportunity.

### 12. `entity_resolution_candidates`

A safe review table for possible matches before merging.

Match signals:

- exact email
- exact phone
- same name + company
- same Xero/Gmail/Monday/project ref
- same Drive folder/project
- same location/context
- same quote/invoice/order reference

Match statuses:

- exact
- strong
- probable
- weak
- conflict
- rejected
- manually merged

Weak/probable matches should go to human review, not auto-merge.

## Source-specific extraction plan

### Gmail

Extract:

- people and organisations
- emails and phone numbers
- thread relationships
- questions asked
- promises made
- quote/invoice/order references
- product interests
- attachments
- urgency/sentiment
- follow-up obligations
- signatures/contact details

### Xero

Extract:

- contacts
- quotes
- invoices
- payments
- line items
- totals and due amounts
- quote-to-invoice conversion
- payment behaviour
- supplier/customer financial relationships

Treat Xero as financial evidence, not the full relationship truth.

### Monday

Extract:

- legacy leads/customers
- production/order boards
- status columns
- due dates
- owner/assignee fields
- comments/updates
- stock/material links
- old customer history

Treat Monday as legacy/workshop evidence until migration gates are met.

### Google Drive

Extract/index:

- project folders
- quote/spec docs
- PDFs
- drawings
- screenshots
- photos
- sheets
- supplier folders
- customer/project docs

Drive should provide source evidence and document links rather than become unstructured notes.

### Shopify / website / configurator

Extract:

- products viewed or configured, where available
- enquiry forms
- Shopify customers/orders
- product/page source truth
- abandoned or submitted configurator choices
- product interest patterns

Website/configurator should become a front-end intent capture system.

### Calls / Telegram / Hermes notes

Extract:

- call summaries
- decisions
- owner/action commitments
- contact updates
- customer issue details
- source instructions from Guido
- corrections and prevention intelligence

Calls should be first-class touchpoints, not informal notes only.

### Public web

For relevant parties, search:

- person + location
- company/practice
- LinkedIn
- company website
- ArchiPro / project pages / media
- Instagram or professional social profiles if clearly business-relevant
- NZBN / Companies Office when business identity matters

Store source-backed enrichment only. Avoid irrelevant or creepy private data collection.

## Privacy and relevance rule

When Guido says “collect as much information as possible”, interpret that as:

> Collect as much relevant, source-backed, business-useful information as possible.

Good to capture:

- public professional profile
- company/project history
- design/specifier role
- business relationships
- contact details supplied or business-public
- questions asked
- design preferences
- buying signals
- commitments and outcomes

Avoid or restrict:

- sensitive personal details
- unrelated personal/private directory data
- scraped home addresses unless directly supplied/relevant for delivery/order context
- speculative claims without evidence
- unverified AI inferences presented as fact

## Conflict/source-of-truth hierarchy

If systems disagree, do not silently choose whichever is convenient. Flag conflict and source it.

Suggested hierarchy by domain:

| Domain | Preferred source |
|---|---|
| Financial status | Xero first, bank/Akahu if available, then Supabase notes |
| Customer promise | Sent Gmail, quote doc, call transcript/source capture |
| Production status | Monday legacy/workshop until Tuesday migration complete |
| Forward sales state | Supabase/Tuesday leads/opportunities |
| Website/product truth | Live Shopify/website |
| Public professional profile | Source URL/excerpt with timestamp |
| Internal business decision | Hermes/Telegram/source capture with timestamp |

Example conflict output:

> Conflict: Monday says active, Supabase says complete, Xero says unpaid. Needs review.

## Ruth Findlay prototype example

Ruth should be represented as more than one flat lead row.

Potential graph:

- Party: Ruth Findlay
- Roles: spatial designer, specifier, lead contact, potential referral source
- Location: Auckland
- Opportunity: 3-3.5m Auckland boardroom table for Ruth’s client
- Product interest: boardroom table, possible double Crossroads base, pebble-shaped top, colours, power unit, easy Auckland delivery
- Touchpoint: phone call with Guido on 2026-06-29
- Ballpark: $6,000-$8,000, source = phone call
- Website pages mentioned: boardroom designs and benchtops/configurator
- Public research profile: spatial/interior design background, public project evidence if source-backed
- Next action: watch for client contact; light check-in with Ruth if no contact by follow-up date
- Risk/unknown: client identity not yet known

## What Guido should eventually see

A `/relationships` or `/contacts` area in Tuesday/Mission Control.

For each party:

- top summary card
- roles
- contact methods
- timeline/touchpoints
- connected opportunities
- connected orders
- connected issues
- connected Xero/Monday/Gmail/Drive/Shopify records
- public research profile
- questions/objections/intent patterns
- commitments/promises
- source evidence
- confidence/conflict warnings
- next best action

## Business loops this strengthens

### Sales

Rank highest-value revenue actions by value, urgency, relationship importance, and likelihood.

### Quoting

Use prior similar jobs, product patterns, objections, delivery realities and margin evidence.

### Website/content

Turn repeated customer questions into product-page improvements, FAQs, configurator changes and content ideas.

### Production

Connect customer-known promises, paid scope, drawings, materials, production state and delivery obligations.

### Finance

Connect Xero quotes/invoices/payments to opportunities, orders, customers and follow-up priority.

### Quality/customer issues

Turn service issues into prevention intelligence linked to product, supplier, material, environment, handling, communication and remedy.

### Supplier strategy

Track supplier quality, reliability, cost, responsiveness, issues and best use cases.

## Suggested phased execution

### Pass 1: Read-only data map

Produce a report covering:

- available sources
- schemas/fields
- row/item/thread/document counts
- duplicate contact fields
- identifiers that can connect systems
- source-of-truth rules by domain
- obvious gaps and risks

### Pass 2: Canonical schema draft

Draft the exact Supabase schema additions:

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

### Pass 3: Real-example prototype

Use a small set of real examples before bulk migration:

- Ruth Findlay
- Gaynor Rodgers
- Danny / TubeFab
- one repeat customer
- one supplier
- one completed order
- one customer issue
- one Xero-only customer
- one Monday legacy customer
- one Drive-heavy project

Goal: prove the model with real messiness.

### Pass 4: Review-mode backfill

Run extraction across source systems but initially create only:

- candidate matches
- draft profiles
- evidence links
- conflict reports
- human review queues

No blind auto-merge or risky overwrites.

### Pass 5: Approved writes and UI

Only after the review-mode output is trusted:

- apply migrations
- backfill safe canonical parties
- link existing leads/orders/samples/issues
- build Tuesday `/relationships` UI
- add relationship cards to leads/orders/issues
- add daily/triggered enrichment jobs

## Open decisions to refine

- Should the canonical centre be named `parties`, `relationships`, or `contacts`?
- How much of this belongs in Supabase versus indexed files/vector/search storage?
- What should be auto-written versus human-reviewed?
- What confidence threshold is enough for auto-linking?
- What is the minimum useful Tuesday UI for phase one?
- Should public web enrichment run on all leads or only qualified/hot/strategic leads?
- How should sensitive/private contact data be filtered?
- How do we avoid duplicate people when Gmail, Xero, Monday and Drive names differ?
- What should the first read-only source inventory include?

## Current recommendation

Proceed next with a read-only worker task:

> Inventory Supabase, Xero, Monday, Gmail, Drive and Shopify/website sources; map current identifiers; identify duplicate contact fields; propose the canonical relationship schema; and produce a Ruth-style example profile showing exactly how one person would connect across all systems.

This keeps the direction ambitious but avoids premature migration or messy AI-generated duplicates.
