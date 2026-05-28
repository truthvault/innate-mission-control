# Tuesday durable lanes

Created: 2026-05-17

Purpose: fast capture and durable routing for Innate Mission Control, also called Tuesday. Hermes stays the Telegram front door; implementation workers use these lane briefs when Guido says `BUILD`.

## Active lanes
- `leads.md`
- `purchase-orders.md`
- `stocktake.md`
- `freight.md`
- `dashboard.md`
- `foundations.md`
- `inbox.md`

## Gym Mode protocol

Guido can send short ideas like:
- `Tuesday Leads: ...`
- `Tuesday PO: ...`
- `Tuesday Stocktake: ...`
- `Tuesday Freight: ...`
- `Tuesday Dashboard: ...`
- `Tuesday Foundations: ...`
- `Tuesday priority: ...`

Hermes should:
1. classify to a lane,
2. append/dedupe into the relevant lane,
3. give a short receipt,
4. consult Website where useful,
5. avoid build/external actions until explicit approval.

## Global guardrails
- Internal Tuesday / Mission Control planning only unless Guido explicitly approves otherwise.
- No customer emails, public website publishing, Shopify writes, Monday writes, Xero writes, payments, file deletion, or service restarts.
- Build work starts only when Guido says `BUILD`.
- During Gym Mode, append and dedupe ideas; do not rewrite architecture constantly.
- Treat Monday/Shopify/Xero as sources of truth unless an approved local Tuesday database table is defined.


## Master shell foundation

The reusable Tuesday section contract lives in:

```text
lib/tuesday/sections.ts
```

Each major section must define its label, purpose, primary objects, canonical tables, source systems, allowed actions, protected actions, required panels, blockers, approval rules, audit events, and realtime events before UI work expands. Sections that are not ready for real work should stay `planned` or `disabled` in the registry rather than exposing fake functionality.

The registry currently drives safe shell/navigation metadata in:

```text
components/mission-control-shell.tsx
```

Routes already present in Mission Control keep their existing paths. Planned routes can appear as non-clickable navigation metadata until their real implementation exists.

Reusable section panel primitives live in:

```text
components/tuesday-section-panels.tsx
```

Use these primitives to keep each section aligned with the master pattern: overview, work queue, detail, decision/action safety, source evidence, blockers, and approval cards.

### Adding a new section

1. Add or update the section definition in `lib/tuesday/sections.ts`.
2. Mark it `planned` until it has a real internal route and source-backed data path.
3. Give it the standard required panels unless there is a documented reason not to.
4. Keep external/customer-visible/financial actions in `protectedActions` until explicit approval and audit behaviour exist.
5. Build the first screen from the reusable Tuesday panel primitives before adding custom interaction.

### Action safety

Allowed actions describe what the section may do without crossing a protected boundary. Protected actions describe what must be blocked, approval-gated, and audited. Drafting is allowed in many sections; sending, publishing, booking, paying, or changing customer-visible commitments is protected by default.

### Source evidence

Important values should be paired with source evidence: source system, record reference, source timestamp, last-checked timestamp where available, confidence, and mismatch warnings. If evidence is missing or stale, the section should show a blocker instead of pretending the value is safe.

The current internal foundation/demo route is:

```text
/tuesday-foundation
```

It uses demo data only and does not add external writes, customer-visible behaviour, or a production quoting implementation.
