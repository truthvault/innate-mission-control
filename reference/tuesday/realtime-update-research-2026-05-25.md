# Tuesday realtime update research

Date: 2026-05-25
Scope: Make Tuesday behave like Monday.com when two people are looking at the same screen: an update on one computer appears on the other within seconds.

## Short answer

Use Supabase Realtime as the standard event layer for Tuesday-owned data.

Recommended path:

1. **Move shared editable Tuesday state into Supabase tables** instead of browser `localStorage` or Vercel Blob where possible.
2. **Subscribe in client components with `@supabase/supabase-js`** using the anon key and Row Level Security, not service-role keys in the browser.
3. **Start with Postgres Changes for the first small internal surfaces** because it is the quickest to wire up and enough for Guido/Nick scale.
4. **Use Realtime Broadcast for the durable/scalable pattern** once the table set grows, especially for high-fanout pages like Production Plan if many rows/users are subscribed.
5. **Keep Monday-sourced data read-only and refresh/poll it** unless Monday webhooks are approved and connected into a Supabase mirror.

## What the Supabase docs say

Supabase documents two database-change options:

- **Broadcast**: recommended by Supabase for scalability and security. A Postgres trigger calls `realtime.broadcast_changes()` and clients subscribe to a private channel.
- **Postgres Changes**: simpler and lower setup. Add tables to the `supabase_realtime` publication and subscribe with `postgres_changes`, but it does not scale as well as Broadcast.

Key implementation details from the docs:

- Tables must be added to the `supabase_realtime` publication for Postgres Changes.
- Public schema tables work out of the box; private schemas need `SELECT` grants and careful RLS.
- If old row values are needed, set `replica identity full`, but be careful: RLS delete behavior has limitations and only primary keys may be available on delete with RLS.
- Realtime with RLS checks access for each changed row per subscriber, so high-volume Postgres Changes can hit performance limits.
- For Broadcast/private channels, Realtime Authorization uses RLS policies on `realtime.messages`; clients use `config: { private: true }`.

Sources checked:

- `https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.md`
- `https://supabase.com/docs/guides/realtime/postgres-changes.md`
- `https://supabase.com/docs/guides/realtime/broadcast.md`
- `https://supabase.com/docs/guides/realtime/authorization.md`

## Current Tuesday implications

Current patterns seen in the app:

- Production Plan server-loads Monday plan/orders via `getPlanWithFallback()` and `getOrdersWithFallback()`.
- Some Production Plan workflow state is saved through `/api/production/order-workflow` and read back with `fetch()`.
- Some older/demo surfaces still use browser `localStorage`, which cannot sync across computers.
- Tuesday already has Supabase direction for Leads/Workboard.
- This branch now adds a shared browser Supabase client and a `useRealtimeRefresh` hook.
- `@supabase/supabase-js` is now in `package.json` for browser Realtime subscriptions.
- Production order workflow storage remains blob-backed by default. Supabase workflow storage is opt-in via `TUESDAY_WORKFLOW_STORAGE=supabase` so we do not mutate live DB accidentally.

## Best architecture for Tuesday

### 1. Tuesday-owned tables: Supabase + Realtime

Use for:

- leads
- workboard tasks
- production/order workflow checklists
- Nick/Dylan task edits
- internal status/notes that Tuesday owns
- eventually freight quote log if approved

Pattern:

- Server routes keep using service role for trusted writes where needed.
- Browser uses anon key only.
- RLS allows authenticated/internal Tuesday users to read relevant rows and write only approved Tuesday-owned tables.
- Client components subscribe to relevant row/table changes and update state or trigger `router.refresh()`.

First pass code shape:

```ts
const channel = supabase
  .channel("production-order-workflow")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "production_order_workflows" },
    (payload) => {
      // merge changed row into React state, or router.refresh() for server-rendered lists
    },
  )
  .subscribe();
```

### 2. Monday-sourced tables: mirror first, then realtime from mirror

Monday.com itself should remain read-only unless Guido approves writes.

For Monday data:

- v1: keep manual refresh + short stale indicator.
- v1.5: background refresh/poll every 15-60 seconds while page is open for read-only views.
- v2: approved Monday webhook -> ingest into Supabase mirror tables -> Tuesday subscribes to mirror table changes.

This gives Monday-like realtime without every browser hitting Monday APIs or depending on Monday as the websocket source.

### 3. Broadcast vs Postgres Changes choice

Use **Postgres Changes first** for small, internal tables because:

- fastest implementation;
- no trigger functions needed;
- enough for 2-5 internal users;
- good for Leads and Workboard MVP.

Use **Broadcast** when:

- subscribing to broad/high-volume tables;
- many users may watch the same board;
- we want per-record/private topics, e.g. `topic:production_order:<id>`;
- we want better control over payloads and security.

For Tuesday, the sensible migration is:

1. Postgres Changes for `leads`, `work_tasks`, `production_order_workflows`.
2. Broadcast for full Production Plan board events after the schema stabilises.

## Implementation plan

### Phase A: foundations, low risk

1. Add `@supabase/supabase-js`. ✅
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` checks for the browser client. ✅
3. Add `lib/supabase/browser.ts` with a single `createBrowserSupabaseClient()` helper. ✅
4. Add a small `useRealtimeRefresh` hook. ✅
   - accepts table/topic config;
   - subscribes on mount;
   - debounces `router.refresh()` to avoid refresh storms;
   - cleans up on unmount;
   - returns connection state for future debug UI.

### Phase B: first useful surfaces

1. Leads:
   - subscribe to `public.leads` changes;
   - merge rows locally or call `router.refresh()`.
2. Workboard:
   - subscribe to `work_tasks`, `work_projects`, `work_sources`.
3. Production order workflow:
   - move/check current `/api/production/order-workflow` storage into Supabase table if not already;
   - subscribe by `order_id` when an order detail panel is open;
   - subscribe to board-level workflow updates for visible rows.

### Phase C: Monday-like board behaviour

1. Add `updated_at` and version fields to all shared editable tables.
2. Use optimistic UI: update locally immediately, then reconcile with server row.
3. On remote updates:
   - if the user is not editing that field, apply immediately;
   - if the user is editing, show a small "Updated elsewhere" prompt rather than overwriting typed text.
4. Add a tiny presence indicator later: "Nick viewing", "Dylan editing" using Supabase Presence if useful.

## SQL setup sketch

For a small first pass with Postgres Changes:

```sql
create table if not exists public.production_order_workflows (
  order_id bigint primary key,
  xero_invoice_number text,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter publication supabase_realtime add table public.leads;
alter publication supabase_realtime add table public.work_tasks;
alter publication supabase_realtime add table public.production_order_workflows;
```

Tuesday code only uses the Supabase workflow table when `TUESDAY_WORKFLOW_STORAGE=supabase` is set. Keep it unset until the table, RLS, and env vars are approved.

If previous values are needed for conflict handling:

```sql
alter table public.production_order_workflows replica identity full;
```

Do not run this until table names and RLS policies are confirmed.

## Risks / guardrails

- Do not expose service-role keys to browser code.
- Do not subscribe clients directly to customer-sensitive data before RLS is verified.
- Do not make Monday writes as part of realtime work.
- Do not store secrets or tokens in the repo.
- Avoid blanket subscriptions to large tables; filter by table/row/view where possible.
- Realtime should improve clarity, not create noisy UI movement for Nick.

## Recommendation

Build the first realtime slice on a Tuesday-owned table, not Monday.

Best candidate: **Production order workflow / task checkoffs**, because it is exactly the cross-computer Nick/Dylan/Guido use case and avoids customer-visible writes. After that, apply the same helper to Leads and Workboard.
