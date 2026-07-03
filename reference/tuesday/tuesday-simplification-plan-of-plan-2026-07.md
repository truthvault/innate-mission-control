# Tuesday Simplification Plan-of-Plan — July 2026

> Status: planning guardrail, not implementation approval.
> Owner: Tuesday agent with Guido review gates.
> Created: 2026-07-03.

## Purpose

This document freezes the agreed planning method for simplifying Tuesday/Mission Control without letting the work sprawl into a confusing rebuild.

The immediate goal is **not** to rebuild Tuesday. The immediate goal is to create a master plan, then section plans, then only execute tiny approved slices.

## Why this exists

Guido explicitly does not want Tuesday/agents to “just go for it” on a complicated architecture change. Tuesday has become tricky because visible UI, live integrations, data reconciliation, approval workflow, and deployment verification are tangled together.

This plan-of-plan is the rail to prevent rabbit holes.

## Operating rule for every future turn on this work

Before doing any Tuesday simplification planning or implementation, the agent must refer back to this overview and state or internally lock:

1. Which pass is active: Pass 1, Pass 2, Pass 3, or approved build slice.
2. Which section is in scope.
3. What is explicitly out of scope.
4. What source files/data are being inspected.
5. What the stop condition is.

If the requested work does not map cleanly to the active pass/section, stop and ask whether to update the master plan or defer it.

## Core simplification hypothesis

Keep the current Vercel/Next/Supabase direction for now, but simplify Tuesday so visible pages mostly read stable Supabase/Tues read models instead of reconstructing reality live from Monday/Xero/Gmail/Shopify during route render.

Target shape:

```text
External systems
Monday / Xero / Gmail / Shopify
        ↓
Read-only collectors / reconciliation jobs
        ↓
Supabase Tuesday read models
        ↓
Next/Vercel UI
        ↓
Draft / approval queue
        ↓
Explicit approved executors only
```

## Non-goals until explicitly approved

- No live Vercel deploy.
- No Supabase production data mutation.
- No Monday, Xero, Shopify, Gmail, SMS, or customer-visible writes.
- No deleting existing routes or worktrees.
- No large refactor.
- No Factory-style backend rebuild.
- No UI redesign.
- No replacing Nick’s board before the plan is approved.
- No changing provider/gateway/cron settings.

## Planning passes

### Pass 1 — Master skeleton

Create the master plan skeleton and fill only enough to align direction.

Output:

- `reference/tuesday/tuesday-simplification-master-plan-2026-07.md`

Must include:

1. Purpose and why simplify.
2. Current-state summary.
3. Target architecture.
4. Non-goals.
5. Section list.
6. Proposed migration order.
7. Risk register starter.
8. Approval gates.
9. Open questions for Guido.

Stop condition:

- Master skeleton exists.
- No app code changed.
- No schema changes.
- Guido can review and correct direction.

### Pass 2 — Section detail plans

Expand each approved section into a detailed plan file. Do not implement.

Suggested files:

- `reference/tuesday/plans/01-source-of-truth-and-data-model.md`
- `reference/tuesday/plans/02-collectors-and-reconciliation.md`
- `reference/tuesday/plans/03-production-plan-nick-board.md`
- `reference/tuesday/plans/04-leads-control-surface.md`
- `reference/tuesday/plans/05-daily-control-approval-queue.md`
- `reference/tuesday/plans/06-ui-architecture-simplification.md`
- `reference/tuesday/plans/07-actions-and-external-writes.md`
- `reference/tuesday/plans/08-deployment-verification-and-rollout.md`

Each section plan must include:

- Purpose.
- Current files/routes/data touched.
- Target behavior.
- Explicit non-goals.
- Bite-sized tasks.
- Test/verification commands.
- Risks and rollback.
- Approval gate before build.

Stop condition:

- Section plan is detailed enough that a fresh worker can execute without guessing.
- No app code changed.
- Guido can approve/reject the section independently.

### Pass 3 — Execution sequence

Pick the first tiny safe implementation slice. Still do not build until Guido approves the exact slice.

Must define:

- Exact worktree/branch.
- Exact files to touch.
- Exact route or data model affected.
- What will not change.
- Verification commands.
- Review/proof artifact.
- Rollback point.

Stop condition:

- One tiny approved build slice is ready for execution.
- No broad migration starts accidentally.

## Sections to plan

### A. Source-of-truth and data model

Define what Tuesday owns, mirrors, infers, and displays. Every visible field needs a source/writable status.

### B. Collectors and reconciliation

Move source reconstruction into read-only jobs/scripts where possible. Visible pages should show last known good state and freshness.

### C. Production Plan / Nick board

Keep Nick’s view simple: Today / Next / Blocked / Waiting / Done, with one next action per card. Guido/admin can have detail views separately.

### D. Leads

Cash-first, draft-only lead control surface. Prioritize top revenue actions and source-backed Gmail/Supabase context.

### E. Daily Control / approval queue

America Mode control surface: either “no action needed” or 1–3 decisions for Guido. Drafts and approvals are separate from external execution.

### F. UI architecture

Route contracts, data contracts, component boundaries, server/client split, stale/error/empty states, and mobile proof rules.

### G. Actions and external writes

Draft → reviewed → approved → queued → executed → verified. No dangerous write directly from a page component.

### H. Deployment and verification

Worktree discipline, preview/live branch discipline, review-link proof, desktop/mobile proof, source readback, and rollback gates.

## Required status labels for each section

Use this lifecycle:

```text
Draft
Guido reviewed
Approved to spike
Approved to build
Built in preview
Approved live
Live verified
```

No section may move to build without explicit approval.

## Anti-rabbit-hole controls

1. One section per session unless Guido explicitly changes scope.
2. Every task needs a stop condition.
3. Every build task must say what it is not changing.
4. Prefer read-only inspection and small spikes before rebuilds.
5. If a task expands, stop and update the master plan rather than continuing.
6. Do not treat a passing build as proof of source truth or business correctness.
7. Do not use current UI as product truth if the page contract or source-of-truth plan disagrees.

## First practical next step

Run Pass 1 only:

> Create `reference/tuesday/tuesday-simplification-master-plan-2026-07.md` with current-state audit summary, target architecture, section list, migration order, risks, and open questions. No app code. No deploy. No schema changes.

## Reporting format for this planning stream

Use:

```text
Tuesday simplification planning report

Active pass:
- ...

Changed:
- ...

Checked:
- ...

Not changed:
- no app code
- no deploy
- no external data mutation

Blocked/Risks:
- ...

Next approval:
- ...
```
