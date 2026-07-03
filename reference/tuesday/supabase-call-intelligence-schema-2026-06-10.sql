-- Innate / Tuesday call intelligence spine
-- Created 2026-06-10 for mobile-first Call -> Nuggets -> Tasks -> Waiting -> Explore workflow.
-- Purpose: keep source calls, extracted nuggets, and follow-up action items linked without muddying production work_tasks.

create extension if not exists pgcrypto;

create table if not exists public.source_captures (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_type text not null default 'call'
    check (source_type in ('call','meeting','voice_memo','email','document','internal_note','other')),
  source_date date,
  title text not null,
  summary text,
  transcript_path text,
  audio_path text,
  source_url text,
  captured_by text not null default 'Hermes',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.extracted_nuggets (
  id uuid primary key default gen_random_uuid(),
  source_capture_id uuid not null references public.source_captures(id) on delete cascade,
  nugget_type text not null
    check (nugget_type in ('contact','action','research','knowledge','opportunity','waiting','update')),
  title text not null,
  detail text,
  person_or_org text,
  priority text not null default 'normal'
    check (priority in ('urgent','high','normal','low')),
  status text not null default 'captured'
    check (status in ('captured','triaged','converted_to_action','waiting','done','parked','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_capture_id, nugget_type, title)
);

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  source_capture_id uuid references public.source_captures(id) on delete set null,
  source_nugget_id uuid references public.extracted_nuggets(id) on delete set null,
  title text not null,
  detail text,
  action_type text not null default 'task'
    check (action_type in ('task','waiting','research','follow_up','decision','other')),
  owner text not null default 'Guido',
  bucket text not null default 'this_week'
    check (bucket in ('today','this_week','waiting','research','explore','later')),
  status text not null default 'open'
    check (status in ('open','in_progress','waiting','done','parked','archived')),
  due_date date,
  priority text not null default 'normal'
    check (priority in ('urgent','high','normal','low')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (source_capture_id, title)
);

create index if not exists source_captures_source_date_idx on public.source_captures(source_date desc);
create index if not exists source_captures_source_type_idx on public.source_captures(source_type);
create index if not exists source_captures_created_at_idx on public.source_captures(created_at desc);

create index if not exists extracted_nuggets_capture_idx on public.extracted_nuggets(source_capture_id);
create index if not exists extracted_nuggets_type_idx on public.extracted_nuggets(nugget_type);
create index if not exists extracted_nuggets_status_idx on public.extracted_nuggets(status);
create index if not exists extracted_nuggets_priority_idx on public.extracted_nuggets(priority);

create index if not exists action_items_capture_idx on public.action_items(source_capture_id);
create index if not exists action_items_nugget_idx on public.action_items(source_nugget_id);
create index if not exists action_items_bucket_status_idx on public.action_items(bucket, status, priority);
create index if not exists action_items_due_date_idx on public.action_items(due_date);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists source_captures_touch_updated_at on public.source_captures;
create trigger source_captures_touch_updated_at
before update on public.source_captures
for each row execute function public.touch_updated_at();

drop trigger if exists extracted_nuggets_touch_updated_at on public.extracted_nuggets;
create trigger extracted_nuggets_touch_updated_at
before update on public.extracted_nuggets
for each row execute function public.touch_updated_at();

drop trigger if exists action_items_touch_updated_at on public.action_items;
create trigger action_items_touch_updated_at
before update on public.action_items
for each row execute function public.touch_updated_at();

comment on table public.source_captures is 'Raw source capture headers for calls, meetings, voice notes, documents, and internal notes. Store local transcript/audio paths or source URLs, not huge raw blobs by default.';
comment on table public.extracted_nuggets is 'Typed nuggets extracted from source_captures: contacts, actions, research, knowledge, opportunities, waiting, and updates.';
comment on table public.action_items is 'Light Tuesday action queue generated from source captures. Separate from production work_tasks until deliberately integrated.';
