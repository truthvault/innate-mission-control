-- Tuesday Leads v1 schema draft
-- Purpose: make Tuesday/Supabase the forward source of truth for Innate lead management.
-- Apply manually in Supabase after approval. This file is a draft only.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  contact_name text,
  email text,
  phone text,
  source text,
  product_category text,
  estimated_value numeric(10,2),
  status text not null default 'new' check (status in ('new', 'qualifying', 'quoted', 'follow_up_due', 'waiting_on_customer', 'won', 'lost', 'parked')),
  priority text not null default 'normal' check (priority in ('hot', 'normal', 'low')),
  owner text,
  next_follow_up_at date,
  last_interaction_at timestamptz,
  last_interaction_summary text,
  next_action text,
  notes text,
  source_url text,
  source_system text not null default 'supabase',
  monday_item_id text,
  archived_at timestamptz
);

create index if not exists leads_active_status_idx on public.leads (archived_at, status);
create index if not exists leads_next_follow_up_idx on public.leads (next_follow_up_at);
create index if not exists leads_priority_follow_up_idx on public.leads (priority, next_follow_up_at);
create index if not exists leads_updated_idx on public.leads (updated_at desc);

-- Explicit Data API grants for newer Supabase projects where new public tables
-- are not automatically exposed to PostgREST. Tuesday writes use server-side
-- service credentials only; anon/authenticated access remains intentionally absent.
grant select, insert, update on public.leads to service_role;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();
