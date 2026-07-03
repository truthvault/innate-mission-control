# Tuesday Page Contracts

Updated: 2026-06-24 by Codex.

Purpose: give Tuesday/Hermes an explicit product target before changing a screen. A page contract is the first source of truth for what a route or tab is trying to do. It prevents the agent from "improving" the wrong thing.

Use this file before Tuesday UI/design/polish work. If a route or tab is not listed here, stop and add a short contract before redesigning it.

## Contract Format

Each contract should state:

- Route/view
- Primary user
- Purpose
- This is
- This is not
- Must preserve
- Success looks like
- Verification

Keep contracts short and operational. They are product guardrails, not full specs.

## `/production/plan`

- Route/view: `/production/plan`, default Production Plan view.
- Primary user: Nick first; Guido for oversight and configuration confidence.
- Purpose: give the workshop a calm, current, trustworthy daily production view that helps Nick see what needs attention and move work forward.
- This is: a day-to-day production/workshop planning surface for active orders, priorities, stages, bottlenecks, and next actions.
- This is not: a template editor, admin setup wall, CRM, quoting workspace, or historical reporting dashboard.
- Must preserve: live production context, order clarity, priority/status signals, task/stage movement, mobile usability, and a low-noise workshop tone.
- Success looks like: Nick can open the page, understand what matters today, and act without decoding the system.
- Verification: prove the exact route in desktop, laptop/tablet width, and mobile; check no horizontal overflow, readable production cards, visible primary actions, and no logged-out or stale build state.

## `/production/plan?view=process-templates`

- Route/view: `/production/plan?view=process-templates`, Process templates tab.
- Primary user: Nick and Guido.
- Purpose: provide an editable production-template setup surface where Nick and Guido can adjust the templated process logic that later feeds the live production workflow.
- This is: a controlled editor for process templates, matching rules, scheduled tasks, order-flow stages, owners, hours, supplier waits, save/reset, and safe template maintenance.
- This is not: the calm daily Production Plan board, a workshop queue, a read-only status view, or a simplified worker screen.
- Must preserve: editable template fields, matching rules, task names, task ordering, move/delete controls, owner fields, hour estimates, supplier-wait fields, save/reset/autosave behavior, and existing process wording unless Guido explicitly asks to change the underlying process.
- Success looks like: a professional internal setup tool that feels deliberate and safe: readable columns, no clipped titles, no crushed controls, no awkward textarea scrollbars, quieter destructive actions, clear grouping between matching rules, tasks, stages, and supplier-wait settings.
- Verification: prove the exact Tailscale review URL points at the changed worktree; run `npm run verify:tuesday-review-link -- --port <actual-dev-server-port> --path /production/plan?view=process-templates --expect "Process templates"` with a route-specific selector where available; check desktop, laptop/tablet width, and mobile screenshots; test at least one safe local edit/save/reset path without mutating live data.

## `/leads`

- Route/view: `/leads`.
- Primary user: Guido and the sales/front-office workflow.
- Purpose: manage lead capture, follow-up, qualification, and conversion readiness without losing context between Hermes, Tuesday, and source systems.
- This is: an internal lead command surface for triage, status, follow-up, source-backed context, and next actions.
- This is not: a public CRM product demo, a marketing landing page, or a place to invent customer facts.
- Must preserve: source-backed lead data, follow-up intent, customer context, status clarity, draft-only behavior where required, and no customer-visible sends without explicit approval.
- Success looks like: Guido can quickly see which leads need action, why, and what the safest next step is.
- Verification: check authenticated route, representative lead rows/cards, mobile readability, filters/actions, and no external send/write unless explicitly approved and proven.

## `/quoting`

- Route/view: `/quoting`.
- Primary user: Guido first; future sales/ops helper second.
- Purpose: support quote preparation, pricing confidence, margin review, and approval-safe quote workflows.
- This is: a quote spine/workbench for draft quote thinking, supplier/material cost context, and approval-ready pricing decisions.
- This is not: an automatic Xero sender, final accounting authority, or a place to bypass supplier freshness/approval gates.
- Must preserve: draft-only safeguards, GST/margin clarity, source freshness, Xero authority, and explicit approval before official/customer-visible actions.
- Success looks like: Guido can understand quote risk and pricing logic before deciding what to send or approve.
- Verification: check calculations, visible assumptions, stale-source warnings, draft labels, responsive layout, and no Xero/customer mutation without explicit approval.

## `/production/stock`

- Route/view: `/production/stock`.
- Primary user: Nick and Guido.
- Purpose: show operational stock context clearly while Monday remains the workshop/legacy source until migration gates are met.
- This is: a practical stock visibility and reconciliation support surface.
- This is not: proof that Tuesday has replaced Monday as full stock source of truth.
- Must preserve: source labels, stock status clarity, exception visibility, and migration caveats.
- Success looks like: stock questions can be answered without confusing live Tuesday records with legacy/Monday authority.
- Verification: check source labels, sample stock records, mobile layout, and no source-of-truth claim beyond the current transition rule.

## `/production/samples`

- Route/view: `/production/samples`.
- Primary user: Guido, Nick, and anyone handling sample follow-up.
- Purpose: keep sample-related work visible, traceable, and connected to customer/order context.
- This is: an internal sample tracking and follow-up surface.
- This is not: a generic task list or customer-facing promise board.
- Must preserve: customer/order linkage, sample state, next action, and source-backed context.
- Success looks like: sample status and next action are obvious without hunting across systems.
- Verification: check representative sample rows/cards, status labels, responsive layout, and any mutation/readback behavior in the correct source.

## `/production/dispatch`

- Route/view: `/production/dispatch`.
- Primary user: Nick, Guido, and dispatch/ops helpers.
- Purpose: make dispatch readiness, blockers, and next actions clear for production orders nearing delivery.
- This is: an operational dispatch coordination surface.
- This is not: a freight pricing engine, public tracking page, or accounting record.
- Must preserve: order identity, readiness/blocker state, address/freight caution, and source authority labels.
- Success looks like: the team can see what can ship, what cannot, and what must happen next.
- Verification: check route access, dispatch cards/rows, blocker visibility, mobile layout, and no external/customer mutation unless explicitly approved.

## `/workshop`

> **ARCHIVED 2026-07-04** — Guido chose to refine the existing boards instead. Routes still resolve but are out of nav; do not extend without his direction.

- Route/view: `/workshop`, Tuesday v2 Schedule week board.
- Primary user: Nick and Dylan first; Guido for oversight.
- Purpose: show the workshop week (Monday–Friday × Nick/Dylan) from the Supabase production task spine so the team can see and move the week's work without Monday.com.
- This is: a calm week board of production tasks read from Supabase only — tick done, add a task, move a task between days/people, step between weeks.
- This is not: a Monday.com mirror, a template editor, a drag-heavy planning canvas, or a reporting dashboard.
- Must preserve: Supabase as the only data source, order linkage on tasks, working-day conventions (Nick and Dylan's workshop days), NZ-timezone week boundaries, one-tap task completion, and mobile usability.
- Success looks like: Nick opens it Monday morning, sees exactly what the week holds for him and Dylan, and can act on it in one or two taps.
- Verification: prove the route desktop + mobile via the review-link verifier; tick/untick a task and read it back from Supabase; confirm no Monday API calls are made server-side.

## `/workshop/orders`

> **ARCHIVED 2026-07-04** — Guido chose to refine the existing boards instead. Routes still resolve but are out of nav; do not extend without his direction.

- Route/view: `/workshop/orders`, Tuesday v2 active orders + stage checklist.
- Primary user: Nick, Dylan, and Guido.
- Purpose: show every active order with its due date, workshop progress, and per-order task checklist from the Supabase spine.
- This is: an ordered list of live orders (soonest due first) with an expandable stage/task checklist per order.
- This is not: a CRM, quoting surface, payment ledger, or historic order archive.
- Must preserve: Supabase as the only data source, due-date honesty (no invented dates), order → task linkage, and read-only Xero authority for financial facts.
- Success looks like: anyone in the workshop can answer "what state is this order in and what's next?" in under ten seconds.
- Verification: prove the route desktop + mobile; expand at least one order's checklist; confirm task ticks persist to Supabase and no Monday reads occur.

## `/workshop/today`

> **ARCHIVED 2026-07-04** — Guido chose to refine the existing boards instead. Routes still resolve but are out of nav; do not extend without his direction.

- Route/view: `/workshop/today`, Tuesday v2 per-person kiosk.
- Primary user: Nick or Dylan on a workshop tablet/phone.
- Purpose: give one person one screen of today's tasks with big one-tap completion, so working from Tuesday is faster than asking or guessing.
- This is: a large-target, low-noise daily task list for a single selected person, auto-refreshing from Supabase.
- This is not: an admin surface, a planning board, a metrics page, or a multi-person comparison view.
- Must preserve: person selection (Nick/Dylan), NZ-timezone "today", ≥44px tap targets, tick + untick, order context per task, and graceful empty state naming the source.
- Success looks like: Nick taps his name once and can run his day from the tablet without touching anything else.
- Verification: prove the route on mobile viewport; tick a task and read it back from Supabase; confirm the empty state distinguishes "no tasks today" from "source unavailable".
