# Tuesday source-of-truth reconciliation foundation

Date: 2026-05-25
Mode: read-only/report-only foundation. No cron has been scheduled.

## What this adds

The reconciliation foundation lives in:

- `lib/tuesday/source-of-truth-reconciliation.ts`
- `scripts/reconcile-source-of-truth.mjs`
- `app/api/tuesday/reconcile-source-of-truth/route.ts`

It reads Supabase/Tuesday orders as canonical data, treats Monday as a mirror, and treats Xero/Akahu as financial evidence sources. The default output is a report; it does not mutate Supabase, Monday, Xero, Akahu, customers, invoices, emails, or payment requests.

## Run manually

Markdown report to stdout:

```bash
npm run reconcile:sot
```

JSON report to stdout:

```bash
npm run reconcile:sot -- --format json
```

Write a Markdown report file:

```bash
npm run reconcile:sot -- --out reference/evidence/source-of-truth-reconciliation/latest.md
```

The `--write-safe-events` flag is intentionally refused in this first pass. It is reserved for a later approved phase that may write internal Supabase audit events only.

## API route

Read-only JSON:

```text
GET /api/tuesday/reconcile-source-of-truth
```

Read-only Markdown:

```text
GET /api/tuesday/reconcile-source-of-truth?format=markdown
```

The route returns source statuses and errors without secrets. It is intended for Tuesday manual checks or a future approved UI/manual trigger, not for public/customer use.

## Source behaviour

- Supabase: reads `orders` and best-effort `order_links` using `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`.
- Monday: reads via existing read-only Monday helpers when `MONDAY_API_TOKEN` and `MONDAY_ORDERS_BOARD_ID` are present. Monday never overwrites Supabase.
- Xero: uses direct read-only Xero Accounting API calls when `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are present. Missing env returns `xero_not_connected` rather than crashing.
- Akahu: reads recent positive transactions if `AKAHU_APP_TOKEN`/`AKAHU_CLIENT_ID` and `AKAHU_USER_TOKEN`/`AKAHU_ACCESS_TOKEN` are present. Missing env returns `akahu_not_connected` rather than crashing.

## Reconciliation logic

Per order, the module supports:

- multiple Xero invoices/credit notes per Supabase order;
- invoice totals, Xero amount paid/due, matched bank deposits, balance due;
- statuses: `not_invoiced`, `invoice_unknown_sent`, `invoice_issued`, `deposit_due`, `part_paid`, `paid_in_full`, `overpaid`, `review_needed`;
- evidence confidence labels: `verified`, `probable`, `missing_evidence`, `review_needed`;
- match confidence and reasons;
- Supabase-vs-Monday drift items;
- Monday mirror items that have no matched Supabase canonical order;
- source connection/evidence gaps for Supabase, Monday, Xero, and Akahu;
- unmatched deposits for human review.

Safety rules preserved:

- Never mark paid from weak Akahu match.
- Never mark invoice sent just because an invoice exists.
- Never let Monday overwrite Supabase canonical status.
- Report-only by default.

## Current status guardrails preserved

The module includes report guardrails for these known current states:

- Blair York: complete/collected.
- Tania Pocock: complete/done.
- Kelven Plamondon: finished and waiting for collection.
- Abigail Richards / Michael Calder: in production; confirm Thursday pickup/collection after final cuts.
- Amanda Lawrey: sample sent; wait until 2026-05-29.

If source evidence appears to disagree, the report flags review rather than mutating status.

## Smoke test

```bash
npm run test:reconcile:sot
```

This test uses fixtures only. It proves:

- invoice number normalization;
- multiple invoices rolling up to one order;
- exact Akahu invoice-reference matching;
- weak Akahu payment left unmatched;
- Supabase/Monday drift is reported;
- missing Xero/Akahu envs return labelled disconnected statuses.

## Still blocked / next phase

- Live Xero coverage depends on the current read-only Xero credentials and helper scope.
- Akahu transaction shape may need field tuning after first live credentialed read.
- No Supabase writeback/audit-event storage has been implemented yet.
- No actual cron has been scheduled. A daily job should be approved separately after live report output is reviewed.
- Dedicated tables such as `order_financial_documents`, `order_payments`, and `order_balance_snapshots` remain a later migration phase.
