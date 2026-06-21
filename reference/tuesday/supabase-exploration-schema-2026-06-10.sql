-- Innate / Tuesday exploration spine
-- Created 2026-06-10 after Guido approved a Supabase area for ideas, tool upgrades, and future exploration.
-- Purpose: low-friction capture of future possibilities without muddying work_tasks or content_items.

create extension if not exists pgcrypto;

create table if not exists public.exploration_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general'
    check (category in ('tool_upgrade','workshop_capability','product_idea','process_improvement','marketing_idea','automation','supplier_or_material','general')),
  area text not null default 'strategy'
    check (area in ('workshop','sales','website','production','content','systems','strategy','operations')),
  status text not null default 'captured'
    check (status in ('captured','triage_next','researching','trial_candidate','approved_to_trial','adopted','rejected','parked')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  horizon text not null default 'later'
    check (horizon in ('now','soon','later','someday')),
  summary text not null,
  why_it_matters text,
  possible_use_cases text,
  risks_or_unknowns text,
  next_action text,
  source_url text unique,
  source_type text
    check (source_type is null or source_type in ('youtube','website','conversation','supplier','customer','document','image','internal_note','other')),
  owner_profile text not null default 'Hermes',
  impact_score integer check (impact_score is null or impact_score between 1 and 5),
  effort_score integer check (effort_score is null or effort_score between 1 and 5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists exploration_items_category_idx on public.exploration_items(category);
create index if not exists exploration_items_area_idx on public.exploration_items(area);
create index if not exists exploration_items_status_idx on public.exploration_items(status);
create index if not exists exploration_items_priority_idx on public.exploration_items(priority);
create index if not exists exploration_items_horizon_idx on public.exploration_items(horizon);
create index if not exists exploration_items_owner_profile_idx on public.exploration_items(owner_profile);
create index if not exists exploration_items_created_at_idx on public.exploration_items(created_at desc);

create table if not exists public.exploration_events (
  id uuid primary key default gen_random_uuid(),
  exploration_item_id uuid not null references public.exploration_items(id) on delete cascade,
  event_type text not null,
  actor text,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists exploration_events_item_id_idx on public.exploration_events(exploration_item_id);
create index if not exists exploration_events_event_type_idx on public.exploration_events(event_type);
create index if not exists exploration_events_created_at_idx on public.exploration_events(created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists exploration_items_touch_updated_at on public.exploration_items;
create trigger exploration_items_touch_updated_at
before update on public.exploration_items
for each row execute function public.touch_updated_at();

comment on table public.exploration_items is 'Innate/Tues exploration backlog for ideas, tool upgrades, workshop capability, automations, and future brain-dump items. Not the execution task list and not the content bank.';
comment on table public.exploration_events is 'Audit/research/decision notes attached to exploration_items.';
comment on column public.exploration_items.impact_score is 'Rough 1-5 potential upside score; use only after light triage.';
comment on column public.exploration_items.effort_score is 'Rough 1-5 adoption effort score; use only after light triage.';
