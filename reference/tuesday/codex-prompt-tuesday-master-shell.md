# Codex Prompt: Tuesday Master Hub UI Foundation

You are working on **Innate Mission Control / Tuesday**, the internal operating console for Innate Furniture.

This task is about building the reusable **Tuesday master hub UI foundation**, not redesigning or deploying the whole app.

## Critical safety rules

- Do **not** deploy.
- Do **not** touch customer-visible systems.
- Do **not** send emails, quotes, invoices, messages, or external updates.
- Do **not** write to Shopify, Xero, Monday, Gmail, freight APIs, or supplier systems.
- Do **not** change production data or customer data.
- Do **not** deeply refactor the existing Production Plan.
- Do **not** overwrite, clean, revert, or commit unrelated dirty worktree changes.
- Work only in the isolated branch/worktree you have been given.
- Preserve existing Production Plan behaviour.
- If you find unrelated changes, leave them alone and report them.
- If the current worktree is not clean, stop and report before editing.

## Context

Tuesday should become Innate's world-class internal business hub:

- **Supabase** is the durable source-of-truth/data layer.
- **Tuesday** is the human control surface.
- **Agents/scripts** capture, reconcile, draft, and flag.
- **Vercel** is just the hosting layer, not the business brain.
- **Legacy calculators/standalone apps** are source evidence or migration inputs, not the future authority.

The goal is to make Tuesday feel like one coherent operating system, not a pile of unrelated Vercel pages.

Every major section should repeat core product logic:

- same shell/navigation model
- same source/evidence pattern
- same status/blocker language
- same approval/action safety model
- same section definition contract
- same calm, warm, Innate-quality UI direction

## Read these files first

Read these before proposing or making changes:

- `reference/tuesday/tuesday-master-hub-ui-architecture.md`
- `reference/tuesday/foundations.md`
- `reference/tuesday/quoting.md`
- `reference/quoting/README.md`
- `components/mission-control-shell.tsx`
- `app/page.tsx`
- `app/quoting/page.tsx`

Read these only if needed, and treat Production Plan as high-risk/read-mostly:

- `app/production/page.tsx`
- `app/production/plan/page.tsx`
- production-related components/hooks/libs

## First step: inspect and plan

Before editing files:

1. Check git status and current branch.
2. Confirm whether the worktree is clean.
3. Inspect the existing shell/navigation and section pages.
4. Produce a short implementation plan.
5. List exact files you intend to create/modify.
6. Identify any collision risk with active Production Plan work.

If the worktree is dirty with unrelated changes, stop and report. Do not edit.

## Primary implementation goal

Implement the reusable Tuesday master hub UI foundation.

Build the minimum useful foundation, not a giant redesign.

### Required deliverables

#### 1. Typed section definition contract

Create a typed contract for Tuesday sections, something like:

```ts
export type TuesdayActionClass =
  | "read_only"
  | "draft"
  | "internal_write"
  | "external_write"
  | "customer_visible"
  | "financial_or_legal";

export type TuesdayPanelKey =
  | "overview"
  | "queue"
  | "detail"
  | "decision"
  | "sourceEvidence";

export type TuesdaySectionDefinition = {
  key: string;
  label: string;
  purpose: string;
  primaryObjects: string[];
  canonicalTables: string[];
  externalSources: string[];
  allowedActions: TuesdayActionClass[];
  protectedActions: TuesdayActionClass[];
  requiredPanels: TuesdayPanelKey[];
  defaultSort?: string;
  owners: string[];
  blockerTypes: string[];
  approvalRules: string[];
  auditEvents: string[];
  realtimeEvents: string[];
};
```

Adapt naming/paths to the existing codebase conventions.

#### 2. Shared section registry

Create a shared registry of Tuesday sections.

It should include at least:

- Dashboard
- Inbox
- Leads
- Quoting
- Orders
- Production
- Freight
- Stock / Materials
- Suppliers / Relationships
- Admin / Audit

For sections that do not have real pages yet, mark them as planned/disabled/coming-soon rather than creating fake functionality.

The registry should be usable by navigation/shell code.

#### 3. Navigation/shell metadata

Refactor the shell/navigation only as much as is safe so section metadata can drive consistent labels, grouping, descriptions, or status.

Do not deeply redesign the Production Plan layout.

Do not break current routes.

#### 4. Reusable UI primitives

Add reusable UI primitives for the Tuesday section pattern.

Minimum useful primitives:

- `TuesdayOverviewPanel`
- `TuesdayWorkQueuePanel` or container
- `TuesdayDetailPanel` or container
- `TuesdayDecisionPanel` or action/safety panel
- `TuesdaySourceEvidencePanel`
- `TuesdayBlockerList` / `TuesdayBlockerChip`
- `TuesdayApprovalCard` or `TuesdayActionSafetyCard`

These can start as composable, typed React components with good empty states. They do not need deep data integration yet.

Design direction:

- warm neutral surfaces
- calm hierarchy
- excellent spacing
- clear source/action/status language
- no loud SaaS clutter
- no jumpy dark dashboard aesthetic

#### 5. Apply pattern to low-risk area first

Apply the shared pattern to a low-risk/read-only area first.

Preferred options:

- Quoting page shell/overview, if it can be done without breaking existing quote behaviour.
- A new internal architecture/demo route, if safer.

Avoid large Production Plan changes in this pass.

#### 6. Documentation

Update or add brief documentation explaining:

- where section definitions live
- how to add a new Tuesday section
- how action safety/protected actions should be represented
- how source/evidence panels should be used

## Acceptance criteria

The task is complete only if:

- the app builds successfully
- existing Production Plan route still works at a code/build level
- no external write behaviour is added
- no customer-visible behaviour is added
- there is a typed section definition contract
- there is a shared section registry
- navigation/shell can read from section metadata where safe
- reusable panel primitives exist
- at least one low-risk section uses the new pattern or there is a safe internal demo route
- docs explain how to add the next section
- unrelated dirty changes are not touched

## Commands to run

Use the package manager/scripts already present in the repo.

At minimum, run:

```bash
npm run build
```

If there are existing lint/type/test scripts, run the relevant ones too.

Do not install new dependencies unless absolutely necessary. Prefer no new dependencies for this task.

## Commit guidance

If changes are successful and the worktree only contains your intended changes, commit them with a clear message, for example:

```bash
git add <files you changed>
git commit -m "feat: add Tuesday master shell foundation"
```

If the worktree contains unrelated changes, do not commit. Report exactly what files are yours and what files are unrelated.

## Final response format

When finished, report:

1. What changed
2. Files created/modified
3. What was intentionally not changed
4. Build/test results
5. Any risks or follow-up needed
6. Whether changes were committed, and commit hash if applicable

## Important reminder

This is foundation work. Do not try to rebuild all of Tuesday in one pass. The goal is to create the repeatable product architecture that future sections can use safely.
