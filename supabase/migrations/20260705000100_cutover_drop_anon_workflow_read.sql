-- ============================================================================
-- Cutover: close the production_order_workflows anon exposure
-- ============================================================================
-- RUN ONLY AFTER:
--   1) 20260705000000_secure_realtime_broadcast.sql is applied (triggers live), and
--   2) the new frontend (broadcast-based use-realtime-refresh) is deployed, and
--   3) live realtime auto-refresh is verified working across two sessions.
--
-- Running this earlier would break auto-refresh on the currently-deployed app,
-- which still relies on the anon SELECT policy for postgres_changes.
-- ============================================================================

drop policy if exists "production workflow anon realtime read" on public.production_order_workflows;
