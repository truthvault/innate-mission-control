# Tuesday handover: Supabase source-of-truth reconciliation and payment spine

Created: 2026-05-25 14:20 NZST
Owner: Tuesday agent
From: Hermes/default
Scope: Innate Furniture Tuesday/Supabase source-of-truth guardrails
Status: historical reconciliation/backfill handover. No Tuesday app/code changes were made in this pass.

Current-use warning, added 2026-06-14:

- Use this file as evidence of the May 25 reconciliation/backfill pass, not as a blanket current source-of-truth rule.
- Current transition rule: Supabase/Tuesday is forward truth for leads and approved Tuesday-owned records; Monday remains the current workshop/legacy source for stock, customer history, and production tasks until the Tuesday migration gates are met.
- Re-check `/Users/mack-mini/innate-mission-control/reference/tuesday/README.md` and `/Users/mack-mini/innate-mission-control/docs/current/business-operating-context.md` before using this handover for live operational decisions.

## Executive summary

Guido confirmed the operating rule:

> Supabase/Tuesday is the source of truth for Innate leads, orders, production/customer tasks and ops records. Monday is Nick's workshop mirror/legacy workflow. Xero and Akahu/bank data are financial evidence sources.

Read the quote above as the May 25 target/backfill posture. It does not by itself prove that Monday has been retired for production, stock, or customer-history workflows.

Hermes corrected current Supabase data and backfilled the active order spine. The next task for Tuesday is to make that durable: build a daily reconciliation job and UI/API support so Supabase stays accurate instead of drifting behind Monday/Xero/bank reality.

The reconciliation job must include:

1. Supabase leads and approved Tuesday-owned order records as forward records.
2. Monday Orders as current workshop/legacy status until the Tuesday migration gates are met.
3. Xero invoices/quotes as financial document truth: invoice sent/issued, status, amount, due amount, linked quote/invoice numbers.
4. Akahu/bank records as cash evidence: payment date, payment amount, bank reference, payer, unmatched deposits.
5. Balance logic per order, including orders split across multiple Xero invoices.
6. A drift report, not blind overwrites.

## What Hermes already changed in Supabase

### Leads/order source-of-truth cleanup

- Verified Supabase `leads` had 103 total leads and no overdue open follow-ups at the time of audit.
- Created/verified won-lead links to canonical `orders` where safe.
- Backfilled 14 active/non-collected Monday Orders into Supabase `orders`.
- Added `order_links` for Monday mirror items and Xero invoice references.
- Added `order_events` audit records for active-order backfills and Guido corrections.
- Removed 13 unsafe temporary auto-matched lead links/events after catching a bad match pass.
- Normalized mistaken `INV--####` invoice codes back to `INV-####`.

Evidence folders:

- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-05-25/supabase-lead-sot-backfill/`
- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-05-25/active-orders-sot-backfill/`
- `/Users/mack-mini/innate-mission-control/reference/evidence/2026-05-25/guido-status-corrections/`

### Guido corrections applied

These were applied directly to Supabase and read back:

- Blair York: marked `complete`, collected 2026-05-25.
- Tania Pocock / Tania & Tony: marked `complete`; follow-up cleared.
- Kelven Plamondon: marked `finished`, waiting for customer collection, not complete.
- Michael Calder: corrected to Abigail Richards / Michael Calder; Abigail is active contact.
- Amanda Lawrey: sample sent out; wait for response, no nudge before 2026-05-29.

## Current canonical tables observed/used

Existing dedicated order spine:

- `orders`
- `order_items`
- `order_events`
- `order_links`

Existing leads table:

- `leads`

Current caveat:

- There is no dedicated `lead_events` or `lead_links` table yet.
- Existing lead/order relationships are represented through `order_links` using:
  - `link_type = 'other'`
  - `external_id = <lead id>`
  - `metadata.relation = 'won_lead'` or `related_lead`

## Original two-part task list

This handover explicitly carries forward Guido/Hermes' two-part list:

### 1. Daily/triggered reconciliation job

Required behaviour:

- Read Supabase leads/orders.
- Compare Monday mirror.
- Include Xero invoices and Akahu/bank records.
- Flag mismatches.
- Do not auto-overwrite risky fields.
- Produce a short source-of-truth drift report.

This belongs mostly in a backend/job layer first, with read-only/report mode before any writes.

### 2. Tuesday UI source-of-truth visibility

Required UI behaviour:

- Clearly show Supabase canonical order state.
- Clearly show Monday mirror status separately.
- Show a mismatch warning when Monday lags or contradicts Supabase.
- Show Xero/Akahu payment/balance state as financial evidence, not production truth.
- Keep the UI warm/simple and avoid a Monday-like cluttered board.

This belongs after the reconciliation job has reliable output, so the UI is showing trusted facts rather than another half-sync.

## Reconciliation job objective

Build a daily/triggered job that answers, for every active/recent order:

- Is the Supabase order present?
- Is the customer/order status correct?
- What Xero invoices/quotes are attached?
- Has an invoice been sent/issued?
- Has it been paid in Xero?
- Is there actual bank evidence of payment in Akahu?
- What is the outstanding balance?
- Does the order have multiple invoices/deposits/balance invoices?
- Is Monday lagging Supabase or contradicting it?
- Are there unmatched bank deposits that likely belong to orders?
- What needs human review?

Important: the job should initially produce a report and low-risk internal events. It should not blindly mutate production/customer status until confidence rules are proven.

## Proposed data model additions

### Option A: add dedicated financial spine tables

Recommended if Tuesday agent can run migrations safely.

#### `order_financial_documents`

One row per Xero quote/invoice/credit note linked to a canonical Supabase order.

Suggested fields:

- `id uuid primary key`
- `order_id uuid references orders(id)`
- `document_type text` values: `xero_quote`, `xero_invoice`, `xero_credit_note`, `manual_adjustment`
- `xero_quote_number text`
- `xero_quote_id text`
- `xero_invoice_number text`
- `xero_invoice_id text`
- `xero_invoice_url text`
- `contact_name text`
- `contact_email text`
- `status text` from Xero: `DRAFT`, `SUBMITTED`, `AUTHORISED`, `PAID`, `VOIDED`, etc.
- `sent_at timestamptz` if available from Xero/email history
- `issued_at date`
- `due_at date`
- `subtotal numeric`
- `tax numeric`
- `total numeric`
- `amount_paid numeric`
- `amount_due numeric`
- `currency text default 'NZD'`
- `line_items jsonb default '[]'`
- `raw_xero jsonb`
- `confidence text` values: `exact`, `probable`, `manual_review`
- `created_at`, `updated_at`, `archived_at`

Uniqueness:

- unique on `xero_invoice_id` where not null
- unique on `xero_invoice_number` where not null
- unique on `xero_quote_id` where not null

#### `order_payments`

One row per payment signal, preferably bank transaction backed.

Suggested fields:

- `id uuid primary key`
- `order_id uuid references orders(id)` nullable while unmatched
- `financial_document_id uuid references order_financial_documents(id)` nullable
- `source_system text` values: `akahu`, `xero_payment`, `manual`
- `external_transaction_id text`
- `payment_date date`
- `amount numeric not null`
- `currency text default 'NZD'`
- `payer_name text`
- `bank_account_name text`
- `bank_reference text`
- `bank_particulars text`
- `bank_code text`
- `xero_invoice_number text`
- `match_status text` values: `matched`, `probable`, `unmatched`, `ignored`
- `match_confidence numeric` 0-1
- `match_reasons jsonb default '[]'`
- `raw_akahu jsonb`
- `raw_xero jsonb`
- `created_at`, `updated_at`, `archived_at`

Uniqueness:

- unique on `(source_system, external_transaction_id)` where `external_transaction_id` is not null.

#### `order_balance_snapshots`

Daily computed financial truth per order. This helps owner brief/history and prevents recomputing every page load.

Suggested fields:

- `id uuid primary key`
- `order_id uuid references orders(id)`
- `snapshot_date date`
- `invoice_count integer`
- `invoice_total numeric`
- `xero_amount_paid numeric`
- `bank_amount_matched numeric`
- `amount_due numeric`
- `balance_status text` values: `not_invoiced`, `deposit_due`, `part_paid`, `paid_in_full`, `overpaid`, `review_needed`
- `has_multiple_invoices boolean default false`
- `has_unmatched_payment boolean default false`
- `has_xero_bank_disagreement boolean default false`
- `summary text`
- `raw_rollup jsonb`
- `created_at timestamptz default now()`

Uniqueness:

- unique on `(order_id, snapshot_date)`.

### Option B: no schema changes initially

If Tuesday agent is mid-work and should avoid migrations, use existing tables:

- Store invoice links in `order_links` with `link_type = 'xero_invoice'` and metadata containing totals/status/amount_due.
- Store bank payment links in `order_links` with `link_type = 'other'` and metadata like:
  - `relation = 'bank_payment'`
  - `source_system = 'akahu'`
  - `amount`
  - `payment_date`
  - `bank_reference`
  - `match_confidence`
- Store daily financial summary in `order_events` with:
  - `event_type = 'financial_reconciliation_snapshot'`
  - `metadata.invoice_total`
  - `metadata.bank_amount_matched`
  - `metadata.amount_due`
  - `metadata.balance_status`

This is less clean but safe as a first pass.

## Xero reconciliation requirements

For each Supabase order, the job should collect from Xero:

- invoice number and ID
- invoice URL
- quote number and ID if available
- contact/customer
- invoice status
- issue date / invoice date
- due date
- total
- amount paid
- amount due
- line items
- whether invoice is voided/credited
- payment records if exposed by Xero API

### Invoice sent vs invoice exists

Do not treat “invoice exists” as “invoice sent” unless Xero provides sent/email state or the email/Gmail evidence confirms it.

Use confidence levels:

- `exact`: Xero says sent, or Gmail sent thread found with invoice number.
- `probable`: invoice is authorised and has customer-facing link, but no sent proof.
- `unknown`: draft/authorised state only.

### Multiple invoices per order

Some orders may have:

- deposit invoice + balance invoice
- separate product and delivery invoice
- revised invoice after quote change
- invoice plus credit note

Therefore `orders.xero_invoice_number` is not enough. Treat it as the primary/main invoice only. The financial reconciliation must support many Xero documents per order.

Rollup logic:

- `invoice_total = sum(active invoice totals) - sum(credit notes)`
- `xero_amount_paid = sum(invoice amount paid)`
- `xero_amount_due = sum(invoice amount due)`
- `bank_amount_matched = sum(Akahu matched deposits)`
- `balance_due = invoice_total - bank_amount_matched`, but flag if this disagrees materially with Xero amount due.

Tolerance:

- Use small rounding tolerance, e.g. `$0.02`.
- Flag overpayment, duplicate bank payments, and bank/Xero mismatch.

## Akahu/bank reconciliation requirements

Akahu should be used to confirm actual money movement, not just invoice status.

For each recent bank transaction/deposit:

Capture:

- transaction ID
- date
- amount
- payer/name/merchant if available
- particulars/code/reference
- account
- raw memo/description
- raw Akahu payload

Match hierarchy:

1. Exact invoice number in bank reference/particulars/code.
2. Exact order code/invoice number in description.
3. Exact amount + close customer/payer name + recent invoice due window.
4. Split payment pattern: amount equals expected deposit or balance.
5. Manual review if only weak name/amount match.

Do not auto-mark paid from a weak bank match. Create a review item/report row instead.

## Daily reconciliation behaviour

Recommended schedule:

- Daily morning NZ time before owner brief, e.g. 07:30 NZST.
- Also manual run endpoint/button for Tuesday/Hermes.

High-level algorithm:

1. Read canonical Supabase `orders` and active/recent `leads`.
2. Read Monday Orders mirror for active workshop rows.
3. Read Xero invoices/quotes modified since last run plus any linked invoice IDs/numbers on active orders.
4. Read Akahu bank deposits/transactions modified since last run, plus recent window fallback, e.g. last 30-60 days.
5. Normalize identifiers:
   - invoice numbers: `INV-####`
   - quote numbers: `QU-####`
   - Monday item IDs
   - customer names/emails/phones
   - bank references stripped/casefolded
6. Build reconciliation candidates.
7. Apply safe exact updates only:
   - add missing exact `order_links`
   - add `order_events` snapshots
   - update financial fields if the document ID is exact
8. Do not auto-change production/customer status from weak evidence.
9. Emit drift report.
10. Store run metadata and errors.

## Drift report format

The daily report should be short and owner-actionable.

Suggested sections:

- **Cash received:** payments matched to orders since last run.
- **Invoices sent/issued:** new Xero invoices or changed statuses.
- **Balances due:** orders with remaining balance.
- **Paid but not marked:** bank/Xero says paid, Supabase order still awaits payment or active follow-up.
- **Supabase vs Monday drift:** Monday mirror differs from canonical Supabase status.
- **Unmatched deposits:** Akahu deposits likely customer payments but not matched confidently.
- **Unlinked invoices:** Xero invoices that look like Innate orders but no Supabase order link.
- **Needs Guido/Nick decision:** only high-confidence, high-impact items.

Example item shape:

```json
{
  "severity": "review",
  "order_id": "uuid",
  "customer_name": "Example Customer",
  "issue": "Xero INV-1234 shows amount_due 0 but no Akahu payment matched",
  "suggested_action": "Check if paid through non-bank/Xero reconciliation or manually mark payment source",
  "sources": ["xero:INV-1234", "supabase:orders.uuid"]
}
```

## Tuesday UI/API expectations

Do not make the UI busy. Guido wants Tuesday warm/simple, not a Monday clone.

Recommended display:

- On order detail: small financial chip set:
  - `Invoice sent`
  - `Deposit paid`
  - `Balance due $X`
  - `Paid in full`
  - `Bank match review`
- On owner/daily brief: only exceptions and cash-relevant changes.
- On production/workshop view for Nick: keep financial detail minimal; show only what affects work/release/delivery.

Important visual distinction:

- Supabase/Tues status = forward truth for approved Tuesday-owned records.
- Monday status = current workshop/legacy truth until migration gates are met.
- Xero status = invoice/accounting state.
- Akahu status = bank/cash evidence.

## Safety rules

- Do not send invoices, emails, payment requests, or customer messages from this job.
- Do not write Monday from this job unless a separate approved mirror-sync worker exists.
- Do not mark an order paid from a weak Akahu match.
- Do not mark production complete because invoice is paid.
- Do not mark invoice sent unless Xero/Gmail evidence supports it.
- Keep raw source payloads for audit, but avoid displaying private bank details widely in the UI.

## Implementation suggestion for Tuesday agent

### Phase 1: read-only drift report

- No migrations if risky.
- Read Supabase + Monday + Xero + Akahu.
- Write markdown/json report to `reference/evidence/` or a Supabase audit table if available.
- Prove matching logic on current data.

### Phase 2: exact-link backfill

- Add exact Xero invoice links to orders.
- Add exact Akahu payment links where invoice number or exact reference exists.
- Add financial snapshot events.
- Read back and surface in admin/debug view.

### Phase 3: schema migration

- Add `order_financial_documents`, `order_payments`, `order_balance_snapshots`.
- Backfill from existing `order_links`/`order_events` metadata.
- Keep `orders.xero_invoice_number` as primary convenience field only.

### Phase 4: owner brief integration

- Morning report highlights only cash/order exceptions.
- Optional Telegram/Hermes cron output later, but first make Tuesday data reliable.

## Acceptance criteria

The work is done when:

- A daily/manual reconciliation run can be executed without touching customer-visible systems.
- It reads Supabase, Monday, Xero and Akahu.
- It supports multiple invoices per order.
- It can tell whether each order is:
  - not invoiced
  - invoice issued/sent status known/unknown
  - deposit paid
  - part-paid
  - paid in full
  - has balance due
  - requires manual review
- It reports Supabase/Monday drift without overwriting Supabase blindly.
- It has evidence links/events/readbacks for every update.
- It does not clutter the Tuesday UI.

## Known current active order state to preserve

From today's Supabase correction pass:

- Blair York: complete/collected.
- Tania Pocock: complete/done.
- Kelven Plamondon: finished, waiting for collection.
- Abigail Richards / Michael Calder: in production; confirm Thursday pickup/collection after final cuts.
- Amanda Lawrey: sample sent; wait for response, no nudge before 2026-05-29.

If Monday disagrees with these, do not assume Monday is merely lagging. Treat the disagreement as a transition reconciliation issue: check the current Tuesday README and business operating context, then verify the relevant Supabase/Tuesday, Monday, Xero, and payment evidence before acting.
