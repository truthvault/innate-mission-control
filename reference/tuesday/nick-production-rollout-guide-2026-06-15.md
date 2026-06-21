# Nick Production Rollout Guide - 2026-06-15

## Purpose

Use Tuesday as the daily workshop operating view for orders and production. The first rollout goal is not to automate everything. The goal is to make the current work, next action, owner, date, payment state, QC, and collection status clearer than monday.com with less daily interpretation.

## Start Here

- Before Nick arrives, run `npm run audit:nick-readiness` against the local Tuesday server and use the first three clean training candidates it prints.
- Open `/production/plan`.
- Use the default Orders view first. Treat Schedule as the supporting board view.
- Start with the health strip: Active, On Track, Watch, Blocked, This Week, No Date.
- Use the order rows in this order:
  - Tasks this week: active workshop work that should be discussed today.
  - No tasks this week: active orders that need planning, confirmation, or later work.
  - Needs order / internal: unlinked or internal workshop rows that should not be mistaken for customer orders.

## First 30 Minute Session

1. Pick one live order already understood by Guido and Nick.
2. Open the order details.
3. Confirm these facts against the real job:
   - Customer and product.
   - Due date or delivery plan.
   - Current production step.
   - Next task.
   - Payment stage.
   - Xero/order truth if invoice details are present.
4. Add or edit one simple Nick task only if it is clearly correct.
5. Tick one completed task only if Nick agrees it is truly done.
6. Do not approve new intake orders in the first session unless Guido has already checked the payment evidence.

## Daily Training Rhythm

- 10 minutes: open Orders view and filter to Nick.
- 5 minutes: review Watch, Blocked, No Date, and This Week.
- 5 to 10 minutes: open one order detail and confirm the next action.
- 5 minutes: clean one rough task label, due date, owner, or order link.
- End by naming what Nick trusts, what confused him, and what should be changed before the next session.

## What Nick Can Safely Do

- Filter to Nick or Dylan.
- Open an order.
- Tick a task done when the work is actually done.
- Add a simple job task to an order.
- Update QC and collection details when known.
- Move schedule tasks only when the date/owner change is intentional.
- Add local feedback labels when wording or flow feels wrong.

## Guido-Only Actions For Now

- Run source reconciliation from Xero/Akahu. The visible intake refresh is only a read-only reload.
- Add a pending intake order into the Tuesday schedule unless the plan has genuinely been checked. The UI uses a `Plan checked and ready` checkbox to prevent accidental scheduling.
- Unlink a task from an order.
- Treat a payment as confirmed when it is not matched by Akahu/Xero evidence.
- Use Tuesday as the customer-update source without checking the underlying facts first.

## Trust Rules

- Monday remains the read-only source for the legacy production board feed.
- Tuesday task edits, workflow tasks, QC, collection, and intake approvals are Tuesday/Supabase state.
- Xero/Akahu payment evidence controls whether a new order is ready to approve.
- Balance invoices should attach to the existing order payment lifecycle, not create duplicate production work.
- If the UI says payment is waiting, bank-visible, or needs review, do not schedule as fully trusted until the evidence is clear.

## Today Readiness

Ready for Nick training:

- Orders view is the right default mental model.
- Active orders and unplanned active orders are visible.
- Order details include tasks, order truth, QC, dispatch/collection, payment badges, and Xero proof hooks.
- Pending intake now hides already-approved rows from the pending list while keeping approved tasks on the schedule.
- Saved order workflow tasks now batch-load into the main order-row schedule.
- Production pages are explicitly dynamic, so builds no longer try live Monday/Supabase reads during static generation.
- Intake review modal now stacks on narrow screens instead of forcing the desktop two-column layout.

Known risks:

- Browser visual QA for localhost was blocked by the in-app Browser network policy, so this pass used build, source tests, route smoke, and direct API proof instead of screenshots.
- Global `npm run lint` still fails because old scripts, generated JS, and theme worktrees are included in lint scope. Touched-file lint passes.
- `/today` is still an old hardcoded surface and should not be used as the Nick training entrypoint.
- The delight/unicorn layer is still enabled by default by existing test contract. Use `?delight=off` for a more serious training session if needed.
- The first live Nick session should include manual fact checks on 1 to 3 real orders before relying on Tuesday without Guido beside him.

## Recommended Tomorrow Script

1. "We are not replacing your judgement. We are replacing the daily hunt for the right information."
2. Open `/production/plan?delight=off`.
3. Filter to Nick.
4. Open the top active order.
5. Ask Nick: "What is wrong, missing, or unclear here?"
6. Fix one small thing live.
7. Tick one genuinely done task.
8. Stop before changing too much. The habit is more important than volume on day one.
