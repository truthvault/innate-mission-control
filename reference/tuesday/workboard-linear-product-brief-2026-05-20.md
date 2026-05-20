# Tuesday Workboard — Linear Product Translation Brief

Created: 2026-05-20  
Owner: Tuesday agent, with Guido as decision-maker  
Status: product brief only; no schema/UI build approved yet  
Related handover: `reference/tuesday/projects-tasks-workboard-handover-2026-05-20.md`

## Goal

Understand Linear's working model well enough to copy the useful product principles into Tuesday, while rejecting the parts that would turn Innate Mission Control into another heavy project-management system.

Tuesday Workboard should answer three questions quickly:

1. What should Guido do next?
2. What open work matters and why?
3. Where did this task come from?

If the Workboard increases cognitive load, it has failed.

## Linear's actual product model

Linear is not just a kanban board. Its strength is a structured work graph with fast views over it.

### 1. Inbox / Triage

Linear separates incoming work from committed work. New issues can land in Triage so they can be accepted, moved, assigned, parked, or rejected without contaminating the main execution list.

Tuesday translation:

- Use `inbox` for captured but undecided tasks.
- Meeting imports should mostly land in Inbox, not Today.
- Inbox must have quick actions: move to Next, Park, assign owner, attach project.

### 2. Issues

Linear's atomic unit is the issue: a small piece of work with status, priority, assignee, project, labels, and context.

Tuesday translation:

- Use `work_tasks` as the atomic unit.
- Tasks should be action-shaped, not vague reminders.
- A good task title should start with a practical verb where possible.
- Keep metadata limited to what helps Guido decide or act.

### 3. Projects

Linear projects group issues around a larger outcome. A project explains why several tasks exist and gives a container for progress.

Tuesday translation:

- Use `work_projects` as simple buckets of meaning.
- Projects should be few and outcome-shaped.
- MVP projects from the Stephen meeting:
  - Hot Lead Follow-up
  - Website Conversion Fixes
  - Commercial Outreach Engine
  - Customer Journey & Reviews
  - Materials, Supply & NZ Steel

### 4. Cycles / time-boxing

Linear cycles are useful for engineering teams because they create a recurring planning rhythm and stop active work from being infinite.

Tuesday translation:

- Do not copy sprint/cycle machinery in MVP.
- Use a softer operating rhythm:
  - Today: tiny current list
  - This week: visible but not dominant later enhancement
  - Parked/Later: valid but intentionally not now
- The daily control loop matters more than sprint ceremony.

### 5. Views / filters

Linear works because the same underlying issues can appear in different focused views. The view changes, not the truth.

Tuesday translation:

- One Supabase source of truth.
- Five fixed views first:
  - Today
  - Projects
  - Inbox
  - Waiting
  - Done / Record
- No custom view builder in MVP.

### 6. Status workflow

Linear has team-specific workflow states, but the key product idea is simple: every issue has a current state and moving state is cheap.

Tuesday translation:

Use a small fixed workflow:

- `inbox`: captured, not yet decided
- `next`: ready to do soon
- `in_progress`: actively being worked
- `waiting`: blocked by another person/system/timing
- `done`: externally done or genuinely complete
- `parked`: valid but not current
- `cancelled`: no longer relevant

Important rule: a draft is not done. A task is done only when the real-world action happened or the approved change is actually completed.

### 7. Priority

Linear uses numeric priorities from urgent to low. The useful idea is that priority is lightweight and visible.

Tuesday translation:

Use Innate priorities:

- `cash`: likely to bring money/deposit or protect immediate revenue
- `high`: important to conversion/trust/system leverage
- `normal`: useful but not urgent
- `later`: valid, but intentionally not now

Sort Today by cash first, then high, then due/aged work.

### 8. Assignees / owners

Linear assigns work to people. Tuesday needs practical ownership across humans and agents.

Tuesday translation:

Suggested owner values:

- Guido
- Tuesday
- Hermes
- Website
- Content
- Nick
- Dylan
- Guido/Nick
- Nick/workshop

Owner should answer: who is expected to move this next?

### 9. Labels / areas

Linear labels provide flexible cross-cutting grouping. Too much flexibility can become mess.

Tuesday translation:

Use a controlled `area` field instead of free-form label sprawl:

- `leads`
- `website`
- `marketing`
- `commercial`
- `customer_journey`
- `production`
- `materials`
- `systems`
- `admin`

Avoid adding a generic labels system until repeated real use proves it is needed.

### 10. Documents / source context

Linear connects issues and projects to documents/specs/context. The key idea is traceability: work should not lose its origin.

Tuesday translation:

- Use `work_sources` for source records:
  - meeting transcript
  - meeting summary
  - voice note
  - email thread summary
  - workshop note
  - strategy note
- Tasks and projects link back to sources.
- The normal UI should show the source title and link, not raw transcript content.

## What makes Linear fast and calm

### Copy these product principles

- Fast capture before full triage.
- Compact lists over giant boards.
- One clear atomic work item.
- One-click status movement.
- Low-friction drawer/inline editing.
- Keyboard-first later, but not required for MVP.
- Smart defaults so new work does not require perfect classification.
- Views that hide irrelevant work without deleting it.
- Traceability without context dumping.

### Tuesday-specific calm rules

- Today must stay small: roughly 5-7 tasks.
- If more tasks qualify, show a calm overflow note rather than expanding endlessly.
- Waiting work should remain visible but not pollute Today.
- Parked work should remain findable but not emotionally noisy.
- Cash/revenue work should float up automatically.
- Website/agent tasks should be owned by the right profile and not become Guido's immediate list unless he must decide.

## What not to copy from Linear

Reject for MVP:

- Full sprint/cycle machinery.
- Estimate points.
- Complex team workflows.
- Custom workflow builders.
- Dependency graphs.
- Roadmap timelines.
- Project milestones.
- Heavy comments/activity feeds.
- Large backlog grooming rituals.
- Flexible label sprawl.
- Enterprise dashboard styling.
- Full keyboard-command system on day one.

Simplify later only if real Tuesday usage demands it.

## Simplified data model

### `work_sources`

Purpose: preserve where work came from.

Fields:

- `id` uuid primary key
- `source_type` text not null
- `title` text not null
- `source_date` date
- `people` text[] or jsonb
- `summary` text
- `file_path` text
- `transcript_path` text
- `external_url` text
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

### `work_projects`

Purpose: hold meaningful buckets of work.

Fields:

- `id` uuid primary key
- `name` text not null
- `area` text not null
- `status` text not null default `active`
- `priority` text not null default `normal`
- `owner` text
- `description` text
- `source_id` uuid references `work_sources(id)` nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()
- `completed_at` timestamptz nullable

### `work_tasks`

Purpose: store actionable next steps.

Fields:

- `id` uuid primary key
- `project_id` uuid references `work_projects(id)` nullable
- `source_id` uuid references `work_sources(id)` nullable
- `title` text not null
- `description` text
- `area` text not null
- `status` text not null default `inbox`
- `priority` text not null default `normal`
- `owner` text
- `due_date` date nullable
- `related_lead_id` text nullable
- `related_order_id` text nullable
- `related_url` text nullable
- `notes` text
- `sort_order` integer default 0
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()
- `completed_at` timestamptz nullable

### Later only: `work_task_events`

Purpose: history/comments/status changes if required.

Do not build in MVP unless it falls out naturally from existing patterns.

## UI sketch

### Top-level nav

Add a Tuesday tab: **Workboard**.

### Workboard header

- Title: `Workboard`
- Subtext: `Small daily list, source-linked work, no project-management swamp.`
- Primary action: `Capture task`
- Later action: `Import meeting`

### View 1: Today

Purpose: Guido's current action list.

Rules:

- Include only `next` and `in_progress` tasks.
- Sort `cash` first, then `high`, then due/aged/manual order.
- Show only 5-7 visible tasks.
- If more qualify, show: `More ready below — not shown to keep Today small.`

Task row:

- title
- project
- owner
- priority chip
- source chip
- quick actions: Start, Waiting, Done, Park

### View 2: Projects

Purpose: show open buckets and why they matter.

Project card:

- name
- area
- priority
- owner
- status
- open task count
- next task
- source link

### View 3: Inbox

Purpose: Linear-style triage.

Rows:

- title
- source
- suggested area
- owner
- quick actions: Move to Next, Park, Assign, Attach project

### View 4: Waiting

Purpose: blocked work visible without clogging Today.

Rows:

- title
- waiting reason/notes
- owner
- age/stale signal later
- source/project

### View 5: Done / Record

Purpose: trust and traceability.

Rows:

- recently completed task
- completed date
- project
- source

## MVP acceptance criteria

The Workboard MVP is useful when:

- Stephen meeting exists as one `work_sources` record.
- The five seed projects exist in `work_projects`.
- Seed tasks exist in `work_tasks` with sensible priorities/status/owners.
- `/workboard` exists in Tuesday.
- Today, Projects, Inbox, Waiting, and Done/Record are visible.
- Guido can change task status in the UI.
- Every seeded task preserves source traceability back to the Stephen meeting.
- No external systems are written to.
- Today does not flood Guido with a huge list.

## Implementation posture

Do not start by building a Linear clone. Start by building the smallest trusted operating list.

Recommended next document after this brief:

- `reference/tuesday/workboard-mvp-implementation-plan-2026-05-20.md`

Recommended next approval phrase:

`approve write Workboard MVP implementation plan`

Only after that plan is approved should schema/code work begin.
