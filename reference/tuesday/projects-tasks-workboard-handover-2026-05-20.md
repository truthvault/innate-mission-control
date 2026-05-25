# Tuesday Projects & Tasks Workboard — Handover

Created: 2026-05-20
Owner: Tuesday agent, with Guido as decision-maker
Source meeting: Stephen + Guido, 20 May 2026, first 55 minutes only
Related artefacts:
- Audio: `/Users/mack-mini/Desktop/Meeting Stephen 20 May 2026.m4a`
- Transcript: `/Users/mack-mini/Desktop/Stephen meeting transcript 2026-05-20/transcript-first-55min.txt`
- Summary/to-dos: `/Users/mack-mini/Desktop/Stephen meeting transcript 2026-05-20/summary-and-todos.md`

## Purpose

Build a Linear-style **Projects & Tasks** tab inside Tuesday / Innate Mission Control, backed by Supabase, so Guido can keep a clean record of meetings and turn the useful parts into a manageable workboard.

The system should prevent scattered meeting notes from becoming forgotten actions, without turning Tuesday into another cluttered project-management dump.

## Non-negotiable outcome

Tuesday must help Guido answer three questions quickly:

1. **What do I need to do next?**
2. **What projects are open and why?**
3. **Where did this task come from?**

If the UI does not reduce Guido’s cognitive load, it has failed.

## Important boundaries

- Do not send emails, publish website changes, update customers, pay invoices, update Xero/Monday/Shopify, or make external/customer-visible changes without Guido’s explicit approval.
- Supabase/Tuesday is the forward source of truth for this workboard once implemented.
- Monday remains legacy/reference unless Guido explicitly asks for Monday writes.
- Keep this warm, simple, and Innate-shaped. Do not make it look or feel like generic enterprise software.
- Tuesday is an internal operating system, not a public/customer-facing surface.

## Existing Tuesday context

Read before implementation:

- `/Users/mack-mini/innate-mission-control/AGENTS.md`
- `/Users/mack-mini/innate-mission-control/reference/INDEX.md`
- `/Users/mack-mini/innate-mission-control/reference/tuesday/README.md`
- Existing Tuesday lane files in `/Users/mack-mini/innate-mission-control/reference/tuesday/`

Existing durable lanes:

- Leads
- Purchase Orders
- Stocktake
- Freight
- Dashboard
- Foundations
- Inbox

This new work should add a **Projects & Tasks / Workboard** lane/tab, not replace the existing lead/order/freight/stocktake lanes.

## Product concept

Create a Tuesday tab called one of:

- `Workboard`
- `Projects & Tasks`
- `Innate Control Board`

Recommended label: **Workboard**.

Why: “Projects & Tasks” is clear but a little generic. “Workboard” feels more like Tuesday and less like Linear cosplay.

## Data model principle

Separate source records from live work.

There are three layers:

### 1. Source records

Immutable or mostly immutable records of where work came from.

Examples:
- Meeting transcript
- Meeting summary
- Voice note
- Email thread summary
- Workshop note
- Strategy note

Purpose: preserve the clean record.

### 2. Projects and tasks

Structured, editable work items extracted from sources.

Purpose: manage execution.

### 3. Tuesday views

Small, useful views over the data.

Purpose: show Guido only what matters now.

## Proposed Supabase tables

Keep this MVP small. Do not build a heavyweight PM system first.

### `work_sources`

Stores the clean origin record.

Fields:

- `id` uuid primary key
- `source_type` text not null
  - allowed values: `meeting`, `voice_note`, `email_thread`, `manual_note`, `import`, `other`
- `title` text not null
- `source_date` date
- `people` text[] or jsonb
- `summary` text
- `file_path` text
- `transcript_path` text
- `external_url` text
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()

MVP notes:
- `file_path` and `transcript_path` are local paths for now.
- Do not overbuild file upload/storage yet.

### `work_projects`

Stores project buckets.

Fields:

- `id` uuid primary key
- `name` text not null
- `area` text not null
  - suggested values: `leads`, `website`, `marketing`, `commercial`, `customer_journey`, `production`, `materials`, `systems`, `admin`
- `status` text not null default `active`
  - allowed values: `active`, `waiting`, `parked`, `done`, `cancelled`
- `priority` text not null default `normal`
  - allowed values: `cash`, `high`, `normal`, `later`
- `owner` text
  - examples: `Guido`, `Tuesday`, `Website`, `Hermes`, `Nick`, `Dylan`, `Content`
- `description` text
- `source_id` uuid references `work_sources(id)` nullable
- `created_at` timestamptz default now()
- `updated_at` timestamptz default now()
- `completed_at` timestamptz nullable

### `work_tasks`

Stores actual actionable tasks.

Fields:

- `id` uuid primary key
- `project_id` uuid references `work_projects(id)` nullable
- `source_id` uuid references `work_sources(id)` nullable
- `title` text not null
- `description` text
- `area` text not null
- `status` text not null default `inbox`
  - allowed values: `inbox`, `next`, `in_progress`, `waiting`, `done`, `parked`, `cancelled`
- `priority` text not null default `normal`
  - allowed values: `cash`, `high`, `normal`, `later`
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

### Optional later: `work_task_events`

Do not build this in MVP unless easy.

Purpose: comments/history/status changes.

Fields:

- `id` uuid primary key
- `task_id` uuid references `work_tasks(id)`
- `event_type` text
- `note` text
- `created_by` text
- `created_at` timestamptz default now()

## Seed data from Stephen meeting

Create one source record:

- `source_type`: `meeting`
- `title`: `Meeting with Stephen — sales, website, leads, customer journey`
- `source_date`: `2026-05-20`
- `people`: `['Guido', 'Stephen']`
- `file_path`: `/Users/mack-mini/Desktop/Meeting Stephen 20 May 2026.m4a`
- `transcript_path`: `/Users/mack-mini/Desktop/Stephen meeting transcript 2026-05-20/transcript-first-55min.txt`
- `summary`: concise version from summary file, not the full transcript

Create these initial projects:

### 1. Hot Lead Follow-up

- Area: `leads`
- Priority: `cash`
- Owner: `Guido`
- Status: `active`
- Purpose: convert live quoted/commercial opportunities into deposits.

Seed tasks:

- Follow up large commercial quote once CAPEX/procurement timing should have cleared.
  - Status: `next`
  - Priority: `cash`
  - Owner: `Guido`

- Follow up Michelle / High Street-style project.
  - Status: `next`
  - Priority: `cash`
  - Owner: `Guido`

- Follow up Hamilton iwi boardroom table enquiry.
  - Status: `next`
  - Priority: `cash`
  - Owner: `Guido`

- Continue nurturing JTB Architects/design-network relationship.
  - Status: `next`
  - Priority: `high`
  - Owner: `Guido`

- Ask more leads “How did you find us?” and record source.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Guido`

### 2. Website Conversion Fixes

- Area: `website`
- Priority: `high`
- Owner: `Website`
- Status: `active`
- Purpose: fix trust-breaking inconsistencies and improve conversion without getting lost in polish.

Seed tasks:

- Fix Oval Crossroads copy that incorrectly references heirloom chair text.
  - Status: `next`
  - Priority: `high`
  - Owner: `Website`

- Fix dining table headline/font inconsistency.
  - Status: `next`
  - Priority: `high`
  - Owner: `Website`

- Synchronise fonts/formatting across core product pages.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Website`

- Fix benchtop configurator finish-label inconsistency.
  - Status: `next`
  - Priority: `high`
  - Owner: `Website`

- Add hand-finished/handmade language to “What’s included”.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Website`

- Standardise tabletop shape terminology: oval, pill, Danish oval, custom.
  - Status: `next`
  - Priority: `high`
  - Owner: `Website`

- Add/use top-down shape visuals to reduce ordering ambiguity.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Website`

- Refresh About Us with warmer Guido/Nick/Dylan story.
  - Status: `parked`
  - Priority: `later`
  - Owner: `Website`

### 3. Commercial Outreach Engine

- Area: `commercial`
- Priority: `high`
- Owner: `Guido`
- Status: `active`
- Purpose: make it easy for agents/designers/commercial contacts to understand and sell Innate’s commercial fit.

Seed tasks:

- Build commercial/agent collateral set: cafe tables, restaurant tables, bar leaners, common sizes/heights.
  - Status: `inbox`
  - Priority: `high`
  - Owner: `Guido`

- Ask Nick when Dylan can draw/render the commercial pieces.
  - Status: `next`
  - Priority: `high`
  - Owner: `Guido`

- Decide exact standard commercial items and dimensions before Dylan starts.
  - Status: `next`
  - Priority: `high`
  - Owner: `Guido`

- Expand commercial page with testimonials, project photos, credibility signals.
  - Status: `inbox`
  - Priority: `high`
  - Owner: `Website`

### 4. Customer Journey & Reviews

- Area: `customer_journey`
- Priority: `high`
- Owner: `Guido`
- Status: `active`
- Purpose: turn good customer experience into repeatable updates, post-delivery delight, and Google reviews.

Seed tasks:

- Define standard post-order communication timeline.
  - Status: `next`
  - Priority: `high`
  - Owner: `Guido`

- Set up business SMS/digital number workflow for delivery check-ins.
  - Status: `inbox`
  - Priority: `high`
  - Owner: `Hermes`

- Create Google review request timing/process.
  - Status: `inbox`
  - Priority: `high`
  - Owner: `Guido`

- Develop offcut/story-board gift concept.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Guido`

- Order/prototype new-logo badges.
  - Status: `parked`
  - Priority: `later`
  - Owner: `Guido`

### 5. Materials, Supply & NZ Steel

- Area: `materials`
- Priority: `normal`
- Owner: `Guido`
- Status: `active`
- Purpose: protect material supply and strengthen the NZ provenance story.

Seed tasks:

- Contact Vulcan about NZ-made 3mm 90x90 box section pricing/availability.
  - Status: `next`
  - Priority: `normal`
  - Owner: `Guido`

- Confirm rimu availability for 43mm/thicker top requests.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Guido/Nick`

- Follow up David on timber/consignment timing.
  - Status: `waiting` or `inbox`, depending on current payment/timing context
  - Priority: `normal`
  - Owner: `Guido`

- Track tōtara delivery/kiln situation and decide whether it needs filleting.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Guido/Nick`

- Separate pinker tōtara boards for stained/darkwash tables and paler boards for natural finishes.
  - Status: `inbox`
  - Priority: `normal`
  - Owner: `Nick/workshop`

## UI requirements

The Workboard should have five useful views.

### 1. Today

Purpose: small active list for Guido.

Rules:
- Show only `next` and `in_progress` tasks.
- Prioritise `cash` first, then `high`.
- Keep visually limited to about 5–7 tasks.
- If there are more, show “More waiting below” rather than flooding the view.

### 2. Projects

Purpose: see the open work buckets.

Show cards/rows for each project:
- Name
- Area
- Priority
- Owner
- Status
- Count of open tasks
- Next task

### 3. Inbox

Purpose: capture tasks from meetings/emails/notes before triage.

Show:
- Untriaged `inbox` tasks
- Source title/date
- Quick actions: move to Next, Park, assign owner, attach project

### 4. Waiting

Purpose: keep blocked work visible without polluting Today.

Examples:
- Waiting for Dylan render timing
- Waiting for supplier reply
- Waiting for customer/procurement

### 5. Done / Record

Purpose: maintain confidence and traceability.

Show recently completed tasks and source links.

## UX principles

- Warm, light, calm Tuesday styling. Not dark, jumpy, or Monday-like.
- Small daily list. Guido has ADHD/hyperfocus; avoid huge boards that invite rabbit holes.
- Tasks should be short and action-shaped.
- Projects can hold context, tasks should hold only what is needed to act.
- Make source traceability one click away, not always on screen.
- Do not show raw transcripts in the task UI. Link to them.

## Status semantics

Use statuses consistently:

- `inbox`: captured, not yet decided
- `next`: ready to do soon
- `in_progress`: actively being worked
- `waiting`: blocked by another person/system/timing
- `done`: externally done or genuinely complete
- `parked`: valid but not current
- `cancelled`: no longer relevant

Important: a draft is not done. A task is done only when the real-world action happened or the approved change is actually completed.

## Priority semantics

- `cash`: likely to bring money/deposit or protect immediate revenue
- `high`: important to conversion/trust/system leverage
- `normal`: useful but not urgent
- `later`: valid, but intentionally not now

## Implementation approach

Do not build everything at once. Recommended phases:

### Phase 1 — Schema and seed

- Add Supabase tables: `work_sources`, `work_projects`, `work_tasks`.
- Seed the Stephen meeting source, projects, and tasks above.
- Create simple read/write helpers.
- Verify data can be read back.

### Phase 2 — Basic Workboard tab

- Add Tuesday top-level tab: `Workboard`.
- Build Today, Projects, Inbox, Waiting, Done sections using live Supabase data.
- Keep interaction basic: status change, owner edit, priority edit, project assignment.
- Do not build drag-and-drop first unless it is already easy from existing Tuesday patterns.

### Phase 3 — Meeting import flow

- Add a simple internal flow to create a `work_source` and draft tasks from a meeting summary.
- Initial version can be manual/import-from-markdown.
- Later version can automate transcript summarisation/extraction.

### Phase 4 — Polish and daily operating loop

- Add filters by area/owner.
- Add “show me today” compact mode.
- Add source links and task counts.
- Add simple ageing signals, e.g. stale waiting tasks.

## Acceptance criteria for MVP

MVP is done when:

- Supabase contains a source record for the Stephen meeting.
- Supabase contains the five seed projects above.
- Supabase contains the seed tasks above with correct statuses/priorities/owners.
- Tuesday has a Workboard tab.
- Guido can see Today, Projects, Inbox, Waiting, and Done/Record.
- Guido can change a task status from the UI.
- Task records preserve a link back to the Stephen meeting source.
- The UI does not show more than a small number of active tasks by default.
- No external systems are written to.

## Recommended first conversation with Guido

Do not ask Guido to redesign the whole system. Start with a concrete narrow proposal:

> “I’ll build the Workboard MVP with Stephen’s meeting as the first seed. I’ll keep Today tiny, put the rest into Inbox/Parked, and use Supabase as source of truth. First decision: should the tab be called Workboard or Projects?”

If Guido does not care, default to **Workboard**.

## Things not to do yet

- Do not build a full Linear clone.
- Do not add comments/activity logs unless needed.
- Do not create complex recurring task logic yet.
- Do not integrate Gmail/Monday/Xero/Shopify writes.
- Do not import every meeting task as `next`.
- Do not expose raw transcripts in the normal UI.
- Do not turn website audit backlog into this board wholesale.

## Suggested build checks

From `/Users/mack-mini/innate-mission-control`:

```bash
npm run lint
npm run build
npm run smoke:tuesday
```

Note: This project uses Next.js 16. Read local Next docs before changing framework-specific code.

## Handoff summary

Build a small, source-linked Workboard in Tuesday. Use the Stephen meeting as the first clean test case. Store the clean record separately from tasks. Keep the daily view tiny. Prioritise cash and conversion. Preserve traceability. No external actions without Guido’s approval.
