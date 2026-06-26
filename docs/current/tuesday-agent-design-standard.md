# Tuesday Agent Design Standard

Status: active design standard.
Purpose: help Tuesday agents make Mission Control useful, calm, source-backed, and professionally finished without turning an internal operations tool into a decorative website.

Use this before significant Tuesday UI work. It complements the profile product language brief and the mobile work queue skill.

## Product Character

Tuesday is Innate Mission Control. It is an internal operations tool for Guido, Nick, Dylan, and the workshop.

It should feel:

- calm under pressure;
- dense enough to work from;
- warm enough to belong to Innate;
- source-backed and honest;
- boringly reliable.

It should not feel:

- like a marketing landing page;
- like Monday.com copied badly;
- dark, jumpy, or decorative;
- card-heavy without purpose;
- clever at the expense of workshop clarity.

## First Principles

- Truth beats polish. Never hide source errors, stale sync, missing costings, or uncertain Xero/Monday/Supabase state to make a screen look cleaner.
- Every prominent item must answer one of these: what is it, who owns it, what state is it in, what needs doing next?
- Colour means state, not decoration.
- Cards represent real objects: orders, tasks, leads, payments, stock items, freight quotes, processes, or source records.
- Mobile is not a squeezed desktop board. Mobile is a work queue, agenda, or action list.
- Nick/Dylan surfaces should privilege doing the work; Guido/admin surfaces can show more source/provenance detail.

## Current Visual Tokens

Use the shared Mission Control tokens first:

- `DT.pageBg`: `#f5f3ee`
- `DT.cardBg`: `#ffffff`
- `DT.headerBg`: `#1a1a1a`
- `DT.teal`: `#0c7c7a` for selected/live/linked/primary internal actions
- `DT.gold`: `#c8a96e` for warm active nav, sync accents, and attention without danger
- `DT.sage`: `#6e8a6a` for done/healthy
- `DT.clay`: `#9a3b2f` for blocked/destructive/danger only
- `DT.textPrimary`: `#22201a`
- `DT.textSecondary`: `#5a5549`
- `DT.textMuted`: `#7c746b`
- `DT.textFaint`: `#9a9088`
- `DT.radius`: `14`
- `DT.radiusSm`: `8`
- `DT.serif`: Fraunces for identity/order/customer headings
- `DT.sans`: DM Sans for operations, labels, rows, controls

Do not introduce a new palette or a new button style unless the existing tokens cannot express the state.

## Layout Rules

- Keep the global shell stable: Tuesday mark, sync/source state, primary nav, page title, and refresh behavior should remain predictable.
- Page title areas should be compact. Do not spend the first screen on explanatory copy unless the page is empty or blocked.
- Use full-width work surfaces and compact grids. Avoid nested decorative cards.
- Dashboard/KPI panels belong after the immediate work queue unless the page's job is explicitly reporting.
- Tables are acceptable on desktop when comparison matters. On mobile, convert them into stacked rows/cards with the same source facts.
- Empty states must say whether the source is genuinely empty or unavailable.

## Mobile Rules

Mobile must show meaningful work quickly:

- first useful row/card/action within the first screen;
- no horizontal scrolling for the main workflow;
- no desktop board flash before mobile state loads;
- no plausible-but-wrong list while saved state is still loading;
- tap targets should be at least about 40px high for common actions;
- every task row should be tickable and openable;
- secondary filters, metrics, and admin facts should collapse or move lower.

Use `/Users/mack-mini/.hermes/profiles/tuesday/skills/devops/tuesday-mobile-work-queue-ux/SKILL.md` for mobile Production Plan or workshop queue work.

## Page Family Patterns

### Production Plan

Primary job: help Nick/Dylan know what to do and help Guido trust source state.

- Keep Orders and Schedule stable.
- Preserve source/sync warnings.
- Do not move owners, dates, hours, task completion, or priority data without explicit approval.
- Mobile should be a work queue/agenda, not a miniature board.
- Any row that looks actionable must actually open, toggle, or expose the relevant action.

### Leads

Primary job: show cash-first lead work and next follow-up action.

- Prioritize high-value, due, stale, sample follow-up, and waiting states.
- Make customer status and next action visible without opening every card.
- Do not send, draft-send, or mutate external customer comms without approval.

### Stock / Samples / Costings

Primary job: reveal source confidence and operational gaps.

- Source freshness and missing mappings are not visual clutter; they are the work.
- Avoid hiding exceptions under tidy summary cards.
- Keep filters and search compact but visible.

### Freight / Quoting

Primary job: make customer-facing financial/logistics risk obvious.

- Show manual-check triggers, source confidence, GST/ex-GST truth, and calculation boundaries.
- Do not imply a freight/quote number is approved unless the source says so.

### Today / Dashboard

Primary job: help Guido decide what to do next.

- Keep this action-oriented, not a wall of metrics.
- Put urgent customer/workshop blockers above broad status.
- Avoid pretty dashboards that do not change the next action.

## Copy And Labels

Use workshop language:

- Orders
- Schedule
- This week
- Today
- Nick
- Dylan
- Watch
- Blocked
- Missing
- Source
- Synced
- Needs review

Avoid vague labels:

- Manage
- Insights
- Optimize
- Engage
- Magic
- AI-powered

## Red Flags

Treat these as design defects:

- visible horizontal overflow on mobile;
- clipped controls or unreadable labels;
- tiny icon-only actions without accessible names;
- repeated labels that make rows noisy;
- stale source hidden in small grey text;
- first screen dominated by chrome instead of work;
- decorative cards inside cards;
- page says "done" but source/provenance is unknown;
- a review link proves the wrong port or wrong app.

## Acceptance Rule

Before calling a Tuesday UI change ready, use `docs/current/tuesday-visual-audit-protocol.md` and the relevant focused script. A screenshot/report is proof; code confidence is not proof.
