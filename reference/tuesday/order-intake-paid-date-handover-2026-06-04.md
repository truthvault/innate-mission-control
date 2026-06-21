# Order Intake Paid-Date Accuracy Handover — 2026-06-04

> **For Codex:** implement this in a clean Tuesday branch/worktree later. Do not assume the current messy working tree is safe to commit as-is.

## Goal

Make Tuesday’s “latest confirmed production orders” and order-intake paid dates trustworthy by ensuring `orders.paid_on_date` is sourced from actual matched payment evidence, not from the date the sync/reconcile job happened to run.

## Why this exists

Guido asked for the two latest confirmed orders in Supabase. The initial query incorrectly surfaced **Taylor Vets Ltd** because Supabase had `orders.paid_on_date = 2026-06-03` for `INV-1144`.

Audit showed Taylor’s actual matched Akahu payment was dated **2026-05-21**, and Taylor was already fulfilled/supply work, not a current production order. Correct latest production-confirmed orders are:

1. **Raine Wapp** — `INV-1147`, paid `2026-06-02`, active, Table, `West Coast Beech benchtop`
2. **Camilla Penney** — `INV-1148`, paid `2026-06-02`, active, Table, `2m classic oval dining table`

## Source-of-truth principle

For production ranking:

- Use actual matched payment evidence where available.
- Exclude already fulfilled/complete rows from current production ranking.
- Exclude supply/sample/non-production noise when asking for current confirmed production orders.
- Do not infer a paid date from the sync date.
- Do not mutate live Supabase/customer records without explicit approval.

## Existing live Supabase corrections already applied

These data corrections were already made after Guido approved fixing existing details and future logic.

### Taylor Vets Ltd / INV-1144

Evidence:

- Matched Akahu payment date: `2026-05-21`
- Amount: `$296`
- Reference: `INV-1144`
- Particulars: `Tom Taylor`
- Was already fulfilled, with `finished_date = 2026-06-02`
- Event note said Guido confirmed it was fulfilled and no Tuesday production tasks were required.

Applied correction:

- `orders.status`: `active` → `complete`
- `orders.paid_on_date`: `2026-06-03` → `2026-05-21`
- `orders.next_action`: set to `Already fulfilled. Cleared from Tuesday production intake; no Nick/Dylan production tasks required.`
- `orders.finished_date`: left as `2026-06-02`
- intake review marked `approved`
- intake review source summary updated with correction metadata
- audit event added: `order_data_corrected`

### Kelven Plamondon / INV-1146

Evidence:

- Matched payment date: `2026-05-27`
- Supabase paid date had been `2026-05-29`, likely another sync-date stamp.

Applied correction:

- `orders.paid_on_date`: `2026-05-29` → `2026-05-27`
- `orders.status`: left `active`
- `orders.next_action`: left as `Paid. Nick to review and approve the production task plan.`
- audit event added: `order_data_corrected`

## Rows deliberately not changed

Do not “fix” these unless you source-verify them from Xero/payment evidence first:

- **Tania Pocock / INV-1122**
  - `paid_on_date = 2026-04-08`
  - no matched payment row in current Supabase `order_payments`
- **Kelven Plamondon / INV-1133**
  - `paid_on_date = 2026-05-28`
  - status currently `finished`
  - no matched payment row in current Supabase `order_payments`

## Code root cause

File:

- `lib/production/order-intake.ts`

Bad patterns found during audit:

```ts
paid_on_date: existing.paid_on_date || nzDate()
```

```ts
paid_on_date: paid ? nzDate() : null
```

These stamp `paid_on_date` with the current NZ date when Tuesday sees a paid Xero invoice, instead of using actual payment evidence.

## Intended code change

Patch `lib/production/order-intake.ts` so:

1. Matched payment rows for an invoice are loaded from the payment evidence table/path already used by order intake.
2. A helper derives the settled paid date from sufficiently confident matched Akahu payment rows.
3. `upsertOrderForInvoice(...)` uses that derived payment date.
4. New and existing orders avoid stamping `paid_on_date` with `nzDate()`.
5. Existing valid `paid_on_date` should only be preserved if no stronger matched payment evidence exists.

Suggested helper shape:

```ts
function settledPaymentDate(payments: PaymentRow[]): string | null {
  const dates = payments
    .filter((payment) => payment.payment_date)
    .filter((payment) => {
      const source = String(payment.source ?? '').toLowerCase();
      const status = String(payment.match_status ?? '').toLowerCase();
      const confidence = Number(payment.match_confidence ?? 0);
      return source.includes('akahu') && status.includes('matched') && confidence >= 0.9;
    })
    .map((payment) => String(payment.payment_date))
    .sort();

  return dates[0] ?? null;
}
```

Adjust field names to the exact `PaymentRow` type in the current code. The important behaviour is: use matched payment evidence, not sync date.

## Regression test to add

File:

- `scripts/test-order-intake-api.mjs`

Add assertions that fail if either bad pattern returns:

```js
assert.doesNotMatch(
  lib,
  /paid_on_date:\s*existing\.paid_on_date \|\| nzDate\(\)/,
  'order intake must not stamp existing paid_on_date from nzDate()'
);

assert.doesNotMatch(
  lib,
  /paid_on_date:\s*paid \? nzDate\(\) : null/,
  'order intake must not stamp new paid_on_date from nzDate()'
);

assert.match(
  lib,
  /settledPaymentDate|paymentEvidence/i,
  'order intake should derive paid_on_date from matched payment evidence'
);
```

## Verification commands

Run from:

```bash
cd /Users/mack-mini/innate-mission-control
```

Required checks:

```bash
npm run test:order-intake
npx eslint lib/production/order-intake.ts scripts/test-order-intake-api.mjs
npm run check:mutations
READ_ONLY_MONDAY_SYNC=true npm run build
npm run smoke:tuesday
```

Expected:

- `npm run test:order-intake` passes.
- Targeted lint passes.
- `npm run check:mutations` reports no Monday mutations.
- Build passes with `READ_ONLY_MONDAY_SYNC=true`.
- Tuesday smoke passes for `/leads`, `/production`, `/production/plan`, and samples.

Known caveat:

- Full `npm run lint` currently fails on unrelated legacy CommonJS `require()` lint errors in old scripts such as `beehiiv_check.js` and older browser preview scripts. Do not confuse that with this order-intake fix.

## Supabase verification query goal

After code/data correction, latest current production-confirmed rows should rank:

1. **Raine Wapp** — `INV-1147`, `paid_on_date = 2026-06-02`, active, Table
2. **Camilla Penney** — `INV-1148`, `paid_on_date = 2026-06-02`, active, Table
3. **Kelven Plamondon** — `INV-1146`, `paid_on_date = 2026-05-27`, active, Timber supply
4. **Janette and Michael Sharp** — `INV-1143`, `paid_on_date = 2026-05-21`, active, Table

Taylor Vets should no longer appear as a current production-confirmed order:

- **Taylor Vets Ltd / INV-1144** should be `paid_on_date = 2026-05-21`, `status = complete`, `item_category = Supply`.

## Worktree / git caution

The active worktree during the investigation was messy:

- Branch observed: `codex/tuesday-production-plan-live-20260528`
- Many unrelated modified/untracked files were present.
- The touched files unexpectedly appeared as untracked:
  - `?? lib/production/order-intake.ts`
  - `?? scripts/test-order-intake-api.mjs`

Before implementing/committing later:

```bash
git worktree list
git status --short --branch
git ls-files lib/production/order-intake.ts scripts/test-order-intake-api.mjs
```

Recommended safe approach:

1. Create or use a clean `agent-task/tuesday-order-intake-paid-date-*` worktree/branch.
2. Port only the low-risk changes to:
   - `lib/production/order-intake.ts`
   - `scripts/test-order-intake-api.mjs`
3. Do not copy unrelated dirty working-tree changes.
4. Run the verification commands above.
5. Report clearly before any deploy/push/merge.

## Acceptance criteria

This work is done when:

- No path in order intake stamps `orders.paid_on_date` from `nzDate()` merely because an invoice is paid.
- Paid dates come from matched payment evidence where available.
- The regression test prevents reintroducing the old pattern.
- Supabase latest production-confirmed order check returns Raine + Camilla first.
- Taylor Vets is complete/cleared and does not appear as current production work.
- All required verification commands pass, except full lint may remain blocked by unrelated legacy files and should be reported separately.

## Safety boundaries

- No Vercel deploy without Guido approval.
- No Git push/merge without Guido approval.
- No live Supabase/Monday/Xero/customer-record mutations without explicit approval.
- Never include secrets from `.env.local` in logs, commits, reports, or chat.
