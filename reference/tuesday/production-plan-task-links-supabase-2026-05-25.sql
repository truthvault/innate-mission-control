-- Tuesday Production Plan task links/edits storage
-- Purpose: replace Vercel Blob document storage for /production/plan task links and edits
-- with a Supabase row that emits Postgres Realtime changes.
--
-- Rollout order:
-- 1. Apply this SQL in Supabase after reviewing the anon SELECT policy below.
-- 2. Migrate the current Vercel Blob JSON into this row, if production has existing links/edits.
-- 3. Set Vercel env TUESDAY_PLAN_TASK_STORAGE=supabase.
-- 4. Redeploy/promote and two-browser smoke /production/plan.

create table if not exists public.production_plan_task_links (
  id text primary key default 'current',
  links jsonb not null default '{}'::jsonb,
  task_edits jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint production_plan_task_links_singleton check (id = 'current'),
  constraint production_plan_task_links_links_object check (jsonb_typeof(links) = 'object'),
  constraint production_plan_task_links_task_edits_object check (jsonb_typeof(task_edits) = 'object')
);

insert into public.production_plan_task_links (id)
values ('current')
on conflict (id) do nothing;

alter table public.production_plan_task_links enable row level security;

-- Browser writes still go through the Next.js API route with the Supabase service role.
-- This SELECT policy is only to let Supabase Postgres Realtime deliver row changes to
-- the Tuesday browser client. It exposes the single low-sensitivity internal row to
-- holders of the public anon key, so review before applying.
drop policy if exists "Tuesday realtime read production plan task links" on public.production_plan_task_links;
create policy "Tuesday realtime read production plan task links"
  on public.production_plan_task_links
  for select
  to anon
  using (id = 'current');

alter table public.production_plan_task_links replica identity full;

-- Supabase errors if the table is already in the publication, so guard it.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'production_plan_task_links'
  ) then
    alter publication supabase_realtime add table public.production_plan_task_links;
  end if;
end $$;
