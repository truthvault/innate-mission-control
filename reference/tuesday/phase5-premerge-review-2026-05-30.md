# Phase 5 pre-merge review - Tuesday readback harness

Verdict: ready with cautions

Reviewed branch: `agent-task/tuesday-readback-harness-20260530`
Base: `main`
Review date: 2026-05-30

## Commits reviewed

Branch commits relative to `main`:

- `df06f6d` Stabilize production plan tab
- `e8cd939` Restore done-task delight in order details
- `6353f6d` Add Tuesday readback and draft quality gates
- `c213a9a` Add supervised local draft generator
- `7bee049` Add live readback preflight bridge
- `4e9a271` Document read-only adapter recon
- `ce49d9b` Wire Supabase read-only preflight adapter
- `c932a6a` Wire Gmail read-only preflight adapter
- `83319d6` Wire Xero read-only preflight adapter
- `ed88853` Add quote spine preflight evidence adapter

`git log --oneline --decorate -12` at review time:

```text
ed88853 (HEAD -> agent-task/tuesday-readback-harness-20260530) Add quote spine preflight evidence adapter
83319d6 Wire Xero read-only preflight adapter
c932a6a Wire Gmail read-only preflight adapter
ce49d9b Wire Supabase read-only preflight adapter
4e9a271 Document read-only adapter recon
7bee049 Add live readback preflight bridge
c213a9a Add supervised local draft generator
6353f6d Add Tuesday readback and draft quality gates
e8cd939 (codex/tuesday-production-plan-live-20260528, agent/nick-tuesday-order-view-feedback-20260528, agent/dining-load-scan-20260529, agent/benchtop-freight-placeholder-audit) Restore done-task delight in order details
df06f6d Stabilize production plan tab
d403db8 (main, agent/innate-worldclass-website-20260523, agent-task/gmail-supabase-watchdog-20260526) Update production QC and freight owners
288294e merge: cash-first leads strip
```

## Scope split

Tuesday readback/preflight harness changes:

- New fixture/readback data and docs under `reference/tuesday/`.
- New Python harness/gate/generator/preflight scripts:
  - `scripts/tuesday_source_readback_harness.py`
  - `scripts/tuesday_draft_quality_gate.py`
  - `scripts/tuesday_supervised_draft_generator.py`
  - `scripts/tuesday_live_readback_preflight.py`
  - `scripts/tuesday_gmail_readonly_adapter.py`
  - `scripts/tuesday_supabase_readonly_adapter.py`
  - `scripts/tuesday_xero_readonly_adapter.py`
  - `scripts/tuesday_quote_spine_readonly_adapter.py`
- New Python tests for those scripts.

Production Plan/UI changes already present on the branch:

- Large changes in `app/production/plan/PlanClient.tsx` and related production API/store files.
- Login route/page changes.
- Production handoff/invoice expectation helpers and tests.
- Package changes for UI/runtime dependencies.

Unrelated or higher-risk merge surface:

- The branch diff is not just the Tuesday readback harness. It includes a substantial Production Plan/UI changeset. That is the main merge-risk caution.
- Total branch diff: 38 files, 8,936 insertions, 613 deletions.

## Checks and results

Required checks:

| Check | Result | Notes |
|---|---:|---|
| `git status --short` | pass | Only `?? output/` and `?? prompts/` untracked. Expected local artifacts. Not deleted or committed. |
| `git log --oneline --decorate -12` | pass | Output captured above. |
| `git diff --stat main...HEAD` | pass | 38 files changed, 8,936 insertions, 613 deletions. |
| `npm run check:mutations` | pass | `OK: no Monday mutation operations found in app/ or lib/.` |
| `python3 scripts/test_tuesday_source_readback_harness.py` | pass | `ok: tuesday_source_readback_harness unit checks passed` |
| `python3 scripts/test_tuesday_draft_quality_gate.py` | pass | `ok: tuesday_draft_quality_gate unit checks passed` |
| `python3 scripts/test_tuesday_supervised_draft_generator.py` | pass | `ok: tuesday_supervised_draft_generator unit checks passed` |
| `python3 scripts/test_tuesday_live_readback_preflight.py` | pass | `ok: tuesday_live_readback_preflight unit checks passed` |
| `python3 scripts/tuesday_live_readback_preflight.py --case-id PH2-4-xero-quote-local-brief-ready` | pass | Wrote local reports under `output/`; `safe_to_generate_local_review_draft: true`; no live draft creation. |
| `git diff --check` | pass | No whitespace errors reported. |

Additional bounded project checks:

| Check | Result | Notes |
|---|---:|---|
| `npm ci` | pass | Installed local dependencies to run lint/build. Reported 1 moderate audit finding; not changed. |
| `npm run lint` | pass with warnings | 0 errors, 2 warnings in `app/production/plan/PlanClient.tsx` for unused `_weekId` and `_tasks`. |
| `npm run build` | pass after required env | First run failed because `READ_ONLY_MONDAY_SYNC` was unset. Rerun with `READ_ONLY_MONDAY_SYNC=true npm run build` passed. Build logged missing Monday/Blob env fallbacks during static generation but completed. |
| `npm run test:planning` | pass | Planning/drag/Nick feedback tests passed. Node warned about typeless package/module parsing. |
| `npm run test:workshop-handoff` | pass | Handoff health and invoice expectation tests passed. Node warned about typeless package/module parsing. |
| `npm run smoke:tuesday` | not passing in this local auth context | Without dev server: connection refused. With `READ_ONLY_MONDAY_SYNC=true npm run dev`: failed on `/leads` with HTTP 307, likely auth redirect. This is a smoke harness/environment limitation, not evidence of a readback harness failure. |

Current `git status --short` before writing this report remained:

```text
?? output/
?? prompts/
```

So, at the time of the required untracked-file check, `output/` and `prompts/` were the only untracked items. After writing this Phase 5 report, this report file is also untracked until staged/committed.

## Safety review notes

Safety boundaries reviewed against the new readback/preflight scripts and tests.

1. Gmail

- No Gmail send/reply/modify/draft-send path was found in the adapter.
- Live calls use Gmail read methods only: `messages().get`, `messages().list`, and `threads().get`.
- The adapter requests the Gmail readonly scope: `https://www.googleapis.com/auth/gmail.readonly`.
- Narrow-input guard exists: thread id, message id, or email + subject. Without that, live read is skipped and blocked.
- Reports summarize latest inbound/sent with bounded previews, not full thread dumps. Caution: live report JSON can include short body previews and sender/header summary fields, so output files still need to be treated as internal/customer-sensitive artifacts.

2. Supabase/Tuesday

- No Supabase POST/PATCH/PUT/DELETE/upsert/insert/update/rpc helper was found in the new adapter.
- HTTP helper constructs `urllib.request.Request` without a body and explicitly refuses non-GET.
- Table reads are bounded to `MAX_ROWS_PER_QUERY = 5` and selected columns are explicit.
- Narrow-input guard exists: lead/order id, email, Monday item id, order code, invoice number, or quote number. Without that, live read is skipped and blocked.
- Secrets are used only in request headers and are not printed in reports. `configured_hint_present` is boolean only.

3. Xero

- Accounting/business-data calls are GET-only via an allowlist: `/Invoices`, `/Contacts`, `/Quotes`.
- Non-allowlisted accounting paths are refused.
- Token auth POST, if client credentials are used, is isolated to `https://identity.xero.com/connect/token` and does not receive accounting paths or payloads.
- Reports summarize contact/quote/invoice/payment evidence and do not print raw tokens or headers.
- Caution: current client-credentials scope string is `accounting.invoices accounting.contacts accounting.settings accounting.reports.read`. Xero's read-specific scopes include `.read` variants such as `accounting.invoices.read` / `accounting.contacts.read`; before enabling live Xero client-credentials reads, tighten/confirm the scopes with the actual app's Xero requirements. The adapter's data operations are still GET-only.
- Caution: `contact_name` counts as a live Xero narrow input. It is bounded, but less precise than quote/invoice/contact IDs or email/reference. Prefer IDs/refs/email for live runs.

4. Quote spine

- Quote spine adapter is local/read-only. It reads explicit fixture/case fields and local paths only.
- No network calls or create/update helpers are exposed.
- Local file reads are bounded by size and return summarized evidence only.
- It blocks missing calculator/spine, missing margin check, and missing delivery destination where delivery/freight is required.
- Quantity-dependent pricing caveat is present when line or case data indicates batch/quantity dependency.

5. Defaults and live draft behavior

- Default preflight mode remains fixture-only. Live flags default false.
- `safe_to_create_live_gmail_draft` is hardcoded false.
- `safe_to_create_xero_draft` is hardcoded false.
- Approval pack wording explicitly excludes sends, publishing, Xero authorisation, Supabase/Tuesday changes, Monday changes, Shopify/website changes, and payment/admin action.
- The local command run for `PH2-4-xero-quote-local-brief-ready` produced local-only output and did not create live records or drafts.

## Merge plan recommendation

Recommendation: do not merge this whole branch blindly as a single "readback harness" change.

Preferred path:

1. Merge or cherry-pick the Tuesday readback/preflight harness commits as a focused change:
   - `6353f6d`
   - `c213a9a`
   - `7bee049`
   - `4e9a271`
   - `ce49d9b`
   - `c932a6a`
   - `83319d6`
   - `ed88853`
2. Keep `output/` and `prompts/` untracked and out of the merge.
3. Either:
   - separately review/merge the Production Plan/UI commits (`df06f6d`, `e8cd939`) as their own UI branch, or
   - merge the full branch only if Guido intentionally wants the Production Plan/UI changes included in the same release.
4. Before enabling live Xero client-credential reads, confirm/tighten the Xero OAuth scopes to read-specific scopes where possible.
5. If merging the full branch, accept the known cautions: Production Plan/UI surface area, lint warnings, local auth-gated smoke failure, and build requiring `READ_ONLY_MONDAY_SYNC=true`.

My merge-readiness view:

- Readback/preflight harness: ready with cautions.
- Full branch including Production Plan/UI: ready only if those UI changes are already accepted for this merge; otherwise split/cherry-pick.

## Exact approval ask for Guido

Recommended approval wording:

"Approve cherry-picking/merging only the Tuesday readback/preflight harness commits (`6353f6d` through `ed88853`) into `main`, excluding untracked `output/` and `prompts/`, and leaving the Production Plan/UI commits for separate review. No deploy or live draft/read enablement approved."

Alternative, if Guido wants the whole branch:

"Approve merging the full `agent-task/tuesday-readback-harness-20260530` branch into `main`, including the Production Plan/UI changes, with no deploy and no live draft/read enablement."
