# Production Plan Order Journey Toggle Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add a Production Plan toggle view where each customer/order sits on the left and their tasks run across a clean horizontal row, similar to Nick's manual Monday layout but calmer, clearer, and easier to use.

**Architecture:** Keep the existing day/person schedule as the default workshop capacity view. Add a second `Order journey` mode inside `/production/plan` that reuses the same `boardTasks`, `planTaskLinks`, `orders`, and order overview/editor actions. The new view is a derived presentation layer only: no new source of truth, no Monday writes, and no separate planning state.

**Tech Stack:** Next.js 16 / React 19, existing inline Tuesday design tokens in `PlanClient.tsx`, existing Monday mapped plan rows, existing Tuesday-only `plan-task-links` state.

---

## Product direction

### What Nick is asking for

Nick wants to see an order's journey in one straight line:

- customer/order on the left;
- Monday-style row of tasks across the week/days;
- cleaner UI than Monday's dense spreadsheet;
- less mental jumping between day columns and scattered cards;
- still easy to open/edit tasks and order details.

### Recommended mode names

Use a simple segmented toggle near the Production Plan header:

- `Schedule` — current day/person capacity board.
- `Order rows` — new customer/order journey view.

Avoid terms like `Gantt`, `timeline`, or `matrix`; Nick should not need project-management vocabulary.

### Acceptance criteria

- Toggle appears at the top of `/production/plan` beside the Nick/Dylan filter area or directly above the board.
- `Schedule` remains the default mode.
- `Order rows` shows each active customer/order as a horizontal row.
- Left side of each row shows customer/order metadata:
  - customer/order name;
  - due date or promise date if available;
  - item type/status chip where available;
  - order-link status (`Order linked`, `Needs order`, or `Internal`).
- Right side shows task chips in straight-line order by week/day/person.
- Task chip shows:
  - day label;
  - person label or colour cue;
  - task text;
  - estimated hours if present.
- Clicking a task opens the existing `WorkshopTaskEditor`.
- Clicking/open button on the row opens existing full `OrderOverviewOverlay`.
- Unlinked/internal workshop rows are visible but clearly separated at the bottom under `Needs order / internal`.
- No writes to Monday. All edits remain Tuesday-only through the existing task edit/link APIs.

---

## Data model approach

Do not create a new source of truth. Derive order rows from existing state:

- `boardTasks`: current schedule tasks including Tuesday edits/hours.
- `planTaskLinks`: Tuesday-only mapping from task key to linked order and placement.
- `ordersForHealth`: order list already shown in the right rail.
- Existing helpers:
  - `resolveOrderIdForPlanTask(task)`
  - `assignedOrderIdForTask(task, planTaskLinks)`
  - `planTasksForOrder(weeks, order, planTaskLinks)`
  - `stablePlanTaskKey(task)`
  - `displayWeekTitle(week.title)`

Create a derived view model inside or near `MonthViewState`:

```ts
type OrderJourneyTask = BoardPlanTask & {
  orderId: number | null;
  orderName: string;
  dateLabel: string;
  sortKey: string;
};

type OrderJourneyRow = {
  id: string;
  order: UiOrder | null;
  name: string;
  dueLabel: string | null;
  statusLabel: string | null;
  health: OrderHealthLevel | "internal" | "unlinked";
  tasks: OrderJourneyTask[];
};
```

Sort order:

1. rows with due/ship dates, earliest first;
2. linked rows without dates;
3. unlinked/internal rows;
4. inside each row, tasks by week start, day order, person, board order.

---

## Visual UX

### Desktop layout

Use a grid per row:

```txt
| Customer / order summary | Mon Nick | Mon Dylan | Tue Nick | Tue Dylan | Wed Nick | Wed Dylan | Thu Nick | Thu Dylan | Fri Nick | Fri Dylan |
```

But make it warmer and less spreadsheet-like:

- sticky left column on desktop;
- soft card rows with subtle dividers;
- each task chip is rounded and readable;
- Nick uses existing red accent, Dylan uses existing charcoal accent;
- linked-order glow or badge when selected;
- overdue/watch rows get gentle amber/red left stripe, not loud alarms.

### Mobile / narrow layout

Do not create a giant horizontal table on phones. Use stacked order cards:

```txt
Talia Bloodworth · due 8 Jun · Order linked
Tue Nick: coat · 1h
Wed Nick: 2nd coat · 1h
Thu Nick: assemble · 1h
Thu Dylan: sand and coat · 1h
[Open order] [Edit first task]
```

### Empty states

- If no rows: `No active order tasks in this window.`
- If row has no linked tasks: show only if it is a priority order needing planning, otherwise skip.

---

## Implementation tasks

### Task 1: Add failing static test for the mode toggle

**Objective:** Lock in the expected UI affordance before code changes.

**Files:**
- Modify: `scripts/test-workshop-task-editor-upgrades.mjs` or create `scripts/test-plan-order-journey-view.mjs`
- Modify: `package.json` test script if new file is created

**Assertions:**

- `PlanClient.tsx` includes `Order rows` label.
- `PlanClient.tsx` includes `Schedule` label.
- There is a mode state like `planViewMode` or `productionPlanMode`.
- `test:planning` runs the new test.

**Run:**

```bash
npm run test:planning
```

**Expected before implementation:** FAIL.

---

### Task 2: Add view mode state and segmented control

**Objective:** Let users switch between current schedule view and new order-row view without affecting data.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`

**Implementation notes:**

Add near other `MonthViewState` state:

```ts
type ProductionPlanMode = "schedule" | "orderRows";
const [planViewMode, setPlanViewMode] = useState<ProductionPlanMode>("schedule");
```

Add a small `ProductionPlanModeToggle` component:

```tsx
function ProductionPlanModeToggle({ mode, onModeChange }: { mode: ProductionPlanMode; onModeChange: (mode: ProductionPlanMode) => void }) {
  return (
    <div aria-label="Production plan view" style={{ display: "flex", gap: 4, padding: 3, border: `1px solid ${DT.border}`, borderRadius: 999, background: "rgba(255,255,255,0.76)" }}>
      {[
        ["schedule", "Schedule"],
        ["orderRows", "Order rows"],
      ].map(([id, label]) => {
        const active = mode === id;
        return (
          <button key={id} type="button" onClick={() => onModeChange(id as ProductionPlanMode)} style={{ border: 0, borderRadius: 999, padding: "7px 10px", background: active ? DT.headerBg : "transparent", color: active ? "#fff" : DT.textMuted, fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer" }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

Place beside `WorkshopFocusBar` or in a new top bar above the board.

**Run:**

```bash
npm run test:planning
```

**Expected:** New toggle test passes, app may still show placeholder for `Order rows`.

---

### Task 3: Build order journey view model

**Objective:** Transform existing board tasks into customer/order rows.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`

**Implementation notes:**

Create helper functions near existing board helpers:

```ts
function buildOrderJourneyRows({
  tasks,
  orders,
  resolveOrderId,
}: {
  tasks: BoardPlanTask[];
  orders: UiOrder[];
  resolveOrderId: (task: BoardPlanTask) => number | null;
}): OrderJourneyRow[] {
  // group by resolved order id, otherwise by normalized rowName/internal bucket
}
```

Important rules:

- If `resolveOrderId(task)` returns an order id, group under that `UiOrder`.
- Else group under `unlinked:${task.rowName}`.
- Preserve edited `task.rowName`, `task.text`, `task.estimatedHours`.
- Use existing `DAYS` and `PEOPLE` ordering for task sort.

**Test:**

Add static assertions for `buildOrderJourneyRows`, `OrderJourneyRow`, and `OrderJourneyTask` names, or preferably extract helper to `lib/production/order-journey.ts` and write a real Node test.

Recommended extraction:

- Create: `lib/production/order-journey.ts`
- Create: `scripts/test-plan-order-journey.mjs`

**Run:**

```bash
node scripts/test-plan-order-journey.mjs
npm run test:planning
```

---

### Task 4: Render desktop `OrderJourneyView`

**Objective:** Show customer/order rows with straight-line tasks.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`

**Component shape:**

```tsx
function OrderJourneyView({
  rows,
  selectedOrder,
  onTaskEdit,
  onTaskSelect,
  onTaskOpen,
  onOrderOpen,
}: {
  rows: OrderJourneyRow[];
  selectedOrder: UiOrder | null;
  onTaskEdit: (task: BoardPlanTask) => void;
  onTaskSelect: (task: AssignablePlanTask) => void;
  onTaskOpen: (task: AssignablePlanTask) => void;
  onOrderOpen: (orderId: number) => void;
}) {
  // render row cards
}
```

Use existing task actions:

- task click: select order/task;
- `Edit` or double action: `setEditingTask(task)`;
- `Open order`: `openOrderOverview(order.id)`.

Keep drag/drop out of v1 unless obviously cheap. This is a read/edit journey view first, not a replacement scheduling engine.

---

### Task 5: Render mobile stacked `OrderJourneyView`

**Objective:** Make the new mode useful on Guido's phone and workshop screens.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`

**Implementation notes:**

Use existing `useIsNarrow()` or CSS-ish responsive branching.

Mobile card content:

- order/customer title;
- due/promise chip;
- order status badge;
- vertical list of task chips: `Day · Person · Task · hours`;
- buttons: `Open order`, `Edit task`.

**Verification:** Browser/phone review at:

- `https://innate-mission-control.vercel.app/production/plan`

---

### Task 6: Wire conditional rendering

**Objective:** Make the toggle actually switch the main board area.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`

**Implementation:**

Inside `planningBoard`:

```tsx
{planViewMode === "schedule" ? (
  <>
    {newOrderPanel}
    {weekSections}
    {historySections}
  </>
) : (
  <OrderJourneyView ... />
)}
```

Decide whether `newOrderPanel` appears in `Order rows` mode. Recommended v1:

- hide planning/suggestion panel in `Order rows`;
- keep right rail visible;
- keep selected order and overlay working.

---

### Task 7: QA and checks

**Objective:** Verify no regression and no live data mutation.

**Commands:**

```bash
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
npm run test:planning
```

If approved to ship:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --yes
SMOKE_BASE_URL=https://innate-mission-control.vercel.app npm run smoke:tuesday
```

Manual smoke:

- `/production/plan` loads.
- Toggle defaults to `Schedule`.
- `Order rows` shows customer/order rows.
- Talia-like rows show tasks in a straight line.
- Task edit popup still opens and saves hours.
- Full order overlay still opens.
- Current Schedule board still works.

---

## V1 cut line

Include in V1:

- view toggle;
- order/customer left column;
- task journey rows;
- edit task;
- open full order;
- unlinked/internal section;
- mobile stacked cards.

Do not include in V1 unless explicitly requested:

- drag/drop inside order rows;
- live Monday updates;
- complex dependency arrows;
- printable PDF;
- per-person workload editing in this mode.

## Risks

- Order matching is only as good as existing links/name matching. Mitigation: keep unlinked rows visible and easy to connect.
- The current `PlanClient.tsx` is large. Mitigation: extract pure grouping logic to `lib/production/order-journey.ts` if implementation starts getting messy.
- Monday-style grids can become dense. Mitigation: show task chips and row cards, not raw cells; use horizontal scroll only on desktop.

## Suggested implementation branch

Continue from:

- `/private/tmp/tuesday-task-stage-suggestions`
- `agent-task/tuesday-nick-flow-refine`

Or, cleaner after current work is merged/preserved:

```bash
git switch -c agent-task/tuesday-order-journey-view
```

## Release report shape

```text
Tuesday report

Changed:
- Added Schedule / Order rows toggle to Production Plan.
- Order rows view shows each customer/order journey in one clean row.
- Task edit and full order details still open from the row.

Checked:
- npm run lint
- READ_ONLY_MONDAY_SYNC=true npm run build
- npm run check:mutations
- npm run test:planning
- smoke:tuesday

Live link:
- https://innate-mission-control.vercel.app/production/plan

Not changed:
- no Monday writes
- no customer messages
- no Shopify/Xero changes
```
