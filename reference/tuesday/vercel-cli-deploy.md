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

## Fast production ship path for approved Tuesday branch changes

Default for small Tuesday app updates:

```bash
git push -u origin HEAD
# Wait/check that Vercel's Git preview is Ready, then:
npm run ship:tuesday
```

`npm run ship:tuesday`:

1. refuses a dirty worktree unless `-- --allow-dirty` is passed;
2. finds the newest Vercel **Ready** preview whose `githubCommitRef` and `githubCommitSha` match the current branch and commit;
3. refuses `UNKNOWN`, `BUILDING`, or wrong-commit deployments;
4. promotes the Ready preview with `vercel promote`;
5. confirms a Ready production deployment for the same commit;
6. runs `SMOKE_BASE_URL=https://innate-mission-control.vercel.app npm run smoke:tuesday`.

Useful dry run before asking Guido to ship:

```bash
npm run ship:tuesday -- --dry-run
```

Why: direct `vercel deploy --prod --yes` can hang at `Building…` and leave an `UNKNOWN` deployment with no useful logs. Git previews for this app generally finish in 20–60s, and promoting a Ready preview avoids rebuilding during the live step.

## Fallback production deploy path

Use this only if the Git preview/promote path is unavailable:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --yes
```

Why: prebuilt deploy builds locally and has previously reached `Ready` when direct source deploys produced `UNKNOWN`/deployment-error.

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
