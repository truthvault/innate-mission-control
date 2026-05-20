-- Tuesday Workboard MVP schema draft
-- Review-only until Guido explicitly approves applying to Supabase production.

create extension if not exists pgcrypto;

create table if not exists public.work_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('meeting', 'voice_note', 'email_thread', 'manual_note', 'import', 'other')),
  title text not null,
  source_date date,
  people jsonb not null default '[]'::jsonb,
  summary text,
  file_path text,
  transcript_path text,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.work_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null check (area in ('leads', 'website', 'marketing', 'commercial', 'customer_journey', 'production', 'materials', 'systems', 'admin')),
  status text not null default 'active' check (status in ('active', 'waiting', 'parked', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('cash', 'high', 'normal', 'later')),
  owner text,
  description text,
  source_id uuid references public.work_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.work_projects(id) on delete set null,
  source_id uuid references public.work_sources(id) on delete set null,
  title text not null,
  description text,
  area text not null check (area in ('leads', 'website', 'marketing', 'commercial', 'customer_journey', 'production', 'materials', 'systems', 'admin')),
  status text not null default 'inbox' check (status in ('inbox', 'next', 'in_progress', 'waiting', 'done', 'parked', 'cancelled')),
  priority text not null default 'normal' check (priority in ('cash', 'high', 'normal', 'later')),
  owner text,
  due_date date,
  related_lead_id text,
  related_order_id text,
  related_url text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists work_sources_title_idx on public.work_sources(title);
create index if not exists work_projects_source_id_idx on public.work_projects(source_id);
create index if not exists work_projects_status_priority_idx on public.work_projects(status, priority);
create index if not exists work_projects_name_idx on public.work_projects(name);
create index if not exists work_tasks_project_id_idx on public.work_tasks(project_id);
create index if not exists work_tasks_source_id_idx on public.work_tasks(source_id);
create index if not exists work_tasks_status_priority_idx on public.work_tasks(status, priority, due_date, sort_order);
create index if not exists work_tasks_owner_idx on public.work_tasks(owner);
create index if not exists work_tasks_title_idx on public.work_tasks(title);
