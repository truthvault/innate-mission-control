# Tuesday Stability Reset Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task after the QA gate exists.

**Goal:** Stop Tuesday from breaking during fixes by making the app prove all critical routes, buttons, drawers, and drag/drop surfaces in a no-live-write sandbox before any deploy.

**Architecture:** Add a deterministic QA harness first, then refactor the oversized Production Plan surface behind that harness. All write-capable actions must run in `read-only`, `sandbox`, or explicitly approved `live-write-enabled` mode, with disabled writes visible rather than silent.

**Tech Stack:** Next.js 16, React 19, Node scripts, Playwright/browser automation when installed, existing Monday read-only guards, Supabase/Vercel Blob behind explicit env gates.

---

## Non-negotiables

- No new product features until the stability gate is green.
- No deploy unless the stability gate, lint, build, mutation guard, and existing logic tests pass.
- No live Monday, Supabase, Blob, Gmail, Shopify, Xero, SMS, or customer-record mutations during QA.
- Production Plan work must reduce coupling, not add more UI into `PlanClient.tsx`.
- Nick-facing surfaces must stay simpler than Guido/Hermes planning surfaces.

## Immediate acceptance gate

A Tuesday branch is not shippable unless these pass locally:

```bash
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
npm run test:planning
npm run test:daily-brief
npm run qa:stability
```

`npm run qa:stability` must verify:

- unauthenticated protected routes redirect to `/login`;
- authenticated sandbox routes render expected headings/content;
- top nav links render on protected app routes;
- Leads Add drawer opens/closes and required-field validation prevents empty submit;
- write endpoints are visibly blocked when write env gates are disabled;
- Production Plan fixture/sandbox page has draggable/task/edit affordances when fixture data is available;
- browser console has no uncaught errors on checked routes;
- no QA env or secret temp files remain after the run.

## Task 1: Add no-live-write QA harness

**Objective:** Create a repeatable command that runs route/button safety checks without touching live data.

**Files:**
- Modify: `package.json`
- Create: `scripts/qa-stability.mjs`
- Optionally create: `reference/tuesday/stability-reset-plan-2026-05-25.md`

**Steps:**
1. Add `npm run qa:stability`.
2. Script must fail if `QA_ALLOW_LIVE_WRITES=true` is not absent/false.
3. Script must create an auth cookie from `SITE_PASSWORD`/`AUTH_SESSION_SECRET` when checking protected production/preview URLs.
4. Script must GET protected routes and assert expected page markers.
5. Script must check mutating APIs with safe disabled/missing-payload requests only, not valid live payloads.
6. Script must print a concise JSON/text report and exit non-zero on failure.

## Task 2: Add browser-level sandbox interaction tests

**Objective:** Exercise buttons/drawers/drag/drop in a local fixture context.

**Files:**
- Modify: `package.json`
- Create: `scripts/qa-browser-stability.mjs`
- Create fixture helpers under `scripts/fixtures/` or `lib/testing/` if needed.

**Steps:**
1. Use Playwright if available, otherwise install it in a reviewed dependency change.
2. Start local Next.js with write gates disabled.
3. Login with sandbox password.
4. Check `/leads`: filters, search, Add drawer open/close, required validation, disabled write messaging.
5. Check `/production/plan`: fixture rows render, drag/drop can move a task in browser, edit affordances open/close, no console errors.
6. Fail on `about:blank`, navigation errors, or uncaught JS errors.

## Task 3: Split `PlanClient.tsx` behind tests

**Objective:** Reduce blast radius by moving independent pieces out of the giant Production Plan client.

**Files:**
- Modify: `app/production/plan/PlanClient.tsx`
- Create components under `app/production/plan/components/`
- Create hooks under `app/production/plan/hooks/` where useful.

**Target split:**
- `PlanBoardShell`
- `PlanOrderRail`
- `PlanWeekColumns`
- `PlanTaskCard`
- `PlanTaskEditor`
- `PlanDragLayer`
- `PlanOverlayStatus`
- `PlanDelightToggle`

**Rule:** No behavior changes during the first split. Harness must pass before and after each extraction.

## Task 4: Make write boundaries visible

**Objective:** Every write-capable path reports whether it is read-only, sandbox, or live-write-enabled.

**Files:**
- `app/api/leads/*`
- `app/api/workboard/*`
- `app/api/production/plan-task-links/route.ts`
- `app/api/production/order-workflow/route.ts`
- related UI clients

**Steps:**
1. Add shared write-mode helper.
2. Return structured disabled responses when gates are off.
3. Show disabled/sandbox/live status in UI.
4. Add tests for disabled responses.

## Task 5: Conflict/version protection

**Objective:** Prevent silent overwrite of production-plan overlay state.

**Files:**
- `app/api/production/plan-task-links/route.ts`
- storage helper files
- tests/scripts for overlay API behavior

**Steps:**
1. Include `updatedAt` or version token in client save requests.
2. Reject stale writes with 409.
3. UI shows reload/retry state, not silent success.

## Current root-cause note

The previous audit identified the Production Plan as a large DnD UI and noted overlay storage risks, but it underweighted this as an architectural stability risk. This reset treats that concentration of interactions as the main source of “fix one thing, break another” risk.
