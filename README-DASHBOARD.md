# Innate Dining Table Configurator Dashboard

Visual project dashboard for the Innate Dining Table Configurator project.

## Route

Run the app and open:

```bash
npm run dev
# then visit http://localhost:3000/configurator
```

Production route:

```text
https://innate-mission-control.vercel.app/configurator
```

## Current v2 behaviour

- Overall progress is calculated live from ticked milestone items plus Guido/Dylan to-dos.
- Each milestone calculates its own percentage from its checklist.
- The “This afternoon” section has two clear columns:
  - Guido: product choice, pricing/length rules, CTA, proof assets
  - Dylan: Reverse Angled Steel model, object naming, dimensions, exports/screenshots
- Guido and Dylan columns each show their own progress percentage.
- Ticks persist in the same browser via `localStorage`. They are not shared live between Guido and Dylan yet.

## What this dashboard is for

- Make the next action obvious.
- Show who owns each action.
- Explain why each task matters.
- Keep the configurator project anchored around the real bottlenecks:
  - asset pipeline
  - length/pricing truth
  - lead-gen-first page strategy
  - procedural tabletop + GLB frame approach

## Known asset facts shown

- Totara Crossroads original GLB: 4.93 MB
- Validation: clean
- Browser render: model-viewer works
- Optimised test: 54 KB
- Geometry: lightweight
- Main production issue: texture/export pipeline

## Next possible upgrade

If Guido and Dylan need to tick tasks from different devices and see the same state, add a tiny shared persistence layer next. Options:

- Vercel Blob JSON state
- Vercel Postgres/KV
- Supabase
- GitHub-backed JSON file with server action

For v2 review, local state keeps the implementation simple and safe.
