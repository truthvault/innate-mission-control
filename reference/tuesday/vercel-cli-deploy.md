# Tuesday Vercel CLI deploy workflow

Created: 2026-05-21

Purpose: safe local deploy path for Innate Mission Control / Tuesday from the Mac mini Hermes environment.

## Canonical live links

- App: https://innate-mission-control.vercel.app
- Production Plan: https://innate-mission-control.vercel.app/production/plan

Every live-update report to Guido should include the relevant live link.

## Current local setup

- Vercel CLI is authenticated in the Tuesday/Hermes profile.
- The project is linked locally as `innate-mission-control` under the `gjloeffler-9108s-projects` scope.
- `.vercel/` is intentionally gitignored and must stay out of commits.
- `.vercel/.env.production.local` may contain production secrets. Do not print, copy, or commit it.

## Reliable production deploy path

Use the prebuilt deploy path:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --yes
```

Why: direct source deploy via `vercel deploy --prod --yes --no-wait` once uploaded successfully but failed with Vercel `UNKNOWN`/deployment-error and no useful logs. The prebuilt path built locally, deployed successfully, reached `Ready`, and attached the canonical production alias.

## Required checks before a code deploy

From the task branch/worktree:

```bash
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
```

When Production Plan changed, also run:

```bash
npm run test:planning
```

## Post-deploy verification

1. Inspect deployment readiness:

```bash
vercel inspect <deployment-url>
```

Expected:

- `status` shows Ready.
- aliases include `https://innate-mission-control.vercel.app`.

2. Smoke canonical live URL, not only the generated deployment URL:

- https://innate-mission-control.vercel.app/production/plan

For Production Plan updates, confirm:

- Production Plan loads.
- Friday is visible.
- Plan health is absent unless intentionally restored.
- Edit task opens.
- Save task edits is visible.
- Clear/blackwash coat stage suggestions are visible where expected.

## Safety boundaries

Never without explicit approval:

- push or merge branches;
- deploy live changes;
- mutate Monday, Supabase, Shopify, Xero, Gmail, or customer records;
- expose Vercel tokens/project IDs/env values/secrets.

If reporting a deploy, use this shape:

```text
Tuesday report

Changed:
- ...

Checked:
- ...

Live link:
- https://innate-mission-control.vercel.app/production/plan

Not changed:
- no live data mutations
- no secrets committed

Blocked/Risks:
- ...
```
