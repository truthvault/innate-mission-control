-- Tuesday Production Plan task links/edits storage
--
-- Current rollout does not require a new table. It stores the singleton production-plan
-- task-link/edit document in the existing Supabase realtime table:
--   public.production_order_workflows
-- using sentinel row:
--   order_id = 0
--
-- Reason: this table already exists, already has the Tuesday service-role write path,
-- and already has anon SELECT/Reatime policy for internal workflow updates.
-- Browser writes still go through the Next.js API route. The browser only subscribes
-- to Postgres Realtime changes for `order_id=eq.0`.
--
-- Optional verification SQL for the dashboard/sql editor:

select order_id, updated_at, state
from public.production_order_workflows
where order_id = 0;

-- Optional rollback of only the production-plan sentinel row, if explicitly approved:
-- delete from public.production_order_workflows where order_id = 0;
