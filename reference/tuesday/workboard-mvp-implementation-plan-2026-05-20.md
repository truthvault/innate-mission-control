# Tuesday Workboard MVP Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after Guido explicitly approves building. Do not execute schema/code tasks from this plan without that build approval.

**Goal:** Build a small Supabase-backed Workboard tab in Tuesday that turns meeting/source context into a calm Linear-inspired Today/Projects/Inbox/Waiting/Done work surface.

**Architecture:** Add three Supabase tables (`work_sources`, `work_projects`, `work_tasks`), seed the Stephen meeting as the first source/projects/tasks, then render `/workboard` through existing Tuesday `MissionControlShell`. Keep the UI compact and list-first. Mutations are internal Tuesday/Supabase work-task status updates only, never Monday/Shopify/Xero/Gmail/customer-visible writes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase REST API using existing service-role env pattern, plain CSS-in-JS matching existing Tuesday components.

---

## Preconditions and guardrails

- Work in an `agent-task/tuesday-*` branch/worktree.
- Before editing code, re-check:
  - `git worktree list`
  - `git status --short --branch`
  - relevant dirty worktrees read-only only
- Read before implementation:
  - `AGENTS.md`
  - `reference/INDEX.md`
  - `reference/august-america-mode-operating-plan-2026.md`
  - `reference/tuesday/README.md`
  - `reference/tuesday/projects-tasks-workboard-handover-2026-05-20.md`
  - `reference/tuesday/workboard-linear-product-brief-2026-05-20.md`
- Read local Next.js docs in `node_modules/next/dist/docs/` before changing App Router/API patterns.
- No deploy, push, merge, live schema mutation, or live Supabase data mutation without Guido's exact approval.
- The schema/seed SQL may be written into `reference/tuesday/`, but applying it to Supabase production requires separate approval.
- Internal Tuesday task-status writes are allowed only after Guido approves the Workboard build and schema application.
- No customer/team-visible writes.

## MVP user experience target

Tuesday `/workboard` should show:

- **Today:** 5-7 max `next`/`in_progress` tasks, cash/high first.
- **Projects:** five source-linked Stephen meeting buckets with open-task count and next task.
- **Inbox:** captured but untriaged tasks.
- **Waiting:** blocked work visible but out of Today.
- **Done / Record:** recently completed tasks with source traceability.

The MVP is not a Linear clone. It is a small trusted daily list with traceability.

---

## Task 1: Create Workboard schema draft SQL

**Objective:** Add a reviewable Supabase schema file without applying it.

**Files:**
- Create: `reference/tuesday/workboard-schema-2026-05-20.sql`

**Step 1: Write the SQL file**

Create SQL with:

```sql
create extension if not exists pgcrypto;

create table if not exists public.work_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('meeting', 'voice_note', 'email_thread', 'manual_note', 'import', 'other')),
  title text not null,
  source_date date,
  people jsonb not null default '[]'::jsonb,
  summary text,
  file_path text,
  transcript_path text,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null check (area in ('leads', 'website', 'marketing', 'commercial', 'customer_journey', 'production', 'materials', 'systems', 'admin')),
  status text not null default 'active' check (status in ('active', 'waiting', 'parked', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('cash', 'high', 'normal', 'later')),
  owner text,
  description text,
  source_id uuid references public.work_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.work_projects(id) on delete set null,
  source_id uuid references public.work_sources(id) on delete set null,
  title text not null,
  description text,
  area text not null check (area in ('leads', 'website', 'marketing', 'commercial', 'customer_journey', 'production', 'materials', 'systems', 'admin')),
  status text not null default 'inbox' check (status in ('inbox', 'next', 'in_progress', 'waiting', 'done', 'parked', 'cancelled')),
  priority text not null default 'normal' check (priority in ('cash', 'high', 'normal', 'later')),
  owner text,
  due_date date,
  related_lead_id text,
  related_order_id text,
  related_url text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists work_projects_source_id_idx on public.work_projects(source_id);
create index if not exists work_projects_status_priority_idx on public.work_projects(status, priority);
create index if not exists work_tasks_project_id_idx on public.work_tasks(project_id);
create index if not exists work_tasks_source_id_idx on public.work_tasks(source_id);
create index if not exists work_tasks_status_priority_idx on public.work_tasks(status, priority, due_date, sort_order);
create index if not exists work_tasks_owner_idx on public.work_tasks(owner);
```

Add an idempotent `updated_at` trigger only if the project already has a preferred Supabase trigger convention. If not, skip triggers and let the write helper set `updated_at`.

**Step 2: Verify SQL is reviewable**

Run:

```bash
git diff -- reference/tuesday/workboard-schema-2026-05-20.sql
```

Expected: new SQL file only; no schema applied.

**Step 3: Commit**

```bash
git add reference/tuesday/workboard-schema-2026-05-20.sql
git commit -m "docs: add Workboard schema draft"
```

---

## Task 2: Create Stephen meeting seed SQL draft

**Objective:** Add idempotent seed SQL for the first source, five projects, and seed tasks without applying it.

**Files:**
- Create: `reference/tuesday/workboard-stephen-meeting-seed-2026-05-20.sql`

**Step 1: Write stable source/project seed shape**

Use deterministic UUIDs via `gen_random_uuid()` is not ideal for idempotency. Prefer fixed UUID literals generated once by the implementer, or use an `insert ... where not exists` keyed on stable titles. For MVP, use stable title checks.

The file should:

- Insert one source:
  - `Meeting with Stephen — sales, website, leads, customer journey`
  - `source_type = 'meeting'`
  - `source_date = '2026-05-20'`
  - `people = '["Guido", "Stephen"]'::jsonb`
  - `file_path = '/Users/mack-mini/Desktop/Meeting Stephen 20 May 2026.m4a'`
  - `transcript_path = '/Users/mack-mini/Desktop/Stephen meeting transcript 2026-05-20/transcript-first-55min.txt'`
- Insert five projects if they do not exist:
  - Hot Lead Follow-up
  - Website Conversion Fixes
  - Commercial Outreach Engine
  - Customer Journey & Reviews
  - Materials, Supply & NZ Steel
- Insert tasks from the handover if they do not exist by title/project.

**Step 2: Use these exact seed tasks**

Hot Lead Follow-up:

- `Follow up large commercial quote once CAPEX/procurement timing should have cleared.` — `next`, `cash`, `Guido`
- `Follow up Michelle / High Street-style project.` — `next`, `cash`, `Guido`
- `Follow up Hamilton iwi boardroom table enquiry.` — `next`, `cash`, `Guido`
- `Continue nurturing JTB Architects/design-network relationship.` — `next`, `high`, `Guido`
- `Ask more leads “How did you find us?” and record source.` — `inbox`, `normal`, `Guido`

Website Conversion Fixes:

- `Fix Oval Crossroads copy that incorrectly references heirloom chair text.` — `next`, `high`, `Website`
- `Fix dining table headline/font inconsistency.` — `next`, `high`, `Website`
- `Synchronise fonts/formatting across core product pages.` — `inbox`, `normal`, `Website`
- `Fix benchtop configurator finish-label inconsistency.` — `next`, `high`, `Website`
- `Add hand-finished/handmade language to “What’s included”.` — `inbox`, `normal`, `Website`
- `Standardise tabletop shape terminology: oval, pill, Danish oval, custom.` — `next`, `high`, `Website`
- `Add/use top-down shape visuals to reduce ordering ambiguity.` — `inbox`, `normal`, `Website`
- `Refresh About Us with warmer Guido/Nick/Dylan story.` — `parked`, `later`, `Website`

Commercial Outreach Engine:

- `Build commercial/agent collateral set: cafe tables, restaurant tables, bar leaners, common sizes/heights.` — `inbox`, `high`, `Guido`
- `Ask Nick when Dylan can draw/render the commercial pieces.` — `next`, `high`, `Guido`
- `Decide exact standard commercial items and dimensions before Dylan starts.` — `next`, `high`, `Guido`
- `Expand commercial page with testimonials, project photos, credibility signals.` — `inbox`, `high`, `Website`

Customer Journey & Reviews:

- `Define standard post-order communication timeline.` — `next`, `high`, `Guido`
- `Set up business SMS/digital number workflow for delivery check-ins.` — `inbox`, `high`, `Hermes`
- `Create Google review request timing/process.` — `inbox`, `high`, `Guido`
- `Develop offcut/story-board gift concept.` — `inbox`, `normal`, `Guido`
- `Order/prototype new-logo badges.` — `parked`, `later`, `Guido`

Materials, Supply & NZ Steel:

- `Contact Vulcan about NZ-made 3mm 90x90 box section pricing/availability.` — `next`, `normal`, `Guido`
- `Confirm rimu availability for 43mm/thicker top requests.` — `inbox`, `normal`, `Guido/Nick`
- `Follow up David on timber/consignment timing.` — `inbox`, `normal`, `Guido`
- `Track tōtara delivery/kiln situation and decide whether it needs filleting.` — `inbox`, `normal`, `Guido/Nick`
- `Separate pinker tōtara boards for stained/darkwash tables and paler boards for natural finishes.` — `inbox`, `normal`, `Nick/workshop`

**Step 3: Commit**

```bash
git add reference/tuesday/workboard-stephen-meeting-seed-2026-05-20.sql
git commit -m "docs: add Workboard Stephen meeting seed draft"
```

---

## Task 3: Add Workboard domain types and prioritisation helpers

**Objective:** Define the Workboard shape and test sorting/count behaviour before wiring UI.

**Files:**
- Create: `lib/workboard/types.ts`
- Create: `lib/workboard/prioritisation.mjs`
- Create: `scripts/test-workboard-prioritisation.mjs`

**Step 1: Add types**

Create `lib/workboard/types.ts`:

```ts
export type WorkArea = "leads" | "website" | "marketing" | "commercial" | "customer_journey" | "production" | "materials" | "systems" | "admin";
export type WorkPriority = "cash" | "high" | "normal" | "later";
export type WorkTaskStatus = "inbox" | "next" | "in_progress" | "waiting" | "done" | "parked" | "cancelled";
export type WorkProjectStatus = "active" | "waiting" | "parked" | "done" | "cancelled";
export type WorkSourceType = "meeting" | "voice_note" | "email_thread" | "manual_note" | "import" | "other";

export type WorkSource = {
  id: string;
  sourceType: WorkSourceType;
  title: string;
  sourceDate?: string;
  people: string[];
  summary?: string;
  filePath?: string;
  transcriptPath?: string;
  externalUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkProject = {
  id: string;
  name: string;
  area: WorkArea;
  status: WorkProjectStatus;
  priority: WorkPriority;
  owner?: string;
  description?: string;
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkTask = {
  id: string;
  projectId?: string;
  sourceId?: string;
  title: string;
  description?: string;
  area: WorkArea;
  status: WorkTaskStatus;
  priority: WorkPriority;
  owner?: string;
  dueDate?: string;
  relatedLeadId?: string;
  relatedOrderId?: string;
  relatedUrl?: string;
  notes?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type WorkboardResult = {
  sources: WorkSource[];
  projects: WorkProject[];
  tasks: WorkTask[];
  syncedAt: string;
  source: "supabase" | "none";
  error?: string;
};
```

**Step 2: Add prioritisation helper**

Create `lib/workboard/prioritisation.mjs` with pure helpers:

- `priorityRank(priority)` returns `0 cash`, `1 high`, `2 normal`, `3 later`.
- `statusRank(status)` keeps `in_progress` before `next` in Today.
- `isOpenTask(task)` excludes `done`, `cancelled`, `parked`.
- `isTodayTask(task)` includes `next`, `in_progress`.
- `sortTasksForToday(tasks)` sorts status, priority, due date, sort_order, updated_at/title.
- `visibleTodayTasks(tasks, limit = 7)` returns `{ visible, hiddenCount }`.
- `projectOpenTaskCount(projectId, tasks)`.
- `nextTaskForProject(projectId, tasks)`.

**Step 3: Write test script**

Create `scripts/test-workboard-prioritisation.mjs` using Node `assert` to verify:

- cash tasks sort before high/normal.
- `in_progress` sorts before `next` when priorities tie.
- `visibleTodayTasks` caps at 7 and reports hidden count.
- parked/done/cancelled do not count as open.
- next project task ignores parked/done tasks.

**Step 4: Run and commit**

Run:

```bash
node scripts/test-workboard-prioritisation.mjs
npm run lint
```

Expected:

- `workboard prioritisation tests OK`
- lint passes

Commit:

```bash
git add lib/workboard/types.ts lib/workboard/prioritisation.mjs scripts/test-workboard-prioritisation.mjs
git commit -m "feat(workboard): add prioritisation helpers"
```

---

## Task 4: Add Supabase read/write helpers for Workboard

**Objective:** Read Workboard data and update task status through Supabase REST with narrow validation.

**Files:**
- Create: `lib/workboard/fetch-workboard.ts`
- Create: `lib/workboard/write-workboard.ts`

**Step 1: Copy the env pattern**

Use the same config approach as `lib/leads/fetch-leads.ts`:

```ts
function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}
```

**Step 2: Implement row mappers**

Map snake_case Supabase rows to camelCase `WorkSource`, `WorkProject`, and `WorkTask`.

Validation defaults:

- unknown source type -> `other`
- unknown project status -> `active`
- unknown task status -> `inbox`
- unknown priority -> `normal`
- unknown area -> `admin`
- missing `sort_order` -> `0`
- missing `created_at`/`updated_at` -> current timestamp

**Step 3: Implement `listWorkboard()`**

Fetch in parallel:

- `work_sources?select=*&order=source_date.desc.nullslast,created_at.desc`
- `work_projects?select=*&order=priority.asc,created_at.asc`
- `work_tasks?select=*&order=status.asc,priority.asc,due_date.asc.nullslast,sort_order.asc,updated_at.desc`

If Supabase env is missing, return:

```ts
{ sources: [], projects: [], tasks: [], syncedAt, source: "none", error: "Supabase env not configured for Workboard yet" }
```

If a table is missing, return a friendly error mentioning that Workboard schema has not been applied.

**Step 4: Implement narrow writes**

In `write-workboard.ts`, implement:

```ts
export async function updateWorkTask(id: string, payload: Record<string, unknown>): Promise<WorkTask>
```

Allowed fields for MVP:

- `status`
- `priority`
- `owner`
- `project_id`
- `notes`
- `sort_order`

Rules:

- reject unsupported fields
- validate status/priority
- when `status === 'done'`, set `completed_at = now()`
- when moving out of `done`, set `completed_at = null`
- always set `updated_at = now()`
- no writes to any external system

**Step 5: Commit**

Run:

```bash
npm run lint
```

Commit:

```bash
git add lib/workboard/fetch-workboard.ts lib/workboard/write-workboard.ts
git commit -m "feat(workboard): add Supabase helpers"
```

---

## Task 5: Add Workboard API route for status updates

**Objective:** Provide a narrow internal API for changing task status/metadata from the UI.

**Files:**
- Create: `app/api/workboard/tasks/[id]/route.ts`

**Step 1: Implement route**

Follow `app/api/leads/[id]/route.ts` pattern:

```ts
import { NextRequest, NextResponse } from "next/server";
import { updateWorkTask } from "@/lib/workboard/write-workboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid work task payload" }, { status: 400 });
  try {
    const task = await updateWorkTask(id, body);
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Work task update failed";
    const status = /disabled/.test(message) ? 403 : /required|Invalid|must be|unsupported/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

**Step 2: Verify mutation checker still passes**

Run:

```bash
npm run check:mutations
npm run lint
```

Expected: Monday mutation checker passes because this route only writes to Workboard Supabase tables.

**Step 3: Commit**

```bash
git add app/api/workboard/tasks/[id]/route.ts
git commit -m "feat(workboard): add task update API"
```

---

## Task 6: Add Workboard route and nav tab

**Objective:** Add `/workboard` page and expose it in the Tuesday shell.

**Files:**
- Modify: `components/mission-control-shell.tsx`
- Create: `app/workboard/page.tsx`
- Create: `app/workboard/WorkboardClient.tsx`

**Step 1: Add nav type**

Modify `MissionControlSection`:

```ts
export type MissionControlSection = "orders" | "leads" | "workboard" | "plan" | "samples" | "dispatch" | "test";
```

Modify `NAV`:

```ts
{ section: "workboard", label: "Workboard", href: "/workboard" },
```

Put it after Leads and before Production Plan.

Modify `scopeFor`:

```ts
if (section === "workboard") return "workboard";
```

Modify `RefreshButton` so `scope === "workboard"` behaves like leads: set refreshed and `router.refresh()` without hitting Monday refresh.

**Step 2: Add server page**

Create `app/workboard/page.tsx`:

```tsx
import WorkboardClient from "./WorkboardClient";
import { listWorkboard } from "@/lib/workboard/fetch-workboard";

export const dynamic = "force-dynamic";

export default async function WorkboardPage() {
  const result = await listWorkboard();
  return <WorkboardClient result={result} />;
}
```

**Step 3: Add client skeleton**

Create `WorkboardClient.tsx` with:

- `"use client"`
- `MissionControlShell section="workboard"`
- page title `Workboard`
- subtitle `Small daily list, source-linked work, no project-management swamp.`
- If `result.error`, show calm amber card.
- Show empty-state instructions if no tasks.

**Step 4: Commit**

Run:

```bash
npm run lint
```

Commit:

```bash
git add components/mission-control-shell.tsx app/workboard/page.tsx app/workboard/WorkboardClient.tsx
git commit -m "feat(workboard): add Workboard tab shell"
```

---

## Task 7: Build Workboard views

**Objective:** Render the five MVP views using live Workboard data.

**Files:**
- Modify: `app/workboard/WorkboardClient.tsx`

**Step 1: Build derived maps**

Use `useMemo` for:

- `projectById`
- `sourceById`
- `today = visibleTodayTasks(result.tasks, 7)`
- `inboxTasks = status === 'inbox'`
- `waitingTasks = status === 'waiting'`
- `doneTasks = status === 'done'` sorted by `completedAt || updatedAt` desc and sliced to 10
- active projects excluding `done`/`cancelled`

**Step 2: Add compact KPI row**

Use `KpiCard` from `mission-control-ui`:

- Today: visible count plus hidden count
- Inbox
- Waiting
- Active projects

**Step 3: Add Today section**

Render visible Today tasks with:

- title
- project name
- owner
- priority chip
- status chip
- source chip/title
- quick action buttons:
  - Start -> `in_progress`
  - Waiting -> `waiting`
  - Done -> `done`
  - Park -> `parked`

If hidden count > 0, show:

`More ready below — hidden to keep Today small: ${hiddenCount}`

**Step 4: Add Projects section**

For each active project card:

- name
- area chip
- priority chip
- owner
- status
- open task count
- next task title
- source title if available

**Step 5: Add Inbox section**

Render untriaged tasks with quick actions:

- Move to Next -> `next`
- Park -> `parked`
- Waiting -> `waiting`

**Step 6: Add Waiting section**

Render waiting tasks with quick actions:

- Move to Next -> `next`
- Done -> `done`
- Park -> `parked`

**Step 7: Add Done / Record section**

Render recent done tasks with:

- completed date
- project
- source

**Step 8: Commit**

Run:

```bash
npm run lint
```

Commit:

```bash
git add app/workboard/WorkboardClient.tsx
git commit -m "feat(workboard): render Workboard views"
```

---

## Task 8: Wire task status changes from UI

**Objective:** Make status buttons update Supabase task rows and refresh the route.

**Files:**
- Modify: `app/workboard/WorkboardClient.tsx`

**Step 1: Add API helper**

In the client file:

```ts
async function updateTask(id: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/workboard/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Task update failed");
  return body;
}
```

**Step 2: Add optimistic-safe button state**

Use `useTransition`, `useRouter`, and local error state. On success:

```ts
startTransition(() => router.refresh());
```

Do not overbuild optimistic UI unless easy. Correctness > cleverness.

**Step 3: Add accessible buttons**

Each button should have an `aria-label`, for example:

`Mark ${task.title} as done`

**Step 4: Commit**

Run:

```bash
npm run lint
```

Commit:

```bash
git add app/workboard/WorkboardClient.tsx
git commit -m "feat(workboard): update task status from UI"
```

---

## Task 9: Add Workboard smoke/check script

**Objective:** Verify `/workboard` renders and the route is wired without relying on browser-only manual checks.

**Files:**
- Modify: `scripts/smoke-tuesday.mjs` or create `scripts/smoke-workboard.mjs`
- Modify: `package.json` only if adding a new script is worth it

**Step 1: Inspect existing smoke script**

Read:

```bash
sed -n '1,240p' scripts/smoke-tuesday.mjs
```

Use `read_file`, not `sed`, when doing this via Hermes tools.

**Step 2: Add `/workboard` coverage**

Preferred: extend `scripts/smoke-tuesday.mjs` to include `/workboard` in existing checks.

Verify page HTML contains:

- `Workboard`
- `Today`
- `Projects`
- `Inbox`
- `Waiting`
- `Done`

If Supabase schema is not applied yet, allow a clear schema-missing Workboard warning rather than failing the smoke script before approved DB setup. After schema is applied, tighten this check.

**Step 3: Run checks**

Run:

```bash
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
npm run smoke:tuesday
node scripts/test-workboard-prioritisation.mjs
```

**Step 4: Commit**

```bash
git add scripts/smoke-tuesday.mjs package.json scripts/test-workboard-prioritisation.mjs
git commit -m "test(workboard): add smoke coverage"
```

Only include `package.json` if actually modified.

---

## Task 10: Apply schema and seed to Supabase after explicit approval

**Objective:** Create the live Workboard tables and seed data in Supabase only when Guido approves database mutation.

**Files:**
- No repo file changes expected unless recording verification notes.

**Required approval phrase:**

`approve apply Workboard Supabase schema and seed`

**Step 1: Pull production env safely**

Use a temporary env file and delete it afterwards. Do not print secrets.

**Step 2: Apply SQL**

Use Supabase SQL editor manually or a safe script using service-role key. If using a script, it must:

- read SQL from `reference/tuesday/workboard-schema-2026-05-20.sql`
- read seed from `reference/tuesday/workboard-stephen-meeting-seed-2026-05-20.sql`
- execute against Supabase only after approval
- print row counts only, not secrets

**Step 3: Verify row counts**

Expected after seed:

- `work_sources`: at least 1 Stephen meeting source
- `work_projects`: 5 seed projects
- `work_tasks`: 27 seed tasks

**Step 4: Run live local smoke**

Start local dev with env loaded, then verify `/workboard` renders:

- Workboard tab visible
- Today visible
- Stephen seeded projects visible
- No raw transcript dumped into UI
- Today remains compact

**Step 5: Record verification if useful**

If a reference update is needed, add a small note to:

- `reference/tuesday/workboard-linear-product-brief-2026-05-20.md` or a new verification note

Do not store secrets.

---

## Task 11: Final local verification before publish approval

**Objective:** Prove the branch is safe and useful before asking Guido to approve publishing.

**Commands:**

```bash
node scripts/test-workboard-prioritisation.mjs
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
npm run smoke:tuesday
```

If `/workboard` changes affect live UI, also run browser smoke against local dev:

- `/workboard`
- `/leads`
- `/production/plan`

Expected:

- `/workboard` loads
- `/leads` still loads
- `/production/plan` still loads
- nav remains usable on narrow/mobile-ish width

**Commit any fixes before reporting.**

---

## Task 12: Ask for publish approval

**Objective:** Keep Guido in control of live Tuesday changes.

**Report format:**

```text
Tuesday report

Changed:
- Workboard MVP built locally: schema/seed drafts, Supabase helpers, /workboard UI, status update API.

Checked:
- node scripts/test-workboard-prioritisation.mjs ✅
- npm run lint ✅
- READ_ONLY_MONDAY_SYNC=true npm run build ✅
- npm run check:mutations ✅
- npm run smoke:tuesday ✅
- local /workboard smoke ✅

Not changed:
- no deploy
- no push
- no external/customer-visible writes
- no Monday/Shopify/Xero/Gmail writes

Blocked/Risks:
- Supabase schema/seed requires explicit approval if not already applied.
- Workboard status changes mutate Tuesday/Supabase work_tasks only.

Next approval:
- approve publish Workboard MVP
```

Do not push/deploy until Guido approves.

---

## Risks and deliberate trade-offs

- **Risk:** Today becomes too busy.
  **Control:** hard cap visible Today list at 7.

- **Risk:** Workboard becomes a website-audit dumping ground.
  **Control:** meeting imports default to Inbox/Parked unless cash/high and truly next.

- **Risk:** Supabase table missing breaks page.
  **Control:** `listWorkboard()` returns a calm schema-missing error card.

- **Risk:** Source traceability becomes transcript clutter.
  **Control:** UI shows source title/link only; no raw transcript text in task rows.

- **Risk:** Internal status writes are mistaken for external actions.
  **Control:** API only patches `work_tasks`; no external integrations.

## Definition of done

MVP is done when:

- Workboard docs/schema/seed are committed.
- `/workboard` is visible in Tuesday nav.
- Today/Projects/Inbox/Waiting/Done views render from Supabase data.
- Guido can change task status.
- Seeded Stephen tasks preserve source traceability.
- Tests/build/mutation checks pass.
- No live publish occurs without approval.
