# Orders board (/production/plan) audit — 2026-07-04

Scope: everything in the Orders view Guido screenshotted (pending-intake rail,
approved schedule, week grid), plus app-wide consistency checks it surfaced.
Method: full existing test battery, Chromium visual audit (4 viewports × all
routes), live browser walkthrough, structural code read.

## Verdict

The board is feature-rich and loads clean (no console errors, no hydration
errors observed), but it is **unprotected**: most of its test suite silently
rotted, the visual audit finds real layout failures elsewhere in the app, and
the design system was only ~half-applied because of two silent font/token
pipeline bugs (both fixed today).

## What was tested and results

| Check | Result |
|---|---|
| `smoke:tuesday` (login/leads/production/plan/samples) | ✅ pass |
| `test:workshop-handoff` (handoff health + invoice expectation) | ✅ pass |
| `test:planning` × 8 | ❌ **5 fail / 3 pass** |
| `audit:tuesday-visual` (all routes × 4 viewports) | ❌ **24 failures, 297 warnings** |
| Live browser: board load, console, interactions | ✅ clean |
| Page contracts check | ✅ 7 present |

### Planning-suite failures (all expectation drift, not behaviour)

Failing asserts reference UI copy/colours that no longer exist:
`"Approve draft plan"`, owner colour `#8b1e1e`, `"Tasks this week"`,
`compactControl("Week"`. Passing: drag stress, stage suggestions, priority
persistence (the genuinely behavioural ones). **These tests never run in CI**,
so drift was invisible. Action: rewrite the 5 as behaviour-level tests and add
the suite to CI (needs a seeded test path or read-only assertions).

### Visual audit failures

1. **`/leads` tablet (768px): 249px horizontal overflow** — VALUE/ACTIONS
   columns and $ amounts overflow the viewport. Real bug, needs a stacked
   layout at ≤768px.
2. **`/production/dispatch` 307-redirects to `/production/plan`** — the page
   was retired but is still a nav item (Drafts) and still in audit
   expectations. Decide: restore or remove nav + expectations.
3. `/production/samples` mobile "missing text" — stale audit expectation
   (page renders fine; mobile nav hides the label). Fix the audit config.
4. 297 warnings dominated by freight-quotes/costings (contrast, tap-target,
   density) — burn down after failures.

## Silent design-system bugs (found & fixed today)

1. **DT tokens imported from a `"use client"` module silently break in server
   components.** Hit `/today` and the (now archived) workshop pages: washed-out
   headers/colours with no error anywhere. Tokens now live in
   `components/mission-control-tokens.ts` (server-safe); rule added to
   `docs/current/theme.md` §8.3.
2. **Fonts: three-way mismatch.** Layout loaded Figtree+Poppins; CSS variables
   and DT tokens asked for DM Sans+Fraunces, which were **never loaded** — all
   "Fraunces" surfaces actually rendered Georgia. Now: DM Sans + Fraunces
   loaded via `next/font`, variables and tokens wired to them, Figtree/Poppins
   removed.

## Structure & weight (context for refinement work)

- `PlanClient.tsx`: 10,782 lines, ~40 subcomponents (intake rail + review
  modal, task drafts, task assignment, order detail overlay, costing panels,
  customer mirror, QC checklist, collection control, photo tray, invoice spec,
  workshop spec, feedback buttons, plan rows/week view, process templates…),
  14 distinct API call sites.
- Ships celebration canvas animations (`DelightDoneBurst`, `DelightUnicorn`,
  flame shader ~600KB of page JS source). Candidates for lazy-load.
- Data sources on this view: order intake (Xero→Supabase), plan task links +
  order workflows (Supabase), order photos (Blob), Monday orders via
  cached fetch with Blob-snapshot fallback (legacy path), Xero read-only proof.
- Header says "Source: Synced" without naming the source — design standard
  requires source honesty; should read e.g. "Supabase + Monday · synced 9m ago".

## Data-quality observations (for the reconciliation sweep)

- Approved schedule: 5 blocked, **14 flagged needs-review**; Peter & Rosemary
  Tennent due 2 May and Tania Pocock due 20 May still active/blocked —
  stale states that will erode Nick's trust if demoed as-is.
- Pending rail: "David Broadhurst — No invoice · -" and a $30 order (INV-1172)
  look like intake artifacts worth a manual look.
- Monday-imported orderless junk tasks exist in `production_order_tasks`
  ("3pm", "second coat?") — visible in some task lenses; sweep or link them.

## Recommended order of work

1. **P1** Fix `/leads` tablet overflow; repair/behaviouralize the 5 planning
   tests and put the suite in CI; refresh visual-audit expectations
   (dispatch/samples) so the scanner is trustworthy again.
2. **P2** Nav cleanup (dispatch), "Source" label honesty, lazy-load delight
   animations, start splitting PlanClient view-by-view (Orders view first)
   while keeping behaviour identical — protected by the repaired tests.
3. **P3** Data hygiene sweep (stale blocked/past-due orders, junk tasks,
   needs-review queue) ahead of any Nick/Dylan demo.

## Also done in this audit session

- `/workshop` screens archived per Guido: removed from nav (routes still
  resolve if visited directly; page contracts retained and marked archived).
- `docs/current/theme.md` created as the canonical design system; visual/QA
  scripts and agents should treat it + `mission-control-tokens.ts` as law.
