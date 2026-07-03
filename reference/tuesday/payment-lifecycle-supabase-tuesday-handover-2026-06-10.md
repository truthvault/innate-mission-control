# Handover: clean Supabase + Tuesday payment lifecycle for deposit/balance invoices

Date: 2026-06-10
Owner: Codex worker
Repo: `/Users/mack-mini/innate-mission-control`

## Why this exists

Joe / Paulownia Trust exposed a tracking gap:

- Deposit invoice `INV-1137` was paid.
- Balance invoice `INV-1138` exists and was sent to the customer.
- Supabase can currently represent the state only indirectly through:
  - `orders.status`
  - `orders.next_action`
  - `orders.paid_on_date`
  - `orders.last_customer_touch_at`
  - `order_events.metadata`
  - `order_financial_documents`
  - `order_payments`
- Tuesday does not yet give Guido a clean, visible lifecycle like: deposit sent → deposit paid → in production → ready → balance sent → awaiting balance payment → balance paid → book freight / dispatch.

The goal is to make this lifecycle explicit, queryable, and visible without losing invoice history.

## Non-negotiables

- Do not overwrite `orders.xero_invoice_number` with balance invoices. It currently points at the primary/deposit/order invoice and replacing it hides deposit history.
- Do not mutate Monday as part of this work. Tuesday/Supabase is the source of truth for this lifecycle; Monday remains legacy/workshop mirror.
- Do not expose or log private Xero online invoice URLs, Supabase service keys, OAuth tokens, `.env.local`, or customer secret links. Redact secrets in any notes/output.
- Before editing Next.js code, read the relevant local Next docs under `node_modules/next/dist/docs/` per `AGENTS.md`. This project is Next 16 and has local conventions.
- Use `/Users/mack-mini/innate-mission-control/.env.local` only at runtime. Never copy its values into files.
- Preserve production-plan appearance and existing Supabase order-intake behaviour unless deliberately extending it.

## Current relevant schema and code

Schema reference:

- `reference/tuesday/supabase-orders-spine-schema-2026-05-25.sql`
- `reference/tuesday/supabase-order-intake-schema-2026-05-28.sql`

Existing tables already useful:

- `orders`
  - `status`
  - `priority`
  - `next_action`
  - `paid_on_date`
  - `last_customer_touch_at`
  - `xero_invoice_number`
  - `xero_invoice_id`
  - `xero_invoice_url`
- `order_financial_documents`
  - `document_type`
  - `xero_invoice_number`
  - `xero_invoice_id`
  - `xero_invoice_url`
  - `status`
  - `sent_at`
  - `issued_at`
  - `due_at`
  - `total`
  - `amount_paid`
  - `amount_due`
  - `line_items`
  - `raw_xero`
- `order_payments`
  - `financial_document_id`
  - `source_system`
  - `payment_date`
  - `amount`
  - `xero_invoice_number`
  - `match_status`
  - `match_confidence`
- `order_events`
  - used for durable audit trail.

Relevant code:

- `lib/production/order-intake.ts`
  - reconciles Xero invoices + Akahu evidence into Supabase.
  - already detects balance-only invoices in `buildIntakeSuggestedTasks` by invoice/reference text and returns no production tasks.
  - `listOrderIntakeItems()` currently chooses the first financial document for display, which is unsafe once an order has both deposit and balance invoices.
- `scripts/sync-akahu-order-payments.py`
  - syncs bank/Akahu payment evidence into `order_payments`.
- `app/production/plan/PlanClient.tsx`
  - Tuesday Production Plan UI and order intake UI types.
- `app/production/ProductionClient.tsx`
  - older Orders page card UI.
- `lib/monday/fetch-orders.ts` and `lib/monday/mapping.ts`
  - Monday-backed order cards. These do not currently know Supabase payment lifecycle.
- `package.json`
  - useful checks: `npm run lint`, `npm run test:order-intake`, `npm run test:planning`, `npm run smoke:tuesday`.

## Real example to support

Order:

- Supabase order ID: `f55d986e-d3d0-4453-a83a-102e56979691`
- `order_code`: `INV-1137`
- customer: `Paulownia Trust (Joe)`
- current intended state:
  - `status`: `awaiting_payment`
  - `priority`: `cash`
  - `finished_date`: `2026-06-10`
  - `paid_on_date`: `null` until the balance is settled
  - `next_action`: await balance payment for `INV-1138`, then book freight/dispatch

Invoices:

- Deposit/order invoice `INV-1137`
  - Xero status: `PAID`
  - total/paid: `$6,108.00`
  - amount due: `$0.00`
- Balance invoice `INV-1138`
  - Xero status: `AUTHORISED`
  - amount due: `$4,072.00`
  - due date: `2026-06-15`
  - was emailed to customer by Guido after assistant-created Gmail draft.

Events already inserted:

- `ready_for_balance`
- `balance_invoice_sent`

Do not duplicate those events during implementation tests. If seeding or correcting the example order, use idempotent checks.

## Proposed clean model

### 1. Keep invoice history in `order_financial_documents`

Add lifecycle fields to `order_financial_documents` instead of stuffing everything into `orders`:

```sql
alter table public.order_financial_documents
  add column if not exists document_role text not null default 'primary'
    check (document_role in ('quote','primary','deposit','balance','final','adjustment','unknown')),
  add column if not exists lifecycle_stage text
    check (lifecycle_stage in ('drafted','authorised','sent','part_paid','paid','voided','unknown')),
  add column if not exists sent_channel text
    check (sent_channel in ('xero','gmail','manual','unknown')),
  add column if not exists customer_touch_event_id uuid references public.order_events(id) on delete set null;
```

Indexes:

```sql
create index if not exists order_financial_documents_order_role_idx
  on public.order_financial_documents(order_id, document_role);

create index if not exists order_financial_documents_lifecycle_idx
  on public.order_financial_documents(order_id, lifecycle_stage, amount_due);
```

Notes:

- Existing unique indexes on `xero_invoice_number`, `xero_invoice_id`, and quote id stay.
- `xero_invoice_url` can remain in Supabase, but do not render it into logs or handover docs unless user explicitly needs it.
- For Paulownia Trust, the intended doc roles are:
  - `INV-1137`: `deposit` or `primary` depending on historical wording. Prefer `deposit` if the invoice line items indicate 60% deposit.
  - `INV-1138`: `balance`.

### 2. Add an order-level derived payment summary, preferably as a view

Avoid duplicating truth into many columns. Create a read model for Tuesday:

`public.order_payment_lifecycle_v` with one row per order:

Suggested output fields:

- `order_id`
- `primary_invoice_number`
- `deposit_invoice_number`
- `deposit_total`
- `deposit_paid_at`
- `deposit_amount_due`
- `balance_invoice_number`
- `balance_total`
- `balance_due_at`
- `balance_sent_at`
- `balance_paid_at`
- `balance_amount_due`
- `balance_customer_touch_event_id`
- `payment_stage`
- `payment_stage_label`
- `payment_next_action`

Suggested `payment_stage` enum/text values:

- `no_invoice`
- `deposit_due`
- `deposit_paid`
- `in_production`
- `ready_for_balance`
- `balance_sent`
- `balance_due`
- `balance_paid`
- `dispatch_ready`
- `complete`
- `manual_review`

Important: distinguish `balance_sent` vs `balance_due` only if useful. If keeping it simpler, use `awaiting_balance_payment` instead.

Derivation rules:

- If any balance document has `amount_due > 0` and `sent_at is not null`, stage is `balance_sent` / `awaiting_balance_payment`.
- If balance document has `amount_due <= 0` or a matched payment for that balance invoice, stage is `balance_paid`.
- If deposit document is paid but no balance document exists and order is not finished, stage is `in_production`.
- If order has `finished_date` and no balance document exists/sent, stage is `ready_for_balance`.
- If there are conflicting docs or ambiguous matching, stage is `manual_review`.

Whether this is implemented as a SQL view, Postgres function, or TypeScript selector is Codex’s choice, but prefer a SQL view for consistent source-of-truth queries.

### 3. Keep `orders.status` simple and operational

Do not turn `orders.status` into a detailed payment-state enum. Keep current allowed values stable:

- `active`
- `awaiting_payment`
- `in_production`
- `finished`
- `complete`

Use it as the coarse operational status:

- waiting for deposit or balance: `awaiting_payment`
- paid and workshop active: `active` or `in_production` depending existing app convention
- ready but waiting for balance: `awaiting_payment`
- all paid and ready to dispatch: likely `finished` until dispatched/complete
- done: `complete`

Use `order_payment_lifecycle_v.payment_stage` for detail.

### 4. Update reconciliation to upsert all invoice docs under the right order

Current `lib/production/order-intake.ts` mostly assumes one invoice creates/finds one order by `orders.xero_invoice_number`.

Update strategy:

1. Keep primary/order invoice matching as-is.
2. Add balance-invoice detection that links balance invoices back to the existing primary order instead of creating a new order.
3. Matching candidates:
   - invoice reference contains a previous invoice number, e.g. `Balance for INV-1137`.
   - invoice line items contain `deposit paid on INV-1137` or similar.
   - same Xero contact plus amount pattern if exact prior invoice cannot be found, but mark `confidence='manual_review'`.
4. For a detected balance invoice:
   - upsert `order_financial_documents` with `document_role='balance'`.
   - do not create production tasks.
   - do not overwrite `orders.xero_invoice_number`.
   - set or preserve `orders.status='awaiting_payment'` if amount due > 0.
   - set `orders.next_action` to “Await balance payment for INV-xxxx, then book freight/dispatch.” if no better/manual next action exists.
   - insert idempotent `order_events` row `balance_invoice_seen` or `balance_invoice_sent` depending whether `sent_at` is known.
5. For deposit/primary invoice:
   - upsert `order_financial_documents` with `document_role='deposit'` if invoice is clearly deposit, otherwise `primary`.
   - if paid, leave current order-intake production-task flow intact.

### 5. Update payment sync to attach payments to the right financial document

In `scripts/sync-akahu-order-payments.py`:

- When matching a payment by invoice number, populate both:
  - `order_payments.order_id`
  - `order_payments.financial_document_id`
- On exact matched payment for a balance invoice:
  - set balance `order_financial_documents.amount_paid/amount_due/lifecycle_stage` if Xero cache confirms it, or rely on next Xero reconciliation.
  - update `orders.paid_on_date` only when full balance/final amount is settled, not just deposit.
  - update `orders.status` from `awaiting_payment` to `finished` or `active dispatch-ready` according to current operational convention.
  - set `orders.next_action` to “Balance paid. Book freight/dispatch.”
  - insert idempotent `balance_payment_received` event.

Avoid marking full order `paid_on_date` at deposit payment time. If legacy code currently does that, either leave legacy values alone or clarify field semantics in a migration/comment. Long term, `paid_on_date` should mean “final/balance paid” for order completion, while deposit paid lives in the lifecycle view.

## Tuesday UI plan

### A. Order intake / payment queue

Update `listOrderIntakeItems()` and its API response to include lifecycle summary:

```ts
type OrderPaymentLifecycle = {
  paymentStage: string;
  paymentStageLabel: string;
  paymentNextAction: string | null;
  depositInvoiceNumber: string | null;
  depositPaidAt: string | null;
  balanceInvoiceNumber: string | null;
  balanceSentAt: string | null;
  balanceDueAt: string | null;
  balanceAmountDue: number | null;
  balancePaidAt: string | null;
};
```

Then in `app/production/plan/PlanClient.tsx`:

- Show a payment badge on intake/order review cards:
  - `Deposit paid`
  - `Balance invoice sent`
  - `Awaiting balance $4,072 due 15 Jun`
  - `Balance paid`
- Do not show a balance invoice as a new production order needing tasks.
- If stage is `awaiting_balance_payment`, show action text: `Wait for payment, then book freight/dispatch`.

### B. Main production plan cards

Tuesday currently gets order cards from Monday via `getOrdersWithFallback()`.

Options:

1. Minimal safe version:
   - Keep Monday card source.
   - Add a server-side Supabase payment summary lookup keyed by `xeroInvoiceNumber` / order code.
   - Merge payment lifecycle into `UiOrder` as optional fields.
   - Render a small badge on production cards.

2. Cleaner later version:
   - Move production order cards to Supabase-first source and use Monday only as workshop mirror.
   - Bigger scope. Do not do this unless Guido explicitly asks.

For this handover, do the minimal safe version.

Suggested additions to `UiOrder`:

```ts
paymentStage?: string | null;
paymentStageLabel?: string | null;
paymentNextAction?: string | null;
balanceInvoiceNumber?: string | null;
balanceAmountDue?: number | null;
balanceDueAt?: string | null;
balanceSentAt?: string | null;
```

Add a helper, for example:

- `lib/production/order-payment-lifecycle.ts`

Responsibilities:

- fetch rows from `order_payment_lifecycle_v` by invoice/order codes.
- merge into Monday-derived `UiOrder[]` without mutating Monday.
- no secret logging.

Display in production card:

- near status/track badges: payment badge.
- in expanded detail: payment next action.
- for Paulownia Trust example, the card should clearly say something like:
  - `Balance sent · INV-1138 · $4,072 due 15 Jun`
  - Next: `Await balance payment, then book freight/dispatch.`

### C. Dispatch page

`app/production/dispatch/DispatchClient.tsx` currently includes checks like `Xero link present` and `Next: {order.nextAction}`.

Once lifecycle is merged into `UiOrder`, update dispatch checks:

- `Balance paid` state should be `needed/check/done`.
- If awaiting balance, dispatch card should not imply freight is clear to book.
- If balance paid, next action should prompt freight booking.

## Migration/backfill plan

Create a SQL migration under the project’s established migration location. If no formal migrations directory exists, add the SQL under `reference/tuesday/` and document how to apply it.

Backfill steps:

1. Add `document_role`, `lifecycle_stage`, `sent_channel`, `customer_touch_event_id` to `order_financial_documents`.
2. Backfill lifecycle from existing document status/amount:
   - Xero status `PAID` or `amount_due <= 0` → `paid`.
   - status `AUTHORISED` and `sent_at is not null` → `sent`.
   - status `AUTHORISED` and amount due > 0 → `authorised`.
3. Backfill roles:
   - if line items/reference mention `deposit`, role `deposit`.
   - if line items/reference mention `balance` or `deposit paid on INV`, role `balance`.
   - otherwise `primary`.
4. Create `order_payment_lifecycle_v`.
5. For known Joe/Paulownia Trust order, ensure:
   - `INV-1137` exists as deposit/primary paid document linked to order `f55d986e-d3d0-4453-a83a-102e56979691`.
   - `INV-1138` exists as balance document linked to same order.
   - order status is `awaiting_payment` while `INV-1138.amount_due > 0`.
   - lifecycle view returns awaiting balance payment with `INV-1138` and `$4,072.00`.

## Tests and verification

Run at least:

```bash
npm run lint
npm run test:order-intake
npm run smoke:tuesday
```

If touching production plan behaviour, also run:

```bash
npm run test:planning
```

Add/extend tests if possible:

1. Balance-only invoice is linked to existing order and creates no production tasks.
2. Deposit-paid + balance-sent order appears as awaiting balance payment.
3. Exact balance payment moves lifecycle to balance paid / dispatch ready.
4. `orders.xero_invoice_number` remains the deposit/primary invoice after balance invoice reconciliation.
5. `listOrderIntakeItems()` does not pick an arbitrary “first” document when both deposit and balance documents exist.

Manual verification target:

- Paulownia Trust/Joe in Tuesday should show:
  - deposit paid: `INV-1137`
  - balance sent/awaiting payment: `INV-1138`, `$4,072.00`, due `2026-06-15`
  - next action: await payment, then book freight/dispatch
- It should not show `INV-1138` as a new production order needing approval/tasks.

## Suggested implementation sequence

1. Read Next docs required by `AGENTS.md` before app edits.
2. Add SQL migration/view for document roles + lifecycle summary.
3. Create TypeScript helper for lifecycle fetch/merge.
4. Update `lib/production/order-intake.ts`:
   - deterministic doc selection
   - balance-invoice linking
   - no production task creation for balance docs
   - idempotent events
5. Update `scripts/sync-akahu-order-payments.py` to attach payments to `financial_document_id` and handle balance payment state.
6. Update Tuesday UI types and cards:
   - order intake/payment queue
   - production plan cards
   - dispatch page checks
7. Backfill Joe/Paulownia as the seed/example case.
8. Run checks and include output in final Codex report.

## Final Codex report format

Return:

- Changed files
- Schema changes applied or SQL ready-to-apply
- Backfill result for Joe/Paulownia Trust
- Test output
- Remaining risks / follow-up

Do not report private invoice URLs or secrets.
