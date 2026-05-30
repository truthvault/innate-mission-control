# Tuesday source-of-truth readback harness

Created: 2026-05-30

Purpose: first practical read-only guardrail harness for checking a candidate Gmail/Xero/customer clue against Tuesday/Supabase-first source of truth. Monday is explicitly optional legacy/workshop mirror or unmigrated ops-island context only.

## Run

From the repo root:

```bash
python3 scripts/tuesday_source_readback_harness.py
```

This reads:

- fixture cases: `reference/tuesday/fixtures/source_readback_cases.json`
- local Xero cache: `/Users/mack-mini/.hermes/state/xero/xero_cash_snapshot.json`

It writes local-only reports under `output/`:

- `output/tuesday-source-readback-report-<timestamp>.json`
- `output/tuesday-source-readback-report-<timestamp>.md`

Unit check:

```bash
python3 scripts/test_tuesday_source_readback_harness.py
```

Optional live Supabase GET-only readback:

```bash
python3 scripts/tuesday_source_readback_harness.py --live-supabase
```

`--live-supabase` only attempts REST `GET` requests against `leads` and `orders` when Supabase env vars are present. It does not create, update, delete, or upsert records.

## Output shape

Each case includes:

- `status`: one of `reply_needed`, `already_handled`, `risky_sensitive`, `source_of_truth_unavailable`, `supplier_cost_evidence`, `precedent_only`, `ops_island_monday`, `no_action`
- `evidence.gmail`: fixture/local benchmark evidence only, with snippet-only warnings
- `evidence.xero`: local cache matches only, no Xero API calls
- `evidence.tuesday_supabase`: fixture, disabled, not configured, or live GET-only readback result
- `evidence.monday_optional`: optional legacy/mirror/unmigrated-island context
- `conflicts`
- `safe_next_action`
- `blocked_because`
- `confidence`

## Failure-mode rules built in

- Empty Gmail body or snippet-only evidence is partial evidence.
- Conflicting Xero quote status vs paid invoice blocks quote follow-up.
- Old quotes are precedent-only unless a current Quote Spine rebuild is done.
- Supplier bills are cost evidence only.
- Latest substantive sent reply supersedes older inbound unless newer customer inbound exists.
- Security/admin cases are not warm replies.
- Missing Tuesday/Supabase readback reduces confidence and stops writes/promises.
- Monday absence is not proof of non-existence, especially for unmigrated ops islands such as stocktake, vehicle records, electricity/power use, or workshop mirror records.

## Phase 2 draft quality gate

Phase 2 adds `scripts/tuesday_draft_quality_gate.py` on top of the Phase 1 readback report. It is still local/read-only. It does not draft in Gmail, create Xero quotes/invoices, update Tuesday/Supabase, update Monday, or touch Shopify/website state.

Run:

```bash
python3 scripts/tuesday_draft_quality_gate.py
```

Or consume an existing Phase 1 JSON report:

```bash
python3 scripts/tuesday_draft_quality_gate.py --readback-report output/tuesday-source-readback-report-<timestamp>.json
```

It writes:

- `output/tuesday-draft-quality-gate-report-<timestamp>.json`
- `output/tuesday-draft-quality-gate-report-<timestamp>.md`

Unit check:

```bash
python3 scripts/test_tuesday_draft_quality_gate.py
```

Each Phase 2 case returns:

- `draft_allowed`: whether a bounded local/internal draft brief may be prepared
- `draft_type`: `email_reply`, `quote_reply`, `xero_quote`, `xero_invoice`, `internal_note`, or `none`
- `decision`: concise gate status such as `blocked_needs_full_gmail`, `blocked_source_of_truth_missing`, `blocked_quote_control_missing`, `precedent_only`, `supplier_cost_evidence_only`, `already_handled`, or `ready_for_guido_review`
- `required_sources` and `missing_sources`
- `unsafe_claims_to_avoid`
- `customer_visible_promises_allowed`: currently always false
- `required_human_approval_before`: actions that remain blocked without explicit human approval
- `draft_brief`: source-bounded instructions for a future drafting agent

Phase 2 encodes these additional draft-safety rules:

- Supabase/Tuesday row is required before any lead/order state claim.
- Full Gmail body/thread is required; snippets and empty bodies fail closed.
- Quote/invoice work requires Xero readback, quote spine/calculator, margin check, and delivery destination where relevant.
- Xero quote status must be cross-checked against same-contact invoices/payments before follow-up.
- Supplier bills remain cost evidence only, not customer price authority.
- Old quotes remain precedent only, not current pricing authority.
- Latest substantive sent reply can supersede older inbound.
- Security/admin/payment/settings cases become blocked internal notes, not warm customer replies.
- Innate Xero quote/invoice output must use concise stacked spec blocks, clear GST/ex-GST handling, account code discipline, and explicit draft vs sent status.
- Customer-facing draft text must not use em dashes.

## Staged trust path

1. Phase 1 source readback harness: gather local/fixture plus optional GET-only source evidence and classify source conflicts. No drafting.
2. Phase 2 draft quality gate: decide whether a future draft is allowed, what type it may be, what sources are missing, and what claims/actions are unsafe. No live drafts.
3. Phase 3 supervised draft generator, future: generate local-only draft text from `draft_brief` after the Phase 2 gate allows it. Drafts must be labelled local and must preserve explicit unknowns.
4. Phase 4 readback + human approval + live draft creation, future: only after live source readback and exact approval may a system create a Gmail draft or Xero draft. Sending, approving, publishing, updating records, or invoicing remains separately approval-gated.
5. Phase 5 broader initiative discovery, future: once the gate has earned trust on email/quote/invoice drafting, extend the same readback/gate pattern to other operations initiatives.

## Current limits

- Gmail evidence is fixture/local benchmark only. The harness intentionally does not call Gmail or change Gmail read/archive/label/move/delete state.
- Xero evidence is local cache only by default. The harness does not call Xero and cannot prove latest Xero state beyond cache freshness.
- Supabase live mode is basic GET-only search and may miss rows if schema/search columns differ.
- Monday is fixture/label-only in this first harness. It does not call Monday APIs.
- Reports are local guardrail outputs, not a live action queue and not customer/team-visible.
- Phase 2 allows only local/internal draft briefs. It does not create live Gmail or Xero drafts.
