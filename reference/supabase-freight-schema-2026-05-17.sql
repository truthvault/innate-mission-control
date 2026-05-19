-- Innate Mission Control freight logging schema
-- Created for moving freight/configurator event logs from Airtable-style storage to Supabase.

create extension if not exists pgcrypto;

create table if not exists public.freight_quote_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text,
  product_area text not null default 'unknown',
  configurator_type text,
  product_handle text,
  variant_title text,
  variant_id text,
  table_length_mm integer,
  table_width_mm integer,
  bench_count integer,
  base_family text,
  address_entered text,
  suburb text,
  city text,
  postcode text,
  country_code text default 'NZ',
  client_ip_hash text,
  is_internal_test boolean not null default false,
  internal_test_reasons text[] not null default '{}',
  source text,
  page_url text,
  referer text,
  user_agent text,
  estimate_incl_gst numeric(10,2),
  raw_mainfreight_incl_gst numeric(10,2),
  raw_mainfreight_ex_gst numeric(10,2),
  manual_check_offered boolean not null default false,
  package_items integer,
  total_cubic_metres numeric(10,3),
  total_weight_kg numeric(10,2),
  package_summary text,
  package_lines jsonb,
  selected_options_json jsonb,
  destination_json jsonb,
  result_json jsonb,
  raw_carrier_quote_json jsonb,
  source_system text not null default 'mission_control'
);

create index if not exists freight_quote_events_created_at_idx on public.freight_quote_events (created_at desc);
create index if not exists freight_quote_events_product_area_created_idx on public.freight_quote_events (product_area, created_at desc);
create index if not exists freight_quote_events_internal_created_idx on public.freight_quote_events (is_internal_test, created_at desc);
create index if not exists freight_quote_events_status_created_idx on public.freight_quote_events (status, created_at desc);
create index if not exists freight_quote_events_product_handle_created_idx on public.freight_quote_events (product_handle, created_at desc);

alter table public.freight_quote_events enable row level security;

drop view if exists public.customer_freight_quote_events;
create view public.customer_freight_quote_events as
select *
from public.freight_quote_events
where is_internal_test is not true;

comment on table public.freight_quote_events is 'Server-side freight calculator quote/event log for Innate Mission Control. Written by service role only; RLS enabled with no public write policy.';
comment on column public.freight_quote_events.client_ip_hash is 'Salted hash only; raw visitor IP is not stored.';
comment on column public.freight_quote_events.is_internal_test is 'True for Guido/internal/test traffic detected by IP hash, source, dry-run, or future test markers.';
