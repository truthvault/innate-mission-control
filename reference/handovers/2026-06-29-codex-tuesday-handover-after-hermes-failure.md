# Codex handover — Tuesday Production Plan / order visibility recovery after Hermes failure

Date: 2026-06-29
Prepared by: Hermes Tuesday profile, after Guido explicitly stopped the work
Audience: Codex / local coding agent

## Why this is being handed to Codex

Guido stopped Hermes after Hermes began working on the wrong surface and repeatedly gave unreliable status/proof around Tuesday UI/data work. The immediate reason for this handover is not a normal feature transition; it is a trust failure.

Codex should assume:

- Guido no longer trusts Hermes for this class of Tuesday task.
- Hermes has mixed up surfaces before, especially Production Plan / Orders vs Process templates.
- Hermes has previously treated insufficient checks as proof and then reported misleading readiness.
- Hermes has made customer/order-specific claims without adequate source-lock proof.
- The next agent must be stricter than Hermes: source-lock first, inspect exact worktree/live state, make small changes only, verify actual desktop/mobile surfaces, and do not trust prior chat summaries as truth.

Do not resume a Hermes plan blindly. Reconstruct from repo/worktree state and the evidence paths below.

## User stop instruction

Guido's latest instruction was effectively:

> Stop everything. Write a detailed handover doc for Codex. Include findings from last night's audit runs, current live state, the semi-completed worktree, and say I am handing it to Codex because Hermes cannot be trusted for tasks like these.

No further implementation should be done by Hermes in this thread.

## Current live state checked for this handover

Read-only live guard command run from `/Users/mack-mini/innate-mission-control`:

```bash
python3 /Users/mack-mini/.hermes/profiles/tuesday/scripts/tuesday_vercel_live_guard.py
```

Result at handover time:

```json
{
  "alias": "https://innate-mission-control.vercel.app",
  "branch": "integration/tuesday-process-live-baseline-20260626",
  "deploymentUrl": "https://innate-mission-control-m4c0yyhbl-gjloeffler-9108s-projects.vercel.app",
  "githubCommitMessage": "fix(tuesday): stabilize production plan view switch",
  "githubCommitSha": "59a15682df8f216f1cad64e511a52450929b3286",
  "state": "READY"
}
```

Important: this supersedes older state notes that still say live was at `37f617d1...`. The current live alias appears to be commit `59a1568` on `integration/tuesday-process-live-baseline-20260626`.

Current live URL:

- `https://innate-mission-control.vercel.app/production/plan`

No deploy/push/live mutation was done while writing this handover.

## Repository and worktree state checked

Canonical repo:

- Path: `/Users/mack-mini/innate-mission-control`
- Branch: `codex/tuesday-production-plan-live-20260528`
- Commit: `0ef3f5d` (`docs(tuesday): capture stocktake decisions`)
- Status: dirty, ahead of origin, many untracked files.
- Do **not** treat the canonical working tree as a clean Tuesday baseline.

Read-only git status showed these notable tracked modifications in canonical root:

- `AGENTS.md`
- `app/freight-quotes/page.tsx`
- several `docs/current/*` website/Tues docs
- `lib/freight/*`
- `package.json`
- `proxy.ts`
- `reference/INDEX.md`
- `reference/tuesday/README.md`
- `scripts/verify-tuesday-review-link.mjs`

Many untracked files exist, including Tuesday docs/scripts and unrelated website/freight/SEO/configurator work. Do not clean/delete without explicit Guido approval.

Active Tuesday-related worktrees observed:

```text
/Users/mack-mini/.hermes/agent-tasks/tuesday-live-baseline-merge-20260626/worktree
  branch integration/tuesday-process-live-baseline-20260626
  status: behind origin by 1, no dirty files shown in quick status
  commit c175609 in local worktree, live guard says live is 59a1568

/Users/mack-mini/.hermes/agent-tasks/tuesday-order-visibility-layer-20260629/worktree
  branch agent-task/tuesday-order-visibility-layer-20260629
  status: dirty
  modified: app/production/plan/PlanClient.tsx
  commit base/head: 59a1568 fix(tuesday): stabilize production plan view switch

/Users/mack-mini/.hermes/agent-tasks/tuesday-orders-live-precision-20260628/worktree
  branch agent-task/tuesday-orders-live-precision-20260628-publish
  status: dirty
  modified: app/production/plan/PlanClient.tsx, package.json
  untracked: scripts/audit-tuesday-orders-board-theme.mjs, tmp-compact-edit-proof.mjs
  commit base/head: 59a1568 fix(tuesday): stabilize production plan view switch
```

## Semi-completed worktree Hermes was drifting into

The most likely semi-completed worktree for the current attempted local changes is:

```text
/Users/mack-mini/.hermes/agent-tasks/tuesday-order-visibility-layer-20260629/worktree
```

Status:

```text
M app/production/plan/PlanClient.tsx
```

Diff size:

```text
app/production/plan/PlanClient.tsx | 163 +++++++++++++++++++++++++++++++++++--
1 file changed, 156 insertions(+), 7 deletions(-)
```

What this dirty diff appears to do:

- Adds derived order classifiers inside `PlanClient.tsx`:
  - `paymentStageForOrder`
  - `dateConfidenceForOrder`
  - `productionVisibilityForOrder`
  - `groupOrdersByVisibility`
- Changes order trust signals to use `productionVisibilityForOrder` for non-workshop-active rows.
- Expands order search text to include invoice/payment/next-action/notes fields.
- Changes order filters:
  - `blocked` now includes visibility states such as `blocked_external`, `waiting_material`, `needs_guido_review`.
  - `materials` is based on `visibility.key === "waiting_material"` instead of raw Monday status.
- Groups the order rail by visibility groups such as:
  - Ready / scheduled workshop
  - Blocked / material wait
  - Payment/admin wait — not workshop
  - Dispatch / collection / freight
  - Sample/admin/supporting rows
  - Paused
  - Needs Guido review
- Adds visibility/payment/date-confidence pills to order rail items and journey rows.

Why Codex should be careful:

- This is not the user's latest requested implementation; it is a semi-complete Hermes direction.
- It is heuristic-heavy and may misclassify real orders unless source-checked row-by-row.
- It mixes product logic, visual labels, payment semantics, and date confidence in one large component.
- It has not been verified in this handover turn with lint/build/browser checks.
- It should be reviewed as a candidate idea, not ported/deployed as-is.

## Other dirty precision worktree to inspect, but probably not use directly

Path:

```text
/Users/mack-mini/.hermes/agent-tasks/tuesday-orders-live-precision-20260628/worktree
```

Status:

```text
M app/production/plan/PlanClient.tsx
M package.json
?? scripts/audit-tuesday-orders-board-theme.mjs
?? tmp-compact-edit-proof.mjs
```

Diff size:

```text
app/production/plan/PlanClient.tsx | 289 ++++++++++++++++++++-----------------
package.json                       |   1 +
2 files changed, 156 insertions(+), 134 deletions(-)
```

Observed direction:

- Many rounded-pill controls changed to 40px-ish rectangular tap targets.
- Info buttons expanded from 16px circles to 40px controls.
- Intake/task rows get larger hit areas.
- Some labels/metadata around task cards are changed/hidden.
- Adds package script likely for `audit:tuesday-orders-board-theme`.

Warning:

- This looks like a mixed UI/tap-target pass, not the precise current request.
- It may be useful as reference for mobile target sizing, but should not be merged wholesale.
- It has untracked proof/audit scripts and no verified clean state in this handover.

## Current reference/state files that Codex should read before touching Tuesday

Required:

1. `/Users/mack-mini/innate-mission-control/AGENTS.md`
2. `/Users/mack-mini/innate-mission-control/reference/INDEX.md`
3. `/Users/mack-mini/innate-mission-control/reference/august-america-mode-operating-plan-2026.md`
4. `/Users/mack-mini/innate-mission-control/reference/tuesday/README.md`
5. `/Users/mack-mini/.hermes/profiles/tuesday/reference/current-tuesday-state.md`
6. `/Users/mack-mini/.hermes/profiles/tuesday/reference/tuesday-efficiency-policy.md`
7. `/Users/mack-mini/.hermes/profiles/tuesday/skills/devops/tuesday-reliability-control-loop/SKILL.md`
8. `/Users/mack-mini/innate-mission-control/reference/tuesday/page-contracts.md`
9. `/Users/mack-mini/innate-mission-control/docs/current/tuesday-agent-design-standard.md`
10. `/Users/mack-mini/innate-mission-control/docs/current/tuesday-visual-audit-protocol.md`

Note: `current-tuesday-state.md` is partly stale about the live commit. Trust live guard output over stale notes.

## Findings from last night's order/audit work

The relevant audit evidence folder is:

```text
/Users/mack-mini/.hermes/profiles/tuesday/reports/live-order-crossref-2026-06-28/
```

Main handover:

```text
/Users/mack-mini/.hermes/profiles/tuesday/reports/live-order-crossref-2026-06-28/NICK-LIVE-ORDERS-HANDOVER-CURRENT.md
```

Main strict register:

```text
/Users/mack-mini/.hermes/profiles/tuesday/reports/live-order-crossref-2026-06-28/all-tuesday-orders-audit-register-2026-06-28.md
```

Register summary:

- Live Supabase readback file: `current-supabase-orders-live-readback-2026-06-28-post-kidd.json`
- Count: 46 non-archived orders.
- Strict audit-state counts:
  - `packet_done`: 19
  - `historical_complete_backfill__needs_spot_audit_if_every_order_means_all_archival_rows`: 9
  - `closed_or_cancelled__needs_packet_if_not_already_evidenced`: 9
  - `source_locked_readback_done__needs_full_packet_if_strict_same_audit`: 9

### Six key audit/readback findings to carry forward

1. **All-orders strict audit register completed**
   - File: `all-tuesday-orders-audit-register-2026-06-28.md`
   - No rows remained in `needs_full_accuracy_packet` according to the handover.
   - This does not mean every archival row has a full packet; it means the active/priority audit pass was completed to the strict register's categories.

2. **Michael Cooke / `INV-1123` closed out**
   - Packet: `order-packets/michael-cooke-inv-1123-accuracy-packet.md`
   - Readback: `order-packets/cooke-kelven-closeout-apply-readback.json`
   - Current truth: complete/collected; no Production Plan row should be created; no further production/customer action unless issue reported.

3. **Kelven Plamondon / `INV-1133` closed out**
   - Packet: `order-packets/kelven-plamondon-inv-1133-accuracy-packet.md`
   - Readback: `order-packets/cooke-kelven-closeout-apply-readback.json`
   - Current truth: complete/collected; no Production Plan row should be created for `INV-1133`.

4. **Talia & Jack delivery-only `INV-1163` and Kelven replacement panel `INV-1158` cleared from pending intake**
   - Proof: `order-packets/complete-intake-review-clearance-readback.json`
   - Live route/API proof: `order-packets/all-orders-live-route-proof-after-approval.json`
   - `/api/production/order-intake` returned 22 items after approval.
   - Michael Cooke `INV-1123`, Kelven `INV-1133`, and Michael Kidd `INV-1052` were absent from intake.
   - No `complete` orders remained in `paid_needs_review`.

5. **Myriam / `INV-1160` remains active and pending review, after accidental approval was reverted**
   - Fresh audit: `order-packets/myriam-inv-1160-fresh-audit-scan.json`
   - Apply/readback: `order-packets/myriam-inv-1160-apply-readback.json`
   - Revert readback: `order-packets/myriam-inv-1160-revert-to-pending-readback.json`
   - Current readback in handover: order remains real paid `active` / `cash`, owner `Nick`.
   - Intake review is back to `paid_needs_review`; `approved_at`/`approved_by` cleared.
   - All 16 generated `production_order_tasks` are marked `deleted` so they do not appear as approved schedule tasks.
   - Draft tasks are preserved for Nick editing.
   - This row is high-risk: do not generate/replace Myriam tasks without checking the exact packet and live row.

6. **Awaiting-payment orders should not become Nick Production Plan rows yet**
   - Adams Building & Construction Ltd / `INV-1166`: packet complete; keep `awaiting_payment`; no Monday row / no Production Plan row until payment clears.
   - Element 17 Ltd / `INV-1168`: packet complete; keep `awaiting_payment`; no Monday row / no Production Plan row until payment clears.
   - Dave Tidey / `INV-1170`: packet complete; keep `awaiting_payment`; no Monday row / no Production Plan row until payment clears.
   - Packets:
     - `order-packets/adams-building-inv-1166-accuracy-packet.md`
     - `order-packets/element-17-inv-1168-accuracy-packet.md`
     - `order-packets/dave-tidey-inv-1170-accuracy-packet.md`

Additional important findings:

- Michael Kidd / `INV-1052`: paused, no due date, no Production Plan row, do not production-plan until reactivated. Packet: `order-packets/michael-kidd-inv-1052-accuracy-packet.md`; approval/readback: `order-packets/michael-kidd-inv-1052-approval-readback.json`.
- Amanda Lawrey samples: likely collected by Kiwi Express; treat as parked/not Nick production unless courier tracking/readback is explicitly needed.
- Sophie Taylor / `INV-1161`: complete/not Nick production; active lead remains the benchtop follow-up cockpit item. Proof: `order-packets/sophie-taylor-inv-1161-apply-readback.json` and `order-packets/sophie-taylor-inv-1161-live-route-proof.json`.
- Hayden & Paula remedial cleanup: main remedial remains active/high/Nick; duplicate sample row complete/Innate.

## Leads audit context also found from 2026-06-28

Separate file:

```text
/Users/mack-mini/.hermes/profiles/tuesday/reports/leads-source-audit-2026-06-28/supabase-active-leads-audit.md
```

Summary:

- Read-only Supabase pull from `public.leads`.
- Active leads needing board attention: 20.
- Total unarchived rows read: 151.
- Parked/lost/won rows: 131.
- Writes enabled in env: yes, but not used.
- Accuracy gaps listed for leads including Matiu, no-reply, Li Legler, Isaac McCoubrey, Amanda Lawrey, Pia Kamala, David Broadhurst, Jenny & Malcolm, ITM Motueka, Scott & Evelien.
- Recommended manual update order was ambiguous/generic rows first, then hot/high-value overdue quotes.

This is probably not the immediate Production Plan task, but it matters because Hermes has been jumping lanes. Keep leads separate unless Guido asks.

## Known Hermes failure modes from this incident

Codex should explicitly avoid these:

- Do not work on Process templates when Guido is asking about Production Plan / Orders / order visibility unless the route/view is explicitly `?view=process-templates`.
- Do not claim readiness from generic page proof when the task is customer/order-specific.
- Do not use broad “page contains customer name” proof for order accuracy.
- Do not modify verifier/test scripts and then use those same modified scripts as independent proof.
- Do not conflate live Vercel URL, local Tailscale review URL, and worktree server state.
- Do not trust stale `current-tuesday-state.md` live commit entries without running live guard.
- Do not mutate Supabase/Monday/Xero/Gmail/customer records without explicit approval for that exact action.
- Do not deploy/push/alias without explicit approval.

## Recommended Codex recovery path

1. Start by freezing state:
   - Run live guard.
   - Run `git worktree list`.
   - Run `git status --short --branch` in the canonical repo and any candidate worktree.
   - Confirm with Guido whether the next task is to inspect, continue, or discard the semi-completed order-visibility layer.

2. Treat `/Users/mack-mini/.hermes/agent-tasks/tuesday-order-visibility-layer-20260629/worktree` as read-only until inspected.
   - It is a candidate branch for order visibility, but it is unverified and heuristic-heavy.
   - If useful, cherry-pick/manual-port only the smallest safe pieces into a fresh worktree.

3. If continuing order visibility, create a fresh Codex worktree from live commit `59a1568` or the current live-baseline branch after fetching.
   - Do not build on dirty canonical root.
   - Do not reuse Hermes's dirty worktree unless Guido explicitly says so.

4. Reconstruct product target in plain English before code:
   - Nick needs a simple workshop-active order board.
   - Payment/admin wait, dispatch-only, sample/admin, paused, complete/archive should not masquerade as work Nick needs to do.
   - But classification must be source-backed and not magic heuristics that silently move real jobs.

5. Verification before saying ready:
   - `npm run lint`
   - `READ_ONLY_MONDAY_SYNC=true npm run build`
   - `npm run check:mutations`
   - focused desktop and mobile proof for `/production/plan`
   - if a local review link is sent, run `npm run verify:tuesday-review-link -- --port <port> --expect "<visible changed text>"` and provide the Mac mini Tailscale URL only if it passes.

6. Deployment requires separate explicit approval.
   - No live deploy in this handover.

## Explicit non-actions in this handover

- No code changed except writing this markdown handover.
- No deploy.
- No push.
- No merge.
- No Supabase/Monday/Xero/Gmail/Shopify/customer data mutation.
- No worktree deletion or cleanup.

## Handover file path

This document is saved at:

```text
/Users/mack-mini/innate-mission-control/reference/handovers/2026-06-29-codex-tuesday-handover-after-hermes-failure.md
```
