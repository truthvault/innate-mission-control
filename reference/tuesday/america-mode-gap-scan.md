# Tuesday America Mode gap scan

Reference: `reference/august-america-mode-operating-plan-2026.md`.

## Short verdict

Tuesday has strong lane surfaces for leads and production, but it is not yet the America Mode cockpit. The missing spine is a daily control surface plus a cross-lane approval queue.

## P0 gaps

### 1. Daily Control is not the main operating surface

Plan requires one command post with:

- cash risk
- hot leads
- drafts awaiting approval
- production blockers
- customer promise risk
- system issues
- one main decision

Current state:

- `/today` exists but is not yet the full cross-business daily digest.
- `/leads`, `/production/plan`, and `/workboard` each solve part of the job.
- Guido still has to reconstruct the day by moving between lanes.

Build next:

- Upgrade `/today` or create `/daily-control`.
- Start read-only.
- Show: “safe to ignore” or “1–3 decisions needed”.
- Pull top items from leads, production, Xero readiness/cash, and approvals.

### 2. Approval Queue is not yet a shared mechanism

Plan requires one place for approve/edit/park decisions.

Current state:

- Production has local “Approve draft plan” behaviour.
- Leads has “Do Today” but not a draft approval object.
- No durable cross-lane approval item model.

Build next:

- Add internal approval item abstraction/table.
- Fields: type, source lane, related record, proposed action, draft body/summary, risk, decision, approved_at.
- Start with internal approvals only. No outbound sends until separately approved.

### 3. Cashflow/Xero is proof-level, not cockpit-level

Plan requires read-only Xero cash risk with bills/invoices due 7/14/30 and chase/pay/delay decisions.

Current state:

- Xero read-only proof endpoint exists.
- No app UI for bills, receivables, due windows, or cash risk.

Build next:

- Add `/cashflow` or embed cash in `/daily-control`.
- Read-only first: overdue invoices, invoices due soon, bills due soon, risk colour.
- Approval item types: chase invoice, ask accountant, supplier reply draft.

## P1 gaps

### 4. Leads prioritisation is good; email execution is missing

Current strength:

- `/leads` is a strong Supabase command board.
- Filters: Do Today, Samples, Overdue, Cashflow Quotes, Hot, Needs Next Step, Waiting.

Missing:

- Gmail thread context.
- Drafted follow-up objects.
- Send/edit/park approval flow.
- Verified signature/template system.

Build next:

- Add “Draft follow-up” panel for top Do Today/sample leads.
- Convert drafts into approval items.
- Keep actual send disabled until approved.

### 5. Production/Nick surface is advanced; exception loop needs tightening

Current strength:

- `/production/plan` has Nick/Dylan lanes, order rail, health strip, task editing, plan task links, and risk heuristics.

Missing:

- Daily production exception digest.
- One-line customer update drafts for risk items.
- Explicit Nick confusion/feedback loop.
- Escalation into Daily Control.

Build next:

- Add compact “Production exceptions today”.
- Generate one-line customer update drafts for promise risk.
- Add a tiny “Nick confused?” feedback capture.

## P2 gaps

- Emergency escalation thresholds need encoding.
- Weekly improvement review needs a durable loop.
- Smoke tests need to catch wrong live links and feature-flag confusion.
- Ship script should wait more reliably for production promotion/READY state.

## Best next build order

1. Clean task cards and production plan visual consistency.
2. Make delight/default feature flags unambiguous and testable.
3. Harden smoke/tests for plan/leads/ship mistakes.
4. Build Daily Control read-only MVP.
5. Add shared Approval Queue model.
6. Add read-only Cashflow/Xero cockpit.
