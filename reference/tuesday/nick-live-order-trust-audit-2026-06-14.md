# Nick live order trust audit - 2026-06-14

Status: local preparation note only. No Monday, Xero, Supabase, Shopify, Gmail, customer, or team-visible writes were made for this audit.

Data checked:
- Orders: `/api/monday/refresh?dryRun=1&scope=orders`
- Production plan: `/api/monday/refresh?dryRun=1&scope=plan`
- Order intake: `/api/production/order-intake`
- Xero proof: `/api/xero/proof?...` read-only checks now resolve through `/Users/mack-mini/.hermes/secrets/innate-integrations.json`; sampled active invoices returned `200`

Fetch proof:
- Data fetched at `2026-06-13T21:48:15Z` (`2026-06-14` NZ morning).
- Monday orders synced at `2026-06-13T21:48:14Z`.
- Monday plan synced at `2026-06-13T21:48:15Z`.
- Current counts: 33 orders, 15 active orders, 108 plan rows, 14 intake records.

## Trust Summary

Tuesday is good enough for a guided Nick session if Guido controls the first few examples and avoids payment/system proof claims.

The strongest workflow for tomorrow is not "all orders are perfect"; it is:

1. Use the order-row schedule as the daily workshop surface.
2. Use approved intake tasks as scheduled work once they are attached to their active order.
3. Treat Xero proof as not available until credentials/config are confirmed.
4. Do not ask Nick to resolve overdue/no-date/payment-uncertain jobs from Tuesday on day one.

Small readiness fix completed during this pass:
- Approved intake tasks now resolve back to their matching active Monday order by invoice first, then conservative customer/product fallback.
- Clicking a matched approved intake task now opens the normal order view first; the intake review opens only when no active order match is known.

## Best Nick Training Sequence

### 1. James Musto & Victoria Mark - best first example

Why: clean, small, low-pressure, approved intake, no overdue/no-date flags, and only three tasks.

Facts:
- Invoice: `INV-1152`
- Due: `2026-07-23` (`Due later 40d` at audit time)
- Current tasks: 3
- Nick tasks: 2
- Dylan tasks: 1

First tasks visible:
- `2026-06-15` Monday Nick: Material + spec check
- `2026-06-16` Tuesday Dylan: Drawing accuracy pass
- `2026-06-17` Wednesday Nick: Production scheduling check

How to train it:
- Show Nick one active order row.
- Open the order.
- Show the task sequence and owner split.
- Tick nothing unless Nick confirms the work has actually happened.

### 2. Scope Interior Design - Jo Goddard totara posts - best all-Nick example

Why: approved intake, near enough to matter, all tasks are Nick-owned, and it demonstrates non-table production work.

Facts:
- Invoice: `INV-1151`
- Due: `2026-06-26` (`Due in 13d` at audit time)
- Current tasks: 6
- Nick tasks: 6
- Dylan tasks: 0

First tasks visible:
- `2026-06-16` Tuesday Nick: Arrange posts to come to workshop first
- `2026-06-17` Wednesday Nick: Inspect posts against cutting list + grading
- `2026-06-17` Wednesday Nick: Brand / photograph / repackage posts
- `2026-06-18` Thursday Nick: Confirm final dispatch / customer update

How to train it:
- Use it after James to show that Tuesday is not just for tables.
- Ask Nick whether these tasks read like real workshop language.
- Make manual notes separately; do not change external systems.

### 3. Janette and Michael Sharp - fuller mixed workflow

Why: approved intake, healthy due date, more realistic task volume, and mixed Nick/Dylan responsibility.

Facts:
- Invoice: `INV-1143`
- Due: `2026-07-01` (`Due in 18d` at audit time)
- Current tasks: 10
- Nick tasks: 6
- Dylan tasks: 4

First tasks visible:
- `2026-06-23` Tuesday Nick: Cure / repair quality check
- `2026-06-24` Wednesday Nick: Final assembly / base fit / QC photos
- `2026-06-24` Wednesday Nick: Prepare gift / provenance / welcome pack
- `2026-06-24` Wednesday Nick: Local delivery prep / customer update

How to train it:
- Use once Nick understands the basic row/task interaction.
- Good for showing how upcoming work spreads across people and dates.

## Guido Demo Only

Use these to show Tuesday can carry complex production context, but do not make them Nick's first independent use cases.

### Camilla Penney

Facts:
- Invoice: `INV-1148`
- Status: Materials Ordered
- Due: `2026-07-10`
- Current tasks: 23
- Nick tasks: 17
- Dylan tasks: 6
- Readiness issue: material timing must be confirmed manually.

First visible tasks:
- Monday plan Wednesday Nick: Material + spec check; confirm final classic oval drawing before cutting
- Monday plan Thursday Dylan: Timber pulled + stress cuts
- `2026-06-22` Monday Nick: Westimber timing check
- `2026-06-29` Monday Nick: Precision timing check

### Raine Wapp

Facts:
- Invoice: `INV-1147`
- Status: Materials Ordered
- Due: `2026-07-10`
- Current tasks: 18
- Nick tasks: 8
- Dylan tasks: 10
- Readiness issue: material timing must be confirmed manually.

First visible tasks:
- Monday plan Wednesday Nick: Material + spec check
- Monday plan Thursday Dylan: Timber pulled + stress cuts
- `2026-06-15` Monday Nick: Confirm Timbers of NZ beech ready date
- `2026-06-15` Monday Nick: Send/confirm Westimber PO for Raine benchtop

## Caveat Teaching Example

### Dave Tidey samples

Facts:
- No invoice shown in Monday
- Due: `2026-06-17`
- Current visible tasks: 0

Use only to teach the negative rule: Tuesday should not invent certainty. If a due-soon sample has no visible tasks, Nick should flag it rather than guessing the next step.

## Do Not Start With These

These are useful for Guido cleanup, not for Nick's first day on Tuesday.

- Blair York: overdue 12 days, no visible tasks, no invoice.
- Oliver Bullock: overdue 5 days; one Nick task is visible, but this is a pressure case.
- Paulownia Trust (Joe): overdue 1 day, no visible tasks.
- Fowler Homes: overdue 1 day; one Nick task is visible, but not a first-session teaching case.
- Breanna & Wilbert Mascull: no due date, awaiting payment, no visible tasks.
- Colin Rose: no due date, awaiting payment, no visible tasks.
- Michael Kidd: no due date, no visible tasks.
- Amanda Lawrey sample rows: no due date/current task clarity.

## Proof Status And Remaining Gates

1. Xero proof is now available in this local Tuesday context.
   - The read-only `/api/xero/proof` checks returned `200` for sampled active invoices after switching to Hermes integrations storage.
   - Do not print or copy secret values; the proof route only needs `mcp.servers.xero.env.XERO_CLIENT_ID` and `mcp.servers.xero.env.XERO_CLIENT_SECRET` from the canonical Hermes JSON.

2. Overdue/no-task orders need Guido triage, not Nick training.
   - Four active orders are overdue.
   - Eight active orders have no visible current/future tasks.
   - Five active orders have no due date.

3. Materials Ordered jobs need a human material timing check.
   - Camilla Penney and Raine Wapp both have rich task context, but their first trust question is material readiness.

4. Payment-uncertain/new intake rows must stay out of the day-one workflow.
   - Breanna & Wilbert Mascull and Colin Rose are visible as intake/payment cases, not production scheduling cases.

## Suggested 20 Minute Session Plan

1. Open `/production/plan?delight=off`.
2. Start in order-row schedule view.
3. Use James Musto & Victoria Mark for the first walkthrough.
4. Use Scope Interior Design second to show an all-Nick workflow.
5. Use Janette and Michael Sharp only if Nick is comfortable.
6. End by showing Dave Tidey as the rule: missing tasks mean "flag it", not "guess it".

Guido line to Nick:

> "Tuesday is not here to make you do computer work. It is here so the workshop list is clearer than Monday, and so we can see the exact few things that need a decision."
