# Tuesday Master Hub UI Architecture

> Status: Draft architecture spec
> Scope: Innate Mission Control / Tuesday internal operator UI
> Build rule: Planning only until Guido explicitly says `BUILD`.

## 1. North star

Tuesday is Innate's internal master hub: a warm, real-time, source-backed operating console for running the business.

It should become the place where Guido, Nick, Hermes, and future operators can see what is true, what needs attention, what is blocked, and what can safely happen next.

The design ambition is not to copy Monday.com. Monday is a board system. Tuesday should be an operating surface: calmer, more beautiful, more contextual, more source-aware, and much harder to misuse.

Core model:

- Supabase is the target durable source-of-truth layer for Tuesday-owned structured records; today, Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records, while Monday remains current workshop/legacy truth for stock, customer history, and production tasks until migration gates are met.
- Tuesday is the human control surface.
- Agents and scripts are workers that capture, reconcile, draft, and flag.
- Vercel is the hosting layer, not the business brain.
- Legacy calculators and standalone apps are evidence/adapters until migrated into the source-backed spine.

## 2. Product principles

### 2.1 Beautiful but operational

Tuesday should feel like a premium Innate-built cockpit, not a generic SaaS board.

Use:

- warm neutral backgrounds
- timber/steel-inspired accents
- generous spacing
- calm hierarchy
- high contrast only for decisions, blockers, and risk
- plain language
- beautiful empty states
- minimal motion, never jumpy

Avoid:

- dense spreadsheet-first layouts as the default
- random colour tags without meaning
- dark/jumpy dashboard aesthetics
- sections that feel like different apps stitched together
- hidden source assumptions

### 2.2 Source-backed by default

Every important displayed value should be able to answer:

- Where did this come from?
- When was it last checked?
- Is it customer-entered, staff-entered, synced, calculated, inferred, or approved?
- Is it safe to use?
- What would block using it?

### 2.3 Draft-first, approval-aware

Tuesday may draft, prepare, reconcile, and suggest.

It must not silently perform protected actions such as:

- sending customer emails or quotes
- creating or sending Xero documents
- publishing website changes
- changing customer-visible pricing
- changing production commitments externally
- booking freight or making payments

Protected actions require explicit approval and should leave an audit event.

### 2.4 One operating system, many sections

Every section should feel like part of the same product.

Production, Quoting, Leads, Orders, Freight, Stock, Suppliers, and Admin should reuse the same shell, status language, evidence pattern, approval model, and blocker model.

No section should invent its own schema, lifecycle, sync rules, or safety rules without documenting why.

## 3. Global shell

The global shell is always present and should provide the same orientation in every section.

Required shell elements:

1. **Primary navigation**
   - Dashboard
   - Inbox
   - Leads
   - Quoting
   - Orders
   - Production
   - Freight
   - Stock / Materials
   - Suppliers / Relationships
   - Admin / Audit

2. **Business pulse bar**
   - today status
   - active blockers
   - pending approvals
   - sync health
   - urgent customer/workshop items

3. **Global search**
   - search by customer, lead, order, quote, supplier, material, address, email subject, source reference

4. **Decision queues**
   - Needs Guido
   - Needs Nick / workshop
   - Needs source data
   - Needs customer reply
   - Needs supplier confirmation

5. **Safe action indicator**
   - read-only
   - draft
   - internal write
   - external write
   - customer-visible
   - financial/legal

6. **Source and sync health**
   - Supabase status
   - Monday status where relevant
   - Xero status where relevant
   - Shopify/Gmail/source status where relevant
   - last successful sync/check

## 4. Standard section template

Every major section should use the same underlying page structure.

### 4.1 Overview panel

Purpose: Answer “what matters in this section right now?”

Should show:

- key counts
- new items
- blocked items
- overdue items
- changed-since-last-check items
- items needing approval
- sync/source warnings

### 4.2 Work queue

Purpose: Give operators a clear list of live business objects.

Each row/card should show:

- object name/reference
- customer/supplier/job where relevant
- status
- owner
- next action
- age / due date
- source freshness
- blockers/warnings
- confidence indicator

### 4.3 Detail panel

Purpose: Show the selected object with full context.

Should include:

- canonical Supabase record fields
- human-readable summary
- related objects
- notes
- attached/source evidence
- calculated outputs
- approval state
- history/audit events

### 4.4 Decision/action panel

Purpose: Make the next safe action obvious.

Should include:

- suggested next action
- why this action is suggested
- draft output where applicable
- approval buttons where applicable
- blocked-action explanation when unsafe
- exact external side effect if approved

### 4.5 Source/evidence panel

Purpose: Make trust inspectable.

Should show:

- source system
- source record/link
- source timestamp
- last checked timestamp
- raw payload or safe summary where useful
- source confidence
- mismatch warnings

## 5. Section definition contract

Every new Tuesday section must define a contract before it is built.

Suggested TypeScript shape:

```ts
export type TuesdayActionClass =
  | "read_only"
  | "draft"
  | "internal_write"
  | "external_write"
  | "customer_visible"
  | "financial_or_legal";

export type TuesdaySectionDefinition = {
  key: string;
  label: string;
  purpose: string;
  primaryObjects: string[];
  canonicalTables: string[];
  externalSources: string[];
  allowedActions: TuesdayActionClass[];
  protectedActions: TuesdayActionClass[];
  requiredPanels: Array<"overview" | "queue" | "detail" | "decision" | "sourceEvidence">;
  defaultSort?: string;
  owners: Array<"Guido" | "Nick" | "Hermes" | "Workshop" | "Admin">;
  blockerTypes: string[];
  approvalRules: string[];
  auditEvents: string[];
  realtimeEvents: string[];
};
```

Example:

```ts
export const quotingSection: TuesdaySectionDefinition = {
  key: "quoting",
  label: "Quoting",
  purpose: "Create source-backed internal quote drafts and approvals.",
  primaryObjects: ["quote_request", "quote_scenario", "quote_cost_line"],
  canonicalTables: ["quote_requests", "quote_scenarios", "quote_cost_lines", "quote_audit_events"],
  externalSources: ["gmail", "shopify", "legacy_calculator", "supplier_price", "freight_api"],
  allowedActions: ["read_only", "draft", "internal_write"],
  protectedActions: ["customer_visible", "financial_or_legal", "external_write"],
  requiredPanels: ["overview", "queue", "detail", "decision", "sourceEvidence"],
  defaultSort: "blocked desc, updated_at desc",
  owners: ["Guido", "Hermes"],
  blockerTypes: ["missing_source_price", "stale_source_price", "missing_delivery_destination", "margin_below_policy", "unapproved_policy"],
  approvalRules: ["Customer-visible quote requires Guido approval", "Xero draft creation requires explicit approval"],
  auditEvents: ["quote_draft_created", "quote_policy_approved", "quote_blocked", "quote_ready_for_review"],
  realtimeEvents: ["quote_request_created", "quote_blocker_changed", "quote_approval_requested"],
};
```

## 6. Shared status model

Statuses should be consistent across sections where possible.

Base lifecycle:

- `new`
- `triaged`
- `in_progress`
- `blocked`
- `needs_review`
- `needs_approval`
- `approved`
- `ready`
- `done`
- `archived`

Sections can add domain-specific substatus, but the base status should remain queryable globally.

Every status should have:

- label
- description
- owner type
- allowed transitions
- blocker behaviour
- whether it appears in Needs Guido / Needs Nick / Needs Source Data queues

## 7. Shared blocker model

A blocker is a first-class business object, not just a red badge.

Blockers should include:

- blocker key
- severity: info / warning / blocking / critical
- human label
- explanation
- source/evidence
- affected action
- resolution path
- owner
- created/updated timestamps

Common blocker types:

- missing required field
- stale source data
- source mismatch
- missing delivery destination
- unverified freight
- missing supplier price
- unapproved quote policy
- margin below policy
- external sync failure
- customer reply limit reached
- protected action requires approval

## 8. Approval and action safety model

Each action must declare its safety class.

### 8.1 Action classes

- **Read-only:** inspect, filter, preview, search.
- **Draft:** create text/output but no durable external effect.
- **Internal write:** update Supabase/internal Tuesday state.
- **External write:** update Monday/Xero/Shopify/Gmail/freight/supplier system.
- **Customer-visible:** anything a customer can see.
- **Financial/legal:** quote, invoice, payment, contract, supplier commitment.

### 8.2 Approval records

Approvals should be durable records with:

- actor
- timestamp
- approved action
- approved object
- source version
- draft version
- exact side effect allowed
- expiry if relevant

Approval is scoped. Approval for one action does not imply approval for another action.

## 9. Source/evidence model

Tuesday should separate evidence from truth.

Examples of evidence:

- email thread
- Shopify enquiry
- old calculator payload
- supplier PDF
- Xero invoice/quote
- Monday board item
- freight API response
- manual note

Evidence should be linked to canonical records, not treated as canonical by default.

Suggested fields:

- source_type
- source_label
- source_record_id
- source_url
- captured_at
- last_checked_at
- payload_summary
- raw_payload_ref where safe
- confidence
- mapped_object_type
- mapped_object_id

## 10. Realtime rules

Realtime should support calm operational awareness, not UI noise.

Use realtime for:

- new lead/enquiry received
- quote blocker changed
- approval requested
- production schedule changed
- urgent workshop issue
- freight quote/status changed
- source sync failed

Avoid realtime for:

- every small field edit
- animations without operational meaning
- flickery totals
- non-actionable background churn

Realtime events should be grouped into human-friendly changes:

- “3 new leads need triage”
- “Raine quote is blocked: delivery destination missing from visible freight line”
- “Two production jobs moved to needs review”

## 11. Initial section contracts

### 11.1 Production

Purpose: Keep workshop production clear, sequenced, and source-aware.

Canonical direction:

- Tuesday should eventually own internal planning state.
- Until migration gates are met, Monday remains current workshop/legacy truth for stock, customer history, and production tasks; treat it as a source/evidence/sync partner only for areas that have an approved Tuesday-owned workflow.

Needs:

- stable production board
- workshop-friendly queue
- job health
- material readiness
- due date risk
- Nick-visible next actions
- audit of manual changes

### 11.2 Quoting

Purpose: Create source-backed internal quote drafts with pricing rules, source costs, blockers, and approvals.

Canonical direction:

- Supabase quote spine is the quote truth layer.
- Legacy calculators are evidence/adapters until migrated.
- Tuesday `/quoting` is the approval/control UI.

Needs:

- quote request intake
- source prices
- deterministic calculation engine
- freight/delivery checks
- margin/policy checks
- customer-safe draft output
- explicit approval gate

### 11.3 Leads

Purpose: Turn enquiries into clean, followed-up, source-backed sales opportunities.

Needs:

- Gmail/Shopify/source intake
- customer identity
- enquiry summary
- next action
- follow-up count
- quote/order linkage
- source thread visibility
- no accidental sending

### 11.4 Freight

Purpose: Make freight quoting, delivery destination, cost source, and booking status inspectable.

Needs:

- destination visibility
- freight source/API response
- paid freight blocker if no destination
- quote/order linkage
- manual override audit
- delivery status

## 12. Build sequence

Do not start implementation until the repo/worktree is clean enough to isolate changes.

Recommended order:

1. Park or commit current production-plan work.
2. Create a clean branch/worktree for Tuesday architecture.
3. Add section definition types and examples.
4. Refactor shell/navigation to consume section definitions.
5. Build reusable panel primitives:
   - overview panel
   - work queue
   - detail panel
   - decision/action panel
   - source/evidence panel
   - blocker chip/list
   - approval card
6. Apply the template first to a low-risk section or read-only view.
7. Apply to Quoting.
8. Apply to Production only after protecting current production-plan behaviour with tests/manual QA.

## 13. Non-goals for first build

Do not attempt all of these in the first architecture pass:

- replacing all Production Plan internals
- migrating public website pricing
- replacing the old benchtop calculator publicly
- creating Xero quotes automatically
- sending customer emails
- changing Shopify
- inventing a full generic workflow engine

First pass should create shared structure and make future sections easier and safer.

## 14. Acceptance criteria for the first architecture implementation

The first implementation should be considered successful when:

- the app has a typed section definition pattern
- navigation and shell are driven by section metadata
- at least two sections use the same page template structure
- every section declares source tables/systems and allowed/protected actions
- blockers and approvals share common UI primitives
- source/evidence display is reusable
- no customer-visible or financial external actions are introduced
- existing production plan behaviour is not degraded

## 15. Codex handoff summary

If delegating this to Codex, give this instruction:

> Build the Tuesday master hub UI foundation, not a one-off redesign. Read `reference/tuesday/tuesday-master-hub-ui-architecture.md`, `reference/tuesday/foundations.md`, and `reference/tuesday/quoting.md`. Implement a typed section definition contract, shared shell metadata, and reusable panel primitives. Do not alter customer-visible systems, do not deploy, and do not refactor the production plan deeply until current behaviour is protected. Preserve draft-only and approval-first safety boundaries.
