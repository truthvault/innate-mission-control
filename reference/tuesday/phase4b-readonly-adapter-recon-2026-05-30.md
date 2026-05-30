# Phase 4B read-only adapter reconnaissance - 2026-05-30

Scope: static inspection only, except local repo checks after writing this report. No Gmail, Xero, Supabase, Monday, Shopify, website, or customer-visible writes were performed for this recon.

## 1. Candidate read-only mechanisms by source

### Gmail full thread / latest inbound / latest sent

Candidate A: Google Workspace helper CLI/API

- Path: `/Users/mack-mini/.hermes/skills/productivity/google-workspace/scripts/google_api.py`
- Entrypoints inspected:
  - `gmail_search(args)` around line 282
  - `gmail_get(args)` around line 346
  - CLI parser around lines 728-839 exposes Gmail `search`, `get`, `send`, `reply`, `labels`, `modify`
- Appears: **safe if restricted to `search` and `get`; risky as a whole module**
- Why:
  - `gmail_search` uses Gmail `users().messages().list` and `messages().get(format="metadata")`.
  - `gmail_get` retrieves a single message and extracts headers/body.
  - Same script also exposes mutating Gmail actions: `send`, `reply`, and `modify`; those must never be imported/exposed through a generic adapter surface.
- Required inputs:
  - Search mode: Gmail query string, max result limit.
  - Get mode: Gmail message id; optionally thread id by using Gmail API directly or extending a read-only wrapper.
  - For sent-history: customer email, thread id, or query constrained with `from:(Innate aliases)`, `to/customer`, and date window.
- Outputs needed by Phase 4A:
  - `message_id`, `thread_id`, `internal_date`/date, `from`, `to`, `cc`, `subject`, `snippet`, body text, labels.
  - Thread-level ordered messages.
  - Latest inbound message: id/date/from/body/snippet.
  - Latest sent reply: id/date/from/body/snippet, and boolean `has_newer_sent_reply`.
  - Safety metadata: `source`, `queried_at`, `body_truncated`, `query`, `matched_count`.
- Gap:
  - No narrow adapter currently wraps only Gmail GET/list/thread operations for Phase 4A. Build a dedicated `GmailReadOnlyAdapter` rather than importing CLI actions wholesale.

Candidate B: Gmail watchdog read-only helpers

- Path: `/Users/mack-mini/.hermes/scripts/innate_gmail_supabase_watchdog.py`
- Entrypoints inspected:
  - `build_gmail_service()` lines 119-134 uses `gmail.readonly` scope.
  - `gmail_list_messages()` lines 137-150.
  - `gmail_get_message()` lines 153-154.
  - `gmail_get_thread()` lines 157-158, metadata-only thread fetch.
  - `extract_text()`, `clean_text()`, `has_newer_sent_reply()` lines 185-204 and 378-389.
- Appears: **safe for Gmail readback helpers only; risky as a script because it can write Supabase with `--apply`**
- Why:
  - Gmail service is explicitly read-only and direct helper functions are GET/list only.
  - Script default is dry-run, but it contains Supabase `PATCH`/`POST` paths behind `--apply`.
- Required inputs:
  - Gmail query/window, max messages, optional thread id/message id.
  - For reply detection: thread object and latest inbound internalDate.
- Outputs needed by Phase 4A:
  - Same as Candidate A, plus `is_innate_relevant`, classification evidence, and `has_newer_sent_reply` can be reused as local logic.
- Gap:
  - Current `gmail_get_thread()` fetches metadata only. Phase 4A needs full latest inbound/latest sent bodies, so a safe adapter should fetch thread metadata first, then full bodies only for selected message ids.

Candidate C: Lead reconciliation Gmail evidence

- Path: `/Users/mack-mini/innate-mission-control/scripts/lead_source_of_truth_reconciliation_readonly.py`
- Entrypoints inspected:
  - `gmail_service()` lines 76-82.
  - `gmail_search()` lines 85-107.
- Appears: **safe for bounded Gmail metadata evidence; not sufficient for full-thread readback**
- Why:
  - Uses list/get metadata only, returns snippets and headers.
  - Also performs Supabase and Monday readback; no writes in the inspected script.
- Required inputs:
  - Lead email/customer name to build bounded Gmail query.
- Outputs needed by Phase 4A:
  - Useful as a precedent/source matcher, but not enough for body-level draft safety.
- Gap:
  - Does not return full bodies or full threads.

### Xero contact / quote / invoice / payment readback

Candidate A: TypeScript Xero read-only helper

- Path: `/Users/mack-mini/agent-task-tuesday-readback-harness-20260530/lib/xero/read-only.ts`
- Appears: **safe, best first Xero adapter source**
- Why:
  - Existing repo-local read-only helper for Xero summaries.
  - Already consumed by `/Users/mack-mini/innate-mission-control/lib/production/order-intake.ts` via `listRecentXeroInvoiceSummaries`.
- Required inputs:
  - Contact id/name/email and/or Xero reference/quote number/invoice number.
  - Optional page/limit/date window.
- Outputs needed by Phase 4A:
  - Contact: `contactID`, name, email.
  - Quote: `quoteID`, `quoteNumber`, status, reference, date, expiry, total, contact, line items if available.
  - Invoice: `invoiceID`, `invoiceNumber`, status, type, reference, date, dueDate, total, amountDue, amountPaid, contact, line items.
  - Payment: paid status, `fullyPaidOnDate`, `amountPaid`, linked invoice number/contact.
- Gap:
  - Confirm exact exported functions before implementation and add a fixture-only test around any new wrapper.

Candidate B: Xero cached invoice lookup

- Path: `/Users/mack-mini/.hermes/scripts/xero_cached_invoice_lookup.py`
- Appears: **safe if used cache-first; unknown if forced live**
- Why:
  - Name and prior inspection indicate cached lookup, useful for invoice readback without live API calls.
- Required inputs:
  - Invoice number/reference/contact identifier.
- Outputs needed by Phase 4A:
  - Invoice readback fields above, plus cache metadata/staleness.
- Gap:
  - Should not be the primary live adapter until exact cache freshness and fields are documented in wrapper tests.

Candidate C: Xero cash snapshot

- Path: `/Users/mack-mini/.hermes/scripts/xero_cash_snapshot.py`
- Entrypoints inspected:
  - Uses local Xero MCP handlers: `listXeroOrganisationDetails`, `listXeroInvoices`, `listXeroQuotes`, `listXeroBankTransactions`, `listXeroReportBalanceSheet`.
  - Same-day cache at `~/.hermes/state/xero/xero_cash_snapshot.json` unless `--force` is passed.
- Appears: **safe for read-only broad snapshot, but too broad for per-case adapter**
- Why:
  - It is explicitly read-only and sanitizes Xero errors.
  - It fetches broad invoices/quotes/bank data, which is more customer data than Phase 4A should need for one case.
- Required inputs:
  - None by default; optional `--force`.
- Outputs needed by Phase 4A:
  - Useful fallback fields: outstanding invoices, recent paid invoices, recent sent/accepted quotes, bank transaction summary.
- Gap:
  - Build narrower by-contact/by-reference adapter instead of broad account snapshot.

Candidate D: Dry-run-first Xero draft script readback logic

- Path: `/Users/mack-mini/.hermes/scripts/xero_draft_sales_doc.py`
- Entrypoints inspected:
  - Read-only dry-run path exits before writes when `--apply` is absent.
  - Contact search uses `listXeroContacts` lines 39 and 54-66.
  - After `--apply`, script creates contact/quote/invoice and performs readback verification lines 93-103 and 254-286.
- Appears: **risky as an adapter source; useful as a verification reference only**
- Why:
  - It imports create handlers and can write with `--apply`.
  - The `verify_readback()` logic is valuable for field comparisons after future approved writes, but Phase 4A should not depend on a script that can mutate.
- Required inputs:
  - Contact name/email/id, doc type, reference, line JSON, line amount types.
- Outputs needed by Phase 4A:
  - Use only the verification field list: status, contact, reference, title/summary, expiry/due date, total, line count, line descriptions/account/tax/quantity/unit amounts.
- Gap:
  - Extract comparison rules into local pure functions later, not now.

Candidate E: Xero paid invoices vs Monday Orders scan

- Path: `/Users/mack-mini/.hermes/scripts/scan_xero_paid_vs_monday_orders.py`
- Entrypoints inspected:
  - Xero `listXeroInvoices` read-only.
  - Monday GraphQL queries only in inspected code; creates local JSON/MD report.
- Appears: **safe for audit/report use; not ideal for Phase 4A direct adapter**
- Why:
  - Good precedent for invoice payment evidence and local report writing.
  - Broad scan and Monday dependency are unnecessary for a single preflight case.
- Required inputs:
  - Env config, scan date windows.
- Outputs needed by Phase 4A:
  - Invoice paid status, amount paid, total, line descriptions, best Monday match evidence if needed.
- Gap:
  - Avoid Monday dependency for Phase 4A unless explicitly required.

### Supabase / Tuesday lead and order readback

Candidate A: Tuesday lead list helper

- Path: `/Users/mack-mini/innate-mission-control/lib/leads/fetch-leads.ts`
- Entrypoint inspected:
  - `listLeads(limit = 200)` lines 72-103.
- Appears: **safe for list/read use**
- Why:
  - Performs Supabase REST `GET` against `leads?select=*...`; no mutation path in file.
- Required inputs:
  - Optional limit. For Phase 4A direct lookup, adapter should add lead id/email filter rather than listing and filtering broadly.
- Outputs needed by Phase 4A:
  - Lead id, customer/contact/email/phone, source/system/url, status, priority, owner, next follow-up/action, last interaction, notes summary, Monday item id, sample fields.
- Gap:
  - Need narrow `getLeadById`, `getLeadByEmail`, and maybe `getLeadByMondayItemId` wrappers.

Candidate B: Lead source-of-truth reconciliation read-only script

- Path: `/Users/mack-mini/innate-mission-control/scripts/lead_source_of_truth_reconciliation_readonly.py`
- Entrypoints inspected:
  - `supabase_get()` lines 51-59 uses REST GET only.
  - Reads `leads`, `orders`, and `order_links` lines 126-132.
  - Monday and Gmail evidence reads included.
- Appears: **safe for reconciliation/audit; too broad for per-case adapter**
- Why:
  - Explicit read-only docstring and only GET in inspected Supabase helper.
  - Uses service-role key for reads, so outputs must avoid dumping sensitive rows.
- Required inputs:
  - Env file. Existing script scans many active rows.
- Outputs needed by Phase 4A:
  - Lead row, order row, order_links, Monday item readback evidence, Gmail metadata evidence.
- Gap:
  - Build a scoped Supabase adapter to fetch exactly one lead/order/link set by id/ref/email.

Candidate C: Order intake / production readback

- Path: `/Users/mack-mini/innate-mission-control/lib/production/order-intake.ts`
- Entrypoints inspected:
  - `listOrderIntakeItems()` lines 387 onwards reads `order_intake_reviews`, `orders`, `order_financial_documents`, `order_payments`, `production_order_tasks`.
  - Read helpers around lines 459-494 fetch payment candidates, event existence, order by invoice.
- Appears: **mixed/risky as a module; safe only for selected GET functions**
- Why:
  - Contains useful read models for order/payment/financial document evidence.
  - Same module also contains mutation functions later, including `POST`/`PATCH` paths around lines 486 onward.
- Required inputs:
  - Order id, invoice number, or review id.
- Outputs needed by Phase 4A:
  - Order status, paid_on_date, product summary/category, invoice number/status/date/due/URL/totals, line items, payment evidence, approved tasks/review state.
- Gap:
  - Do not import the whole module into Phase 4A. Create a narrow read-only Supabase module or move pure read functions behind a guard.

Candidate D: Existing Phase 4A preflight collector

- Path: `/Users/mack-mini/agent-task-tuesday-readback-harness-20260530/scripts/tuesday_live_readback_preflight.py`
- Entrypoints inspected:
  - `collect_readback()`, `build_preflight_pack()`, `parse_args()`.
  - CLI flags `--live-gmail-readonly`, `--live-supabase-readonly`, `--live-xero-readonly` currently fail closed unless adapters exist.
- Appears: **safe current integration shell**
- Why:
  - Default mode is fixture-only and report-writing local only.
  - Live flags are named GET/read-only and should remain fail-closed until adapters satisfy hard stop rules below.
- Required inputs:
  - Fixture case id, env presence file, optional future live read-only flags.
- Outputs needed by Phase 4A:
  - Source status map, missing/stale sources, safe/blocked booleans, approval pack.
- Gap:
  - Needs actual adapter injection behind the fail-closed live flags.

### Quote spine / calculator / margin / delivery evidence

Candidate A: Quote spine draft script

- Path: `/Users/mack-mini/innate-mission-control/scripts/quote-spine-draft.mjs`
- Appears: **safe if run only as local deterministic calculation; inspect CLI before live use**
- Required inputs:
  - Quote/customer/project input, line items/calculator assumptions, margin/delivery fields depending on case.
- Outputs needed by Phase 4A:
  - `available`, quote id/ref, source files, line items, subtotal/tax/total, cost basis, markup/margin, delivery destination/suburb, freight/pickup/TBC flag, caveats.
- Gap:
  - Need a stable JSON output contract for Phase 4C; current script may be draft-oriented rather than adapter-oriented.

Candidate B: Quoting engine

- Path: `/Users/mack-mini/innate-mission-control/lib/quoting/engine.ts`
- Appears: **safe as pure calculator candidate if no external write path is used**
- Required inputs:
  - Product/category, dimensions, timber/species, finish/base, delivery/freight inputs, markup/margin settings.
- Outputs needed by Phase 4A:
  - Calculation basis, total, margin/markup, assumptions, warnings, delivery evidence.
- Gap:
  - Need identify exact exported function(s) and ensure adapter can run without web app side effects.

Candidate C: Quoting Supabase helper

- Path: `/Users/mack-mini/innate-mission-control/lib/quoting/supabase.ts`
- Appears: **unknown/mixed until function-level split is enforced**
- Why:
  - Supabase quoting helpers may include persistence as well as reads. Do not import into Phase 4A without proving only GET/select paths are reachable.
- Required inputs:
  - Quote/order/lead id and quote spine identifiers.
- Outputs needed by Phase 4A:
  - Stored quote spine, calculator assumptions, margin approval/evidence, delivery destination.
- Gap:
  - Separate read functions from write/upsert functions or build a new read-only REST wrapper.

Candidate D: Reference docs

- Paths:
  - `/Users/mack-mini/.hermes/skills/productivity/guido-collaboration-operating-system/references/innate-quote-spine-v1-2026-05-27.md`
  - `/Users/mack-mini/.hermes/skills/productivity/guido-collaboration-operating-system/references/innate-quote-control-v1.md`
  - `/Users/mack-mini/.hermes/skills/productivity/guido-collaboration-operating-system/references/innate-calculators.md`
  - `/Users/mack-mini/.hermes/skills/productivity/innate-furniture-operations/references/reply-desk-quote-xero-adversarial-gates-2026-05.md`
  - `/Users/mack-mini/.hermes/skills/productivity/innate-furniture-operations/references/benchtop-calculator-thinner-top-value-engineering-2026-05.md`
  - `/Users/mack-mini/.hermes/skills/productivity/innate-furniture-operations/references/mainfreight-estimate-invoice-cross-check-2026-05.md`
- Appears: **safe as design/evidence references**
- Required inputs:
  - None for static docs.
- Outputs needed by Phase 4A:
  - Rules and stop conditions: default markup, margin evidence, delivery destination requirement, quantity-dependent caveats, Xero field ownership.
- Gap:
  - Convert these into deterministic checks rather than letting adapter infer rules from prose.

## 2. Exact paths and preferred Phase 4C entrypoints

Lowest-risk preferred adapters:

1. Gmail: new local wrapper using direct helper patterns from `/Users/mack-mini/.hermes/scripts/innate_gmail_supabase_watchdog.py`, but only `gmail.readonly`, `messages.list`, `messages.get`, and `threads.get`.
2. Supabase/Tuesday: new repo-local read-only REST wrapper using the `listLeads` pattern from `/Users/mack-mini/innate-mission-control/lib/leads/fetch-leads.ts`; avoid importing mixed modules.
3. Xero: repo-local wrapper around `/Users/mack-mini/agent-task-tuesday-readback-harness-20260530/lib/xero/read-only.ts`; do not call create handlers.
4. Quote spine: pure calculator/read wrapper around `/Users/mack-mini/innate-mission-control/lib/quoting/engine.ts` and static quote-spine references; avoid persistence helpers until read-only split is proven.

## 3. Safety classification summary

| Source | Candidate | Safety |
| --- | --- | --- |
| Gmail | `google_api.py` `search`/`get` only | Safe if allowlisted; module risky |
| Gmail | `innate_gmail_supabase_watchdog.py` helper functions | Safe if helper-only; script risky with `--apply` |
| Gmail | `lead_source_of_truth_reconciliation_readonly.py` Gmail metadata | Safe but partial |
| Xero | `lib/xero/read-only.ts` | Safe/preferred |
| Xero | `xero_cached_invoice_lookup.py` | Safe/unknown depending cache/live mode |
| Xero | `xero_cash_snapshot.py` | Safe but broad |
| Xero | `xero_draft_sales_doc.py` | Risky; reference only |
| Supabase | `lib/leads/fetch-leads.ts` | Safe/preferred pattern |
| Supabase | `lead_source_of_truth_reconciliation_readonly.py` | Safe but broad |
| Supabase | `lib/production/order-intake.ts` | Mixed/risky; selected GET logic only |
| Quote spine | `quote-spine-draft.mjs` | Safe/unknown; verify CLI contract |
| Quote spine | `lib/quoting/engine.ts` | Safe if pure calculator only |
| Quote spine | `lib/quoting/supabase.ts` | Unknown/mixed |

## 4. Required inputs by source

Gmail:

- `thread_id` if known.
- `message_id` for exact latest inbound.
- Customer email and/or search tokens if ids are unknown.
- Date window, max results, allowed Innate sender aliases.

Xero:

- Contact id if known, otherwise contact name/email.
- Quote number/reference and/or invoice number/reference.
- Optional status filters: quote `SENT`/`ACCEPTED`/`DRAFT`, invoice `ACCREC`, `PAID`, `AUTHORISED`.
- Optional date window/page limit.

Supabase/Tuesday:

- Lead id, order id, email, Monday item id, order code, Xero invoice/quote number.
- Required env presence: Supabase URL and service key, but never print values.

Quote spine/calculator:

- Quote spine id/file if already exists.
- Product/category, dimensions/species/finish/base, line items, costs, markup/margin settings.
- Delivery destination/suburb/postcode or explicit pickup/TBC.
- Supplier/freight evidence references.

## 5. Output fields needed by Phase 4A preflight

Common source status envelope:

```ts
type ReadOnlySourceStatus = {
  status: "ok" | "missing" | "stale" | "blocked" | "error";
  source: "fixture" | "gmail" | "xero" | "supabase" | "quote_spine";
  live_called: boolean;
  fetched_at: string;
  inputs_used: Record<string, string | number | boolean | null>;
  blockers: string[];
  warnings: string[];
};
```

Gmail payload:

```ts
type GmailReadback = ReadOnlySourceStatus & {
  thread_id?: string;
  latest_inbound?: GmailMessageSummary;
  latest_sent?: GmailMessageSummary;
  has_newer_sent_reply?: boolean;
  thread_messages?: GmailMessageSummary[];
};
```

Xero payload:

```ts
type XeroReadback = ReadOnlySourceStatus & {
  contact?: { contactID?: string; name?: string; emailAddress?: string };
  quotes?: XeroQuoteSummary[];
  invoices?: XeroInvoiceSummary[];
  payments?: XeroPaymentSummary[];
};
```

Supabase/Tuesday payload:

```ts
type TuesdayReadback = ReadOnlySourceStatus & {
  lead?: Record<string, unknown>;
  order?: Record<string, unknown>;
  order_links?: Record<string, unknown>[];
  financial_documents?: Record<string, unknown>[];
  payments?: Record<string, unknown>[];
};
```

Quote spine payload:

```ts
type QuoteSpineReadback = ReadOnlySourceStatus & {
  available: boolean;
  margin_checked: boolean;
  delivery_destination?: string;
  freight_mode?: "delivery" | "pickup" | "tbc";
  quote_total?: number;
  cost_total?: number;
  markup_percent?: number;
  margin_percent?: number;
  line_items?: Array<Record<string, unknown>>;
  caveats?: string[];
  evidence_paths?: string[];
};
```

## 6. Gaps before implementation

- Gmail needs a narrow full-thread read-only wrapper. Do not expose Gmail `send`, `reply`, or `modify` code paths.
- Gmail thread metadata helper needs body fetch for selected latest inbound/latest sent messages.
- Xero needs exact function export confirmation in `lib/xero/read-only.ts` and a by-contact/by-ref query rather than broad snapshots.
- Supabase needs narrow per-case `GET` wrappers; avoid importing modules that also contain `POST`/`PATCH` functions.
- Quote spine needs a stable JSON contract for `available`, `margin_checked`, and delivery destination evidence.
- All adapters need redaction guards for tokens/env/errors and bounded output lengths for email bodies/customer data.
- Live adapter wiring should add tests that monkeypatch/fake HTTP clients and assert no methods other than GET/read-only Xero handlers are callable.

## 7. Recommended integration order

1. Supabase/Tuesday lead/order readback: lowest risk because REST GET is simple and current Phase 4A already has source status slots.
2. Gmail read-only full thread: use `gmail.readonly`, bounded by thread id/message id first; search fallback second.
3. Xero read-only by contact/reference: use existing `lib/xero/read-only.ts`; no create handler imports.
4. Quote spine/calculator evidence: first static/local JSON contract, then pure calculator integration.
5. Optional payment evidence: add after invoice readback, using narrow invoice-number lookup only.

## 8. Hard stop rules for live adapter wiring

- Stop if any adapter imports or calls Gmail `send`, `reply`, `modify`, draft creation, or label mutation.
- Stop if any Xero adapter imports `createXeroContact`, `createXeroQuote`, `createXeroInvoice`, approve/send handlers, or accepts an `apply` flag.
- Stop if any Supabase adapter can call `POST`, `PATCH`, `PUT`, `DELETE`, `upsert`, `insert`, `update`, or `rpc` without a read-only allowlist proving the function is safe.
- Stop if any Monday GraphQL body starts with `mutation` or contains banned operations from `/Users/mack-mini/innate-mission-control/lib/monday/read-only-guard.ts`.
- Stop if an adapter would print raw env values, tokens, bearer strings, cookies, service keys, full unbounded email bodies, or broad customer dumps.
- Stop if readback is missing/stale and a downstream draft would need to guess.
- Stop if a quote/invoice case lacks margin/markup evidence or delivery destination/pickup/TBC status.
- Stop if fixture-only tests cannot prove live flags fail closed when credentials/adapters are absent.

## 9. Proposed small Phase 4C adapter interface, no implementation

```ts
type AdapterContext = {
  now: string;
  env: Record<string, string | undefined>;
  caseId: string;
  redact: (value: unknown) => unknown;
};

type AdapterResult<T> = {
  ok: boolean;
  status: "ok" | "missing" | "stale" | "blocked" | "error";
  source: "gmail" | "xero" | "supabase" | "quote_spine";
  live_called: boolean;
  fetched_at: string;
  data?: T;
  warnings: string[];
  blockers: string[];
};

interface ReadOnlyAdapter<TInput, TOutput> {
  readonly name: string;
  readonly allowedMethods: readonly string[];
  collect(input: TInput, ctx: AdapterContext): Promise<AdapterResult<TOutput>>;
}
```

Recommended concrete adapters:

- `GmailThreadReadOnlyAdapter.collect({ threadId?, messageId?, customerEmail?, query?, maxMessages })`
- `TuesdaySourceReadOnlyAdapter.collect({ leadId?, orderId?, email?, xeroInvoiceNumber?, xeroQuoteNumber? })`
- `XeroSalesReadOnlyAdapter.collect({ contactId?, contactName?, email?, quoteNumber?, invoiceNumber?, reference? })`
- `QuoteSpineReadOnlyAdapter.collect({ quoteSpinePath?, quoteInput?, orderId?, leadId? })`

Implementation notes:

- Each adapter returns only summarized/bounded fields required by `tuesday_live_readback_preflight.py`.
- Each adapter owns its own allowlist and has tests that fail if mutating method names appear in reachable code.
- Phase 4A should continue to default fixture-only and require explicit live read-only flags.
