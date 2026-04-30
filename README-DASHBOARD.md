# Innate Dining Table Configurator Dashboard

Visual project dashboard for the Innate Dining Table Configurator project.

## Route

Run the app and open:

```bash
npm run dev
# then visit http://localhost:3000/configurator
```

## What this v1 includes

- Project header and overall progress
- Milestone cards with checklists
- Kanban lanes: Now, Next, Later, Blocked / Decisions
- Responsibility cards for Dylan, Guido, and Hermes/Qwen/Codex
- Totara Crossroads GLB facts:
  - Original GLB: 4.93 MB
  - Validation: clean
  - Browser render: model-viewer works
  - Optimised test: 54 KB
  - Geometry: lightweight
  - Main production issue: texture/export pipeline
- Decision cards:
  - Lead-form-first instead of Shopify cart-first
  - Procedural tabletop + GLB frame/base
  - Reverse Angled Steel as Dylan’s next asset focus

## Current limitations

- Data is hardcoded in `app/configurator/page.tsx`.
- Checklist ticks are local React state only and do not persist.
- This is not deployed/pushed yet.
- Next step is to either:
  - keep this as a static local mission-control page, or
  - move the data into a small JSON/TypeScript data file so Hermes can update it cleanly.

## Files

- `app/configurator/page.tsx` — dashboard page
- `README-DASHBOARD.md` — this note
