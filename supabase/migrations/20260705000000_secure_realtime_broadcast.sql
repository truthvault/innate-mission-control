-- ============================================================================
-- Secure realtime: replace anon table-read with data-less broadcast signals
-- ============================================================================
-- Problem: the browser realtime auto-refresh subscribed to `postgres_changes`,
-- which required an `anon` SELECT policy on the underlying tables. That policy
-- (`production workflow anon realtime read`, USING (true)) exposed
-- production_order_workflows rows to the public anon key over REST.
--
-- Every realtime consumer in the app only uses the event as a trigger to
-- refetch server-side (router.refresh() / loadWorkflow()); none read the row
-- payload. So we broadcast ONLY a signal — {table, op}, no row columns — over a
-- PRIVATE Realtime channel. Result: live updates keep working, but zero table
-- data ever crosses realtime, and no anon SELECT policy on the tables is needed.
-- ============================================================================

-- 1) Trigger fn: send a data-less change signal to a per-table private topic.
create or replace function public.broadcast_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'table', tg_table_name,
      'op', tg_op,
      -- only the order id (a non-sensitive int) so the client can skip the
      -- sentinel row; NO PII / costing / other row columns are broadcast.
      'order_id', coalesce(to_jsonb(new) ->> 'order_id', to_jsonb(old) ->> 'order_id')
    ),
    'change',
    'rt:' || tg_table_name,
    true                                                       -- private channel
  );
  return null;
end;
$$;

-- 2) Attach to the three realtime-backed tables.
drop trigger if exists zz_broadcast_change on public.production_order_workflows;
create trigger zz_broadcast_change
  after insert or update or delete on public.production_order_workflows
  for each row execute function public.broadcast_table_change();

drop trigger if exists zz_broadcast_change on public.production_order_tasks;
create trigger zz_broadcast_change
  after insert or update or delete on public.production_order_tasks
  for each row execute function public.broadcast_table_change();

drop trigger if exists zz_broadcast_change on public.order_intake_reviews;
create trigger zz_broadcast_change
  after insert or update or delete on public.order_intake_reviews
  for each row execute function public.broadcast_table_change();

-- 3) Authorize the anon role to RECEIVE (only) these signal broadcasts.
--    Read-only, scoped to rt:* broadcast topics. Carries no table data.
drop policy if exists "anon receive rt change signals" on realtime.messages;
create policy "anon receive rt change signals"
  on realtime.messages
  for select
  to anon
  using ( extension = 'broadcast' and (select realtime.topic()) like 'rt:%' );

-- NOTE: this migration is ADDITIVE and safe to apply at any time — the triggers
-- just broadcast, and the receive policy only grants signal access. The old
-- `postgres_changes` path keeps working until the new frontend is deployed.
-- The exposure-closing step (dropping the anon table-read policy) is a SEPARATE
-- cutover migration (20260705000100) that must run ONLY AFTER the new frontend
-- is deployed and live realtime is verified — otherwise the currently-deployed
-- app loses auto-refresh.

-- ---------------------------------------------------------------------------
-- ROLLBACK:
--   drop trigger if exists zz_broadcast_change on public.production_order_workflows;
--   drop trigger if exists zz_broadcast_change on public.production_order_tasks;
--   drop trigger if exists zz_broadcast_change on public.order_intake_reviews;
--   drop function if exists public.broadcast_table_change();
--   drop policy if exists "anon receive rt change signals" on realtime.messages;
--   (re-add the old anon read policy only if reverting to the insecure approach)
-- ---------------------------------------------------------------------------
