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

## Phase 3 supervised local draft generator

Phase 3 adds `scripts/tuesday_supervised_draft_generator.py` on top of the Phase 1 readback harness and Phase 2 gate. It is still local/read-only. It does not create Gmail drafts, send emails, create or update Xero quotes/invoices, update Tuesday/Supabase, update Monday, or touch Shopify/website state.

Run:

```bash
python3 scripts/tuesday_supervised_draft_generator.py
```

Or consume an existing Phase 2 JSON report:

```bash
python3 scripts/tuesday_supervised_draft_generator.py --gate-report output/tuesday-draft-quality-gate-report-<timestamp>.json
```

It writes:

- `output/tuesday-supervised-draft-generator-report-<timestamp>.json`
- `output/tuesday-supervised-draft-generator-report-<timestamp>.md`

Unit check:

```bash
python3 scripts/test_tuesday_supervised_draft_generator.py
```

Every generated package is labelled `LOCAL REVIEW DRAFT ONLY - NOT SENT - NOT CREATED IN GMAIL/XERO`.

Phase 3 behavior:

- If Phase 2 says `draft_allowed: false`, the generator emits a blocker package only: `blocked`, `reason`, `missing_sources`, `unsafe_claims_to_avoid`, and `next_safe_step`.
- Allowed email replies become short local review packages with subject/context, latest ask summary, facts allowed, unknowns/do-not-invent list, conservative draft skeleton, and approval required before Gmail draft/send/system update.
- Allowed quote replies remain quote-control-bound skeletons. Price is not inserted unless the current quote spine fixture provides it.
- Allowed Xero quote/invoice cases become local payload previews only: contact/source summary, title/reference/summary rules, stacked line item spec blocks, GST/ex-GST mode if provided, terms skeleton, and approval required before Xero DRAFT creation.
- Deterministic lint fails on customer-facing em dashes, missing local-review labels, and unguarded live-action claims such as sent/created/updated language.
- Quote/invoice line descriptions use stacked spec-block style and keep account code/tax/internal review material out of customer-facing line text.

## Phase 4A live readback preflight collector

Phase 4A adds `scripts/tuesday_live_readback_preflight.py` as a bridge between the local generator and any future live Gmail/Xero draft creation. It prepares an evidence/approval pack. It does not create Gmail drafts, send emails, create Xero DRAFTs, update Tuesday/Supabase, update Monday, or touch Shopify/website state.

Default fixture-only run for one case:

```bash
python3 scripts/tuesday_live_readback_preflight.py --case-id PH2-1-lead-email-reply-candidate
```

Optional future live-readonly request flags fail closed unless safe adapters/config are wired:

```bash
python3 scripts/tuesday_live_readback_preflight.py --case-id SOME-ID --live-gmail-readonly --live-supabase-readonly --live-xero-readonly
```

It writes:

- `output/tuesday-live-readback-preflight-<case-id>-<timestamp>.json`
- `output/tuesday-live-readback-preflight-<case-id>-<timestamp>.md`

Unit check:

```bash
python3 scripts/test_tuesday_live_readback_preflight.py
```

Each Phase 4A preflight pack includes:

- `mode`: `fixture_only` or `live_readonly_requested`
- `case_id` and `target_summary`
- `readback_required`: Gmail full thread/latest inbound/latest sent, Supabase/Tuesday row, Xero quote/invoice/contact/payment state, and quote spine/margin/delivery destination where applicable
- `readback_collected`: source-by-source status with `live_called: false` unless a future GET-only adapter actually runs
- `missing_or_stale_sources`
- `safe_to_generate_local_review_draft`
- `safe_to_create_live_gmail_draft: false`
- `safe_to_create_xero_draft: false`
- `approval_pack`: exact later approval phrases scoped to draft-only, unsent, no system updates
- `blocked_because`
- `handoff_to_phase3`

Phase 4A makes four boundaries explicit:

1. readback happened or did not happen,
2. local review draft generation is allowed or blocked,
3. live Gmail/Xero draft creation still needs exact approval,
4. sending, approving, publishing, payment/admin work, and system updates remain separate higher-risk approvals.

## Staged trust path

1. Phase 1 source readback harness: gather local/fixture plus optional GET-only source evidence and classify source conflicts. No drafting.
2. Phase 2 draft quality gate: decide whether a future draft is allowed, what type it may be, what sources are missing, and what claims/actions are unsafe. No live drafts.
3. Phase 3 supervised draft generator: generate local-only review material from `draft_brief` after the Phase 2 gate allows it. Drafts are labelled local and preserve explicit unknowns.
4. Phase 4A live readback preflight collector: produce a readback/approval pack and fail closed when live evidence is unavailable. No live drafts.
5. Phase 4 exact live readbacks + human approval + Gmail/Xero draft creation, future: only after live Gmail/Xero/Tues/Supabase readback and exact approval may a system create a Gmail draft or Xero DRAFT. Still unsent. Sending, approving, publishing, updating records, or invoicing remains separately approval-gated.
6. Phase 5 daily ops queue / initiative discovery, future: once trust is proven on email/quote/invoice drafting, extend the same readback/gate/generator pattern to a daily ops queue and broader initiative discovery.

## Current limits

- Gmail evidence is fixture/local benchmark only. The harness intentionally does not call Gmail or change Gmail read/archive/label/move/delete state.
- Xero evidence is local cache only by default. The harness does not call Xero and cannot prove latest Xero state beyond cache freshness.
- Supabase live mode is basic GET-only search and may miss rows if schema/search columns differ.
- Monday is fixture/label-only in this first harness. It does not call Monday APIs.
- Reports are local guardrail outputs, not a live action queue and not customer/team-visible.
- Phase 2 allows only local/internal draft briefs. It does not create live Gmail or Xero drafts.
- Phase 3 emits local review packages only. It cannot prove live Gmail/Xero freshness unless Phase 4A preflight and future Phase 4 live readbacks are added and approved.
- Phase 4A optional live-readonly flags currently fail closed with missing-source blockers unless explicit GET-only adapters/config are added later.
