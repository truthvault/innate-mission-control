# Tuesday handover: Production Plan health strip

Date: 2026-05-21
Profile/session: Tuesday
Purpose: handover before Hermes update/restart/gateway/session reset.

## Current state

A clean local branch/worktree exists with the approved Production Plan UX improvement committed locally.

- Worktree: `/private/tmp/tuesday-plan-health`
- Branch: `agent-task/tuesday-plan-health`
- Commit: `dde3ccb feat: add production plan health strip`
- Repo remote: `https://github.com/truthvault/innate-mission-control.git`
- Local branch status at handover: clean

## What changed

Committed files:

- `app/production/plan/PlanClient.tsx`
- `package.json`
- `scripts/test-plan-health-strip.mjs`

Product change:

- Added current-week `Plan health` strip to `/production/plan`.
- Health strip can show:
  - `Dylan full today`
  - `Nick has 0h today`
  - `{n} blocked orders`
  - `Tasks needing order`
  - `Friday hidden`
  - fallback `Plan health OK`
- Changed task badge copy:
  - unlinked tasks now show `Needs order`
  - linked tasks now show `Order linked`
- Changed tooltip for unlinked tasks to communicate they need an order link before work can start.
- Changed workshop focus sublabels from ambiguous `today` copy to `tasks today`.
- Added `scripts/test-plan-health-strip.mjs` and wired it into `npm run test:planning`.

## Verification already run

From `/private/tmp/tuesday-plan-health`:

```bash
npm run test:planning
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
set -a; . /Users/mack-mini/innate-mission-control/.env.local; set +a; SMOKE_BASE_URL=http://localhost:3017 node scripts/smoke-tuesday.mjs
```

Results:

- `npm run test:planning` passed.
- `npm run lint` passed.
- `READ_ONLY_MONDAY_SYNC=true npm run build` passed.
- `npm run check:mutations` passed with `OK: no Monday mutation operations found in app/ or lib/.`
- Tuesday smoke passed:
  - login: 200
  - leads: 200
  - production default: 200
  - plan: 200
  - samples: 200

Warnings seen but not caused by this change:

- Node module warning: package lacks `"type": "module"` for existing `.mjs`/TS imports.
- Next warning: `middleware` convention is deprecated in favour of `proxy`.

## Local preview

A Next server was running at handover from `/private/tmp/tuesday-plan-health` on port `3017`.

- Local: `http://localhost:3017/production/plan`
- Mac/Tailscale-friendly hostname seen: `Macks-Mac-mini.local`
- Suggested link for Guido if still running: `http://Macks-Mac-mini.local:3017/production/plan`

The browser hit `/login`, so no authenticated pixel screenshot was captured in this session.

## Push/auth problem

Push was approved by Guido, but not completed.

What happened:

1. HTTPS push to origin failed:

```text
fatal: could not read Username for 'https://github.com': Device not configured
```

2. `gh auth status` showed no GitHub hosts logged in.
3. macOS keychain did not return a GitHub HTTPS credential.
4. SSH authentication to GitHub succeeded as `b5xq29jg27-ctrl`:

```text
Hi b5xq29jg27-ctrl! You've successfully authenticated, but GitHub does not provide shell access.
```

5. SSH push then failed because that GitHub identity lacks repo permission:

```text
ERROR: Permission to truthvault/innate-mission-control.git denied to b5xq29jg27-ctrl.
fatal: Could not read from remote repository.
```

Conclusion:

- HTTPS/`gh` auth is absent on this machine/session.
- SSH works generally, but the current SSH GitHub identity `b5xq29jg27-ctrl` is not authorised for `truthvault/innate-mission-control`.
- Do not keep retrying push until either HTTPS/gh auth is restored or the SSH identity is granted repo write access.

## Memory update made

Persistent memory was corrected to avoid the bad assumption:

- `truthvault push: HTTPS/gh absent; SSH b5xq29jg27-ctrl authenticates but lacks repo permission.`

## Main worktree warning

Main worktree `/Users/mack-mini/innate-mission-control` is dirty with many unrelated reference/script files. Do not stomp it.

Earlier inspected state showed:

- Main branch: `main`
- Separate worktree branch: `agent-task/tuesday-plan-health`
- Another worktree exists: `/Users/mack-mini/agent-worktrees/innate-2talk-sms`

Use the clean plan-health worktree for this task unless Guido explicitly asks otherwise.

## Safe next steps after Hermes restart

1. Reopen/check worktree:

```bash
cd /private/tmp/tuesday-plan-health
git branch --show-current
git status --short
git log -1 --oneline
```

Expected:

```text
agent-task/tuesday-plan-health
# clean status
 dde3ccb feat: add production plan health strip
```

2. If GitHub auth has been fixed, push branch:

Preferred if HTTPS/gh auth is restored:

```bash
git push -u origin agent-task/tuesday-plan-health
```

If SSH identity has been granted repo permission:

```bash
git push -u git@github.com:truthvault/innate-mission-control.git agent-task/tuesday-plan-health
```

3. Do not deploy unless Guido explicitly approves deploy.

4. If asked for a quick summary, say:

- Plan health strip is built, tested, committed locally.
- Push is blocked only by GitHub write auth.
- No deploy or live mutations happened.

## Exact final report state before restart

Changed:

- Built, tested, and locally committed Production Plan health strip.

Checked:

- planning tests, lint, read-only build, mutation guard, Tuesday smoke all passed.

Not changed:

- no push, no deploy, no merge, no live data mutations.

Blocked:

- GitHub write access from this Mac mini/session for `truthvault/innate-mission-control`.
