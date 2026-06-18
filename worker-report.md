# Tuesday Costings Accuracy + Orders Integration Report

Status: changed / source-verified / not deployed

## Data changed in Supabase

Yes. Supabase Costings was updated after a JSON backup was written.

Backup/export files in this worktree:

- `reports/costings-source-verification-2026-06-18/backup-before-source-verification.json`
- `reports/costings-source-verification-2026-06-18/backup-after-source-verification.json`
- `reports/costings-source-verification-2026-06-18/drive-sheets-live.json`
- `reports/costings-source-verification-2026-06-18/xero-known-invoice-lines.json`
- `reports/costings-source-verification-2026-06-18/verification-evidence.json`

Before counts:

- `costing_suppliers`: 4
- `costing_materials`: 51
- `costing_source_links`: 5
- `costing_price_observations`: 51
- `costing_current_prices`: 0
- `product_costing_sheets`: 4
- `product_costing_versions`: 4
- `product_costing_lines`: 59
- `costing_audit_events`: 0 at first backup, then 169 before the Xero-specific confidence correction

After counts:

- `costing_suppliers`: 4
- `costing_materials`: 51
- `costing_source_links`: 5
- `costing_price_observations`: 51
- `costing_current_prices`: 0
- `product_costing_sheets`: 4
- `product_costing_versions`: 4
- `product_costing_lines`: 59
- `costing_audit_events`: 193

No hard deletes were performed.

## Active verified Costings records now shown

- 51 material/price observations are active and `fresh` after exact source-sheet re-check.
- 59 product costing lines are `fresh` after exact source-sheet re-check.
- 4 product costing sheets are active after their source totals matched live Drive sheets:
  - Element 17 / Harrows product costing batch
  - Quintin / Te Rūnanga boardroom table - simple costing
  - Quintin boardroom table - pebble top with barrel bases
  - Jo Walsh - Timber Vision 2200 costing

12 observations and 12 product costing lines also have Xero line-level confirmation from read-only Xero supplier bills.

## Current-price approval state

`costing_current_prices` is still empty.

Reason: the values are now source-reverified observations, but they have not been promoted to canonical approved current prices. This keeps quote approval separate from source verification.

## Unverified records removed from active views

None were removed because every existing imported row matched a live source sheet exactly in this pass.

What did change:

- source links were updated with current sheet hash/row-count metadata
- observations moved from `needs_review` to `fresh`
- product lines moved from `needs_review` to `fresh`
- product sheets moved from `needs_review` to `active`
- blockers were cleared where source verification succeeded
- units were corrected where the source made the unit clear, for example timber `lm`, laminating `m3`, labour `hour`, and quote-batch lines `quote line`
- Xero-confirmed rows were upgraded to high confidence

## Proof sources checked

Google Drive read-only:

- Product Costing Sheet - Element 17 - cleaned source-control copy 2026-06-11 2204, sheet `11Gtdqog3w9NkLZT-XlPPEatzF_OR15_4m3mDr0RD3Fg`, hash `b176678356582861fc3f6270e6db5f8c2f1507b5da18a98d5308e4b9e459070b`
- Quintin Te Rūnanga boardroom table - simple costing, sheet `1jNKiXhaojVJVvd2nGZBjUq2sxdLFgGgE8w9swltW8tc`, hash `d86e276d44921d19dc9794fd10cbcfb8c81d12b4e8cb3aaf400fd6fa791cff90`
- Innate Table Quote Calculator - Quintin v1, sheet `1RJM1HKi6QCRePtCEpNRbTrrRFAjYOIKGaN4jGMLYuYk`, hash `82d505ac29e3714ae84a5bb02576bb0107841fe33143d140971a8f971a13e508`
- Jo Walsh - Timber Vision 2200 costing - 2026-05-07, sheet `1uZBoLwz07DXnUAJwH8l83ExzG4-Dce7xkn74HK6Tqzc`, hash `e7063658a8692f844f877064e8ec5916aa58c1f0e961b752acc9a6b446b8a27f`
- Westimber Price Calculator, sheet `1YgMmuf9WRuZ9MluoIJI8Tw_3A7CGf7a4NWlBhD00fFc`, hash `e0f9e450cbbe31be412b6e3bd83936a58d55d9bed0beabbb76ed302760f425de`

Xero read-only:

- Precision Woodworks supplier bill: `Inv 00030367 #PO-0951 Mike Greer`, contact `Pieter A De Vries & Son Ltd (Precision Woodworks)`, 4 lines verified.
- Jackson Electrical supplier bill: `Inv 199139 #PO-0958 United Steel`, contact `Jackson Electrical Industries Ltd.`, 2 lines verified.
- Jackson Electrical supplier bill: `Inv 198822 #PO-0958 United Steel`, contact `Jackson Electrical Industries Ltd.`, 2 lines verified.

Gmail read-only:

- Gmail search access was confirmed and relevant result sets were available, but no Gmail-sourced price rows were written in this pass. Active Costings data now rests on Drive exact-row verification and Xero line verification where applicable.

## Orders tab integration changed

Yes, code changed in the isolated worktree.

- `app/production/page.tsx` fetches order costing context alongside Orders.
- `lib/costings/fetch-order-costing-context.ts` reads active source-verified product costings, not just approved current prices.
- `app/production/plan/PlanClient.tsx` surfaces costing readiness in the Orders health strip, rail cards, selected-order detail, and full order overlay.
- Matching remains strict: exact product code, or a unique customer/project source-label match. No guessed matches.
- If a costing is source-verified but not approved for quote use, Orders labels it as `Verified costing needs approval`.
- If no exact/unique relation exists, Orders labels it as `Needs costing match`.

## Code/files changed in worktree

- `app/production/page.tsx`
- `app/production/plan/PlanClient.tsx`
- `lib/costings/fetch-order-costing-context.ts`
- `scripts/audit-costings-accuracy.py`
- `scripts/apply-costings-source-verification.py`
- `reference/tuesday/costings.md`
- `worker-report.md`

## Checks run

Passed:

- `git diff --check`
- `/Users/mack-mini/.local/bin/hermes-python -m py_compile scripts/audit-costings-accuracy.py`
- `/Users/mack-mini/.local/bin/hermes-python -m py_compile scripts/apply-costings-source-verification.py`
- Supabase readback after write:
  - material status: 51 `fresh`
  - material confidence: 12 `high`, 39 `medium`
  - current approved prices: 0
  - product lines: 59 `fresh`
  - product line confidence: 12 `high`, 47 `medium`
  - product versions: 4 with source hashes, all `needs_review` / `unapproved`
  - audit events: 193

Blocked in isolated worktree:

- `npm run lint`: dependencies absent in isolated worktree
- `npm run build`: dependencies absent in isolated worktree
- full Next/React typecheck from isolated worktree: module resolution blocked by missing local dependencies

## No-go / side effects confirmation

- No emails sent.
- No Gmail/Drive/Xero writes.
- No deploy.
- No push.
- No hard deletes.
- No credentials, tokens, cookies, auth headers, or env values printed.

## Remaining questions for Guido

1. For approved current prices, should I promote any source-reverified observations into `costing_current_prices`, or keep approval as a Nick/Guido review step?
2. For Orders-to-Costings, should the canonical relation be explicit Supabase links, product codes, or Xero invoice/reference matching? My recommendation is explicit Supabase links so Orders do not rely on fuzzy names.
