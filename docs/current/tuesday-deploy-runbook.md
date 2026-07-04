# Tuesday Deploy & Rollback Runbook

Status: active operating doc for Tuesday v2 (2026-07-04).

## Ground rules

- `main` is the only production branch. The deploy guard
  (`scripts/guard-vercel-production-deploy.mjs`) blocks production deploys from
  any other ref, and blocks dirty-tree deploys made locally.
- Never deploy from a dirty tree or an unpushed branch. CI (GitHub Actions)
  must be green on the commit being deployed.
- The Vercel project is `innate-mission-control` (CLI-deployed; not
  git-connected). Deploys are explicit, human-triggered actions.

## Deploy

```bash
cd ~/innate-mission-control
git checkout main && git pull --ff-only
git status --short        # must be empty
vercel deploy             # preview first — verify /workshop, /production/plan, /leads
vercel deploy --prod      # promote after preview passes
```

After a production deploy, verify:

1. `curl -s https://innate-mission-control.vercel.app/api/health` → `"ok": true`
2. Open `/workshop` and `/production/plan` on desktop and phone.
3. `npm run smoke:tuesday` with `SMOKE_BASE_URL=https://innate-mission-control.vercel.app`.
4. `SMOKE_BASE_URL=http://localhost:<port> npm run qa:crawl` against the local
   build before promoting — catches flashes, console errors, broken clicks,
   and overflow the smoke test cannot see. Zero findings expected.

## Rollback (target: under one minute)

Every production deployment stays on Vercel. To roll back:

```bash
vercel ls innate-mission-control            # find the last good deployment URL
vercel rollback <deployment-url-or-id>      # re-points the production alias
```

Known-good baselines:

- Deployment `dpl_8qHjfDsKEHLr9JHjv6BQARXSj2Tv` = the 2026-07-01 production
  build (git tag `live/20260701-prod`, commit `f594493`).
- The git tag `pre-v2-freeze-20260704` marks the last pre-overhaul worktree.

Rollback re-points the alias only — it does not touch Supabase data. Data
snapshots live in `~/90_Local_Archive/tuesday-snapshots/`.

## Monitoring

- `/api/health` is public and returns `{ ok, supabase, commit, env }`;
  it answers 503 when Supabase is unreachable. Point Hermes cron or any
  uptime checker at it.
- Unhandled server errors post to the ops Slack channel via
  `instrumentation.ts` (uses the SMS-bridge bot; override the channel with
  `TUESDAY_ALERTS_SLACK_CHANNEL_ID`). Deduped per error digest for 10 minutes.
- CI runs on every push/PR to `main`/`v2-main`: mutation ban, page contracts,
  lint, typecheck, build.
