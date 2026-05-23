# Tuesday web UI architecture / data flow

Purpose: concise map for future agents working on Innate Mission Control / Tuesday. Tuesday is an internal ops UI; Hermes/Telegram remains the front door for planning unless Guido explicitly asks to build or ship.

## Stack

- App: Next.js App Router, Next `^16.2.6`, React `19.2.4`, TypeScript.
- Styling: mostly custom inline style objects plus Tailwind v4/PostCSS setup. Shared UI tokens/components live in `components/mission-control-ui.tsx`.
- Shell/navigation: `components/mission-control-shell.tsx`.
- Drag/drop: `@dnd-kit` on Production Plan.
- Data/persistence:
  - Monday.com GraphQL read-only source for production, orders, and sample stock.
  - Supabase REST for leads, workboard, SMS, and freight quote logs.
  - Vercel Blob for Monday snapshots and encrypted Tuesday overlay state.
  - Airtable fallback for freight quote logs.
  - External APIs include Mainfreight, Google Places, Resend, 2talk SMS, and Xero read-only proof.
- Deploy target: Vercel project `innate-mission-control`; live app `https://innate-mission-control.vercel.app`.

## Main routes

- `/` redirects to `/production`.
- `/login`: password login. Sets signed `innate-auth` cookie.
- `/leads`: Supabase leads command board. Client: `app/leads/LeadsClient.tsx`. Loader: `lib/leads/fetch-leads.ts`.
- `/workboard`: Supabase projects/tasks board. Client: `app/workboard/WorkboardClient.tsx`. Loader: `lib/workboard/fetch-workboard.ts`.
- `/production` and `/production/plan`: Production Plan. Client: `app/production/plan/PlanClient.tsx`. Loaders: `lib/monday/fetch-orders.ts`, `lib/monday/fetch-plan.ts`.
- `/production/samples`: sample stock board from Monday sample stock board. Client: `app/production/samples/SampleStockClient.tsx`.
- `/production/dispatch`: order/dispatch display from Monday orders.
- `/today`: present, but not yet the full America Mode Daily Control surface.
- `/freight-quotes`: internal freight quote log/status page.
- `/configurator`: present, inspect before treating as production-ready.

## Auth model

- Middleware: `middleware.ts`.
- Cookie name: `innate-auth`.
- Login compares submitted password to `SITE_PASSWORD`.
- Cookie value is HMAC-signed with `AUTH_SESSION_SECRET` or `SITE_PASSWORD`.
- Middleware protects all routes except `/login`, Next internals/static assets, `/api/monday/webhook`, `/api/sms/2talk/inbound`, and `/api/freight/*`.
- Public exclusions must validate their own secret/token inside route handlers.

## Data flow

### Monday

- Monday remains source of truth for orders, production plan, and sample stock.
- Monday client is intentionally read-only. `READ_ONLY_MONDAY_SYNC=true` is required and `npm run check:mutations` guards banned Monday mutations.
- Server loaders use cached fetches and fallback snapshots.
- Refresh via `MissionControlShell` posts to `/api/monday/refresh` for production scopes, then refreshes the route.

### Tuesday overlays

- UI state not owned by Monday is stored separately.
- Encrypted Blob helper: `lib/tuesday/encrypted-blob-store.ts`.
- Overlay examples: plan task links/edits and per-order workflow state.
- Treat overlay writes as real internal app state mutations.

### Supabase

- Supabase REST is used directly via `fetch`.
- Important env names: `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`.
- Main areas: `leads`, workboard tables/tasks/projects, `sms_messages`, and `freight_quote_events`.
- Supabase writes are live data mutations. Confirm scope before using write APIs.

### Freight/SMS/Xero

- Freight public endpoints are excluded from Tuesday password middleware and rely on their own token/CORS/rate-limit checks.
- SMS inbound is webhook-based. Outbound 2talk exists but is gated and must not be used without explicit approval.
- Xero is currently read-only proof/readiness/invoice summary code. Do not add Xero writes without explicit architecture approval.

## Quality gates

Before proposing ship:

```bash
node scripts/test-plan-card-done-button.mjs
npm run test:planning
npm run lint
READ_ONLY_MONDAY_SYNC=true npm run build
npm run check:mutations
npm run smoke:tuesday
```

For live smoke:

```bash
SMOKE_BASE_URL=https://innate-mission-control.vercel.app npm run smoke:tuesday
```

## Deploy / ship flow

Guardrail: no push or deploy without explicit approval.

Approved fast path:

```bash
git push -u origin HEAD
npm run ship:tuesday -- --dry-run
npm run ship:tuesday
```

`npm run ship:tuesday` promotes the newest Ready preview matching the current branch and commit, confirms Ready production deployment, and smokes the canonical live URL.

## Risk notes

- Monday must remain read-only.
- Supabase, Vercel Blob overlays, workboard, lead, SMS, and freight logs are real data stores.
- Public endpoints excluded from middleware must retain their own validation.
- Do not print or commit `.env*`, Vercel env, Supabase keys, Monday tokens, Xero secrets, or customer record dumps.
- Keep Tuesday calmer and simpler than Monday. Nick-facing workshop UX should use plain “what next” language, not system language.
