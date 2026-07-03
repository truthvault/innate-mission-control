# Tuesday Simplification Master Plan — July 2026

> **For Hermes/Tuesday:** Before editing this plan or any related implementation, load `reference/tuesday/tuesday-simplification-plan-of-plan-2026-07.md` and state or internally lock the active pass, section, non-goals, inspected sources, and stop condition.

**Status:** Pass 1 master skeleton — draft for Guido review.  
**Created:** 2026-07-03.  
**Current pass:** Pass 1 only.  
**Build approval:** Not granted.  
**Implementation status:** No app code, schema, deploy, or live data changes approved by this document.

---

## 1. Purpose

Simplify Tuesday/Mission Control so it becomes a reliable, source-backed operating cockpit for August America Mode without turning into a broad unreviewed rebuild.

The main simplification direction is:

> Keep Vercel/Next/Supabase for now, but stop making visible pages reconstruct live operational reality during route render. Move source collection/reconciliation into read-only jobs and stable Supabase/Tues read models wherever practical.

## 2. Why simplify

Tuesday currently carries too many responsibilities inside visible app routes and large client surfaces:

- UI and design polish.
- Live read-only source fetches from Monday/Xero/Supabase and other systems.
- Reconciliation logic.
- Draft/edit/approval actions.
- Fallback/snapshot behavior.
- Review-link/live-deploy verification.
- Nick-facing workshop board behavior.
- Guido-facing control/approval behavior.

This makes the app hard for agents to change safely. A small visible change can accidentally touch data truth, route render behavior, mobile layout, live verification, or external action safety.

## 3. Current architecture summary

### 3.1 Stack observed in repo

From `package.json` and app files in the guarded planning worktree:

- Next.js `^16.2.6` with React `19.2.4`.
- Vercel-oriented deployment and review links.
- Supabase client usage via `@supabase/supabase-js`.
- Vercel Blob via `@vercel/blob` for snapshots/stores.
- Playwright/browser scripts for smoke, review-link, and visual QA.
- Tailwind/PostCSS styling.
- DnD kit for production planning interactions.

### 3.2 Visible routes currently in scope

Observed app routes include:

- `/`
- `/today`
- `/leads`
- `/quoting`
- `/costings`
- `/call-intelligence`
- `/configurator`
- `/freight-quotes`
- `/production`
- `/production/plan`
- `/production/plan?view=process-templates`
- `/production/stock`
- `/production/samples`
- `/production/dispatch`
- `/production/test`
- `/login`

### 3.3 API route areas currently in scope

Observed API areas include:

- `/api/leads`
- `/api/quote/*`
- `/api/costings/update`
- `/api/xero/proof`
- `/api/monday/refresh`
- `/api/monday/webhook`
- `/api/production/order-intake/*`
- `/api/production/order-customer-mirror`
- `/api/production/order-documents/*`
- `/api/production/order-photos`
- `/api/production/order-workflow`
- `/api/production/plan-task-links`
- `/api/production/process-templates`
- `/api/freight/*`
- `/api/sms/*`

### 3.4 Source systems and local stores currently visible

Current source/store categories:

| Source/store | Current role | Simplification concern |
|---|---|---|
| Supabase | Forward Tuesday-owned records and some operational mirrors | Needs clearer read-model/source-of-truth boundaries |
| Monday | Workshop/legacy production and stock source until migration gates | Should not be reconstructed in visible routes where avoidable |
| Xero | Accounting authority for invoices/payments/quotes/bills | Read-only facts should feed stable evidence/read models |
| Gmail | Lead/customer context and draft workflows | Should feed lead/daily-control queues, not ad hoc UI facts |
| Shopify/configurator | Website/product/enquiry truth | Should feed monitoring/enquiry events separately |
| Vercel Blob | Snapshot/fallback/task-link storage | Useful but can obscure source authority if not labelled |
| Local fixtures | QA/proof/test data | Must stay clearly labelled as fixture, not operational truth |
| Reference files | Product contracts/operating truth | Must guide UI and architecture before code |

### 3.5 Existing verification scripts

Observed package scripts include:

- `npm run lint`
- `READ_ONLY_MONDAY_SYNC=true npm run build`
- `npm run check:mutations`
- `npm run check:tuesday-page-contracts`
- `npm run smoke:tuesday`
- `npm run verify:tuesday-review-link`
- `npm run audit:tuesday-visual`
- `npm run test:planning`
- `npm run test:order-intake`
- `npm run reconcile:order-intake`

These are useful, but broad commands should remain late-stage checks. Section plans must define narrow proof first.

## 4. Target architecture

Target shape:

```text
External systems
Monday / Xero / Gmail / Shopify / other source systems
        ↓
Read-only collectors and reconciliation jobs
        ↓
Supabase Tuesday read models and approval records
        ↓
Next/Vercel UI routes
        ↓
Draft/approval queue
        ↓
Explicit approved executors only
```

### 4.1 Principles

1. **Source-backed before polished.** A beautiful wrong screen destroys trust.
2. **Stable read models before live-render reconstruction.** Visible pages should prefer last known good Tuesday/Supabase state with freshness labels.
3. **Facts, inferences, drafts, approvals, and external writes are separate.**
4. **Nick-simple, Guido-decision-focused.** Nick sees the next practical production action; Guido sees risk, cash, promises, and approvals.
5. **Small verified changes only.** No broad refactor without a section plan and approval.
6. **No dangerous writes from page components.** External writes require explicit approval records and readback proof.

## 5. Non-goals

Until Guido explicitly approves otherwise:

- No live Vercel deploy.
- No Supabase production data mutation.
- No Monday, Xero, Shopify, Gmail, SMS, or customer-visible writes.
- No Factory-style backend rebuild.
- No Rails/Django rewrite.
- No deleting current routes.
- No replacing Nick’s board.
- No design overhaul.
- No broad migration of all data.
- No changing provider/gateway/cron settings.

## 6. Master sections

### A. Source-of-truth and data model

Define what Tuesday owns, mirrors, infers, and displays. Every visible field needs a source/writable status.

Likely outputs:

- Current table/source inventory.
- Target read-model table list.
- Writable vs read-only field map.
- Source freshness/confidence rules.

### B. Collectors and reconciliation

Move source reconstruction into read-only jobs/scripts where possible. Visible pages should show last known good state and freshness.

Likely collectors:

- Monday production/orders collector.
- Xero invoice/payment collector.
- Gmail lead/customer-message collector.
- Shopify/configurator/enquiry collector.
- Daily control generator.

### C. Production Plan / Nick board

Keep Nick’s view simple: Today / Next / Blocked / Waiting / Done, with one next action per card. Guido/admin detail can exist separately.

Planning must preserve current page contracts for `/production/plan` and `/production/plan?view=process-templates` until changed by approval.

### D. Leads

Cash-first, draft-only lead control surface. Prioritize top revenue actions and source-backed Gmail/Supabase context.

### E. Daily Control / approval queue

America Mode control surface: either “no action needed” or 1–3 decisions for Guido. Drafts and approvals are separate from external execution.

### F. UI architecture

Route contracts, data contracts, component boundaries, server/client split, stale/error/empty states, and mobile proof rules.

### G. Actions and external writes

Draft → reviewed → approved → queued → executed → verified. No dangerous write directly from a page component.

### H. Deployment and verification

Worktree discipline, preview/live branch discipline, review-link proof, desktop/mobile proof, source readback, and rollback gates.

## 7. Proposed migration order

| Order | Work | Why first/next |
|---:|---|---|
| 1 | Finish Pass 1 master plan review | Prevents agents from guessing direction |
| 2 | Section A: source-of-truth/data model | All UI simplification depends on data boundaries |
| 3 | Section B: collectors/reconciliation | Reduces visible-route fragility |
| 4 | Section E: Daily Control/approval queue | Directly supports August America Mode |
| 5 | Section C: Production/Nick board | Highest workshop trust impact |
| 6 | Section D: Leads | Cash/revenue priority |
| 7 | Section G: external actions | Needed before sends/writes become safer |
| 8 | Section F: UI architecture cleanup | Clean up after target data flow is clear |
| 9 | Section H: deployment/verification | Formalize continuously, harden before live pushes |

This order is provisional and should be corrected by Guido before Pass 2.

## 8. Approval gates

Each section must use this lifecycle:

```text
Draft
Guido reviewed
Approved to spike
Approved to build
Built in preview
Approved live
Live verified
```

No section may skip from `Draft` to implementation.

## 9. Risk register starter

| Risk | Why it matters | Mitigation in plan |
|---|---|---|
| Overbuilding architecture | Burns time before August | Keep Vercel/Next/Supabase; no separate backend now |
| Agent rabbit holes | Complicated work causes confusion | One pass/section per session; explicit stop conditions |
| Source-of-truth mistakes | Wrong facts damage trust | Section A before UI migration |
| Nick UI complexity | Workshop adoption fails | Nick board stays simple; admin details separate |
| Hidden live data writes | Customer/team-visible mistakes | External actions section; approval records; readback proof |
| Vercel/live provenance mistakes | Wrong version goes live | Worktree/branch/deploy gates remain mandatory |
| Broad tests slowing progress | Visible sessions stall | Narrow proof first; broad checks late |
| Supabase read models becoming stale | UI may show outdated state | Freshness labels, last successful collector run, stale states |

## 10. Open questions for Guido

1. Is the proposed target architecture correct: keep Vercel/Next/Supabase, move live source reconstruction behind collectors/read models?
2. Should Daily Control become the first product slice after source/data planning, or should Production/Nick board come first?
3. For Nick, is `Today / Next / Blocked / Waiting / Done` the right simplified mental model?
4. Which is more urgent for August: lead follow-up control or production promise risk?
5. How much stale-data tolerance is acceptable if a collector fails: hours, one day, or only explicit manual refresh?
6. Should Tuesday show “confidence/source freshness” visibly on every operational page, or only in details/admin views?
7. Which existing surfaces should be frozen while simplification planning happens?

## 11. Pass 2 section plan checklist

Every section plan must include:

- Purpose.
- Current routes/files/scripts/tables involved.
- Target behavior.
- Explicit non-goals.
- Bite-sized tasks.
- Verification commands.
- Data/source readback requirements.
- Desktop/mobile proof if UI is affected.
- Rollback or stop condition.
- Approval gate before build.

## 12. Stop condition for Pass 1

Pass 1 is complete when:

- This master skeleton exists.
- The plan-of-plan is saved and linked from `reference/tuesday/README.md`.
- No app code has changed.
- No schema, live deploy, or external data mutation occurred.
- Guido can review and correct the direction before Pass 2.
