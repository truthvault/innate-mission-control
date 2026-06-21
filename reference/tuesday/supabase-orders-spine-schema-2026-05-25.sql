-- Innate / Tuesday dedicated orders spine
-- Created 2026-05-25 as a target dedicated orders spine.
-- Current rule as of 2026-06-15: Supabase/Tuesday is forward truth for approved Tuesday-owned records; Monday remains current workshop/legacy truth for production tasks, stock, and customer history until migration gates are met.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique,
  customer_name text not null,
  contact_name text,
  email text,
  phone text,
  status text not null default 'active'
    check (status in ('inbox','quoted','awaiting_payment','active','in_production','finished','awaiting_dispatch','booked','delivered','complete','paused','cancelled')),
  priority text not null default 'normal'
    check (priority in ('cash','high','normal','later')),
  owner text,
  item_category text,
  product_summary text,
  spec jsonb not null default '{}'::jsonb,
  delivery jsonb not null default '{}'::jsonb,
  order_date date,
  paid_on_date date,
  due_date date,
  finished_date date,
  delivered_date date,
  total_incl_gst numeric,
  currency text not null default 'NZD',
  xero_invoice_number text unique,
  xero_invoice_id text unique,
  xero_invoice_url text,
  xero_quote_number text,
  shopify_order_id text,
  monday_order_item_id text unique,
  monday_production_plan_item_id text,
  source_system text not null default 'supabase',
  source_url text,
  next_action text,
  next_follow_up_at date,
  last_customer_touch_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_priority_idx on public.orders(priority);
create index if not exists orders_due_date_idx on public.orders(due_date);
create index if not exists orders_next_follow_up_at_idx on public.orders(next_follow_up_at);
create index if not exists orders_customer_name_idx on public.orders(customer_name);
create index if not exists orders_xero_invoice_number_idx on public.orders(xero_invoice_number);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null,
  description text,
  quantity numeric not null default 1,
  unit_amount numeric,
  line_amount numeric,
  spec jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor text,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_idx on public.order_events(order_id);
create index if not exists order_events_event_type_idx on public.order_events(event_type);

create table if not exists public.order_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  link_type text not null
    check (link_type in ('xero_invoice','xero_quote','monday_order','monday_production_plan','work_source','work_project','work_task','shopify_order','email_thread','other')),
  external_id text,
  label text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(order_id, link_type, external_id)
);

create index if not exists order_links_order_id_idx on public.order_links(order_id);
create index if not exists order_links_link_type_idx on public.order_links(link_type);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists order_items_touch_updated_at on public.order_items;
create trigger order_items_touch_updated_at
before update on public.order_items
for each row execute function public.touch_updated_at();

comment on table public.orders is 'Innate/Tues target orders spine for approved Tuesday-owned records. Monday remains current workshop/legacy truth until migration gates are met.';
comment on table public.order_items is 'Line/spec items under the Supabase orders spine.';
comment on table public.order_events is 'Audit/status/touchpoint events under the Supabase orders spine.';
comment on table public.order_links is 'External/internal references linked to Supabase orders; Monday links may still point to current workshop/legacy truth during transition.';

-- Seed/backfill current missing-order correction.
insert into public.orders (
  order_code,
  customer_name,
  status,
  priority,
  owner,
  item_category,
  product_summary,
  spec,
  delivery,
  order_date,
  paid_on_date,
  due_date,
  total_incl_gst,
  currency,
  xero_invoice_number,
  xero_invoice_id,
  xero_invoice_url,
  xero_quote_number,
  monday_order_item_id,
  monday_production_plan_item_id,
  source_system,
  source_url,
  next_action,
  next_follow_up_at,
  notes
) values (
  'INV-1143',
  'Janette and Michael Sharp',
  'active',
  'cash',
  'Nick',
  'Table',
  'Custom dining table, 1800 x 850 x 760mm, tōtara, blackwash, reverse angled black steel base.',
  '{"item":"Custom dining table","dimensions":"1800 x 850 x 760mm","timber":"Tōtara","finish":"Blackwash","base":"Reverse angled steel, black powdercoat","extras":"Slightly rounded corners, approximately half the radius of the showroom tōtara sample"}'::jsonb,
  '{"type":"local_delivery","location":"St Albans, Christchurch","address":"TBC before delivery"}'::jsonb,
  '2026-05-20',
  '2026-05-21',
  '2026-07-01',
  3260,
  'NZD',
  'INV-1143',
  '8e0bcf51-86b6-498f-914a-f931ea2553b1',
  'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=8e0bcf51-86b6-498f-914a-f931ea2553b1',
  'QU-0114',
  '12095497478',
  '12095594366',
  'supabase',
  'https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=8e0bcf51-86b6-498f-914a-f931ea2553b1',
  'Workshop spec/material check first; delivery address TBC before delivery.',
  '2026-05-26',
  'Created from Xero/Monday reconciliation. Current rule: Supabase/Tuesday is forward truth for approved Tuesday-owned records; Monday remains workshop/legacy truth until migration gates are met.'
)
on conflict (xero_invoice_number) do update set
  customer_name = excluded.customer_name,
  status = excluded.status,
  priority = excluded.priority,
  owner = excluded.owner,
  item_category = excluded.item_category,
  product_summary = excluded.product_summary,
  spec = excluded.spec,
  delivery = excluded.delivery,
  order_date = excluded.order_date,
  paid_on_date = excluded.paid_on_date,
  due_date = excluded.due_date,
  total_incl_gst = excluded.total_incl_gst,
  xero_invoice_id = excluded.xero_invoice_id,
  xero_invoice_url = excluded.xero_invoice_url,
  xero_quote_number = excluded.xero_quote_number,
  monday_order_item_id = excluded.monday_order_item_id,
  monday_production_plan_item_id = excluded.monday_production_plan_item_id,
  source_url = excluded.source_url,
  next_action = excluded.next_action,
  next_follow_up_at = excluded.next_follow_up_at,
  notes = excluded.notes;

insert into public.order_items (order_id, title, description, quantity, unit_amount, line_amount, spec, sort_order)
select id,
  'Custom Dining Table',
  'Dimensions: 1800x850x760mm. Timber: Tōtara. Colour/finish: blackwash. Base: Reverse angled steel, black powdercoat. Extras: slightly rounded corners, approximately half the radius of the showroom tōtara sample.',
  1,
  2695.65,
  2695.65,
  '{"dimensions":"1800 x 850 x 760mm","timber":"Tōtara","finish":"Blackwash","base":"Reverse angled steel, black powdercoat"}'::jsonb,
  10
from public.orders
where xero_invoice_number = 'INV-1143'
and not exists (
  select 1 from public.order_items oi where oi.order_id = public.orders.id and oi.title = 'Custom Dining Table'
);

insert into public.order_items (order_id, title, description, quantity, unit_amount, line_amount, spec, sort_order)
select id,
  'Local Delivery',
  'Location: St Albans, Christchurch. Address: TBC before delivery.',
  1,
  139.13,
  139.13,
  '{"location":"St Albans, Christchurch","address":"TBC before delivery"}'::jsonb,
  20
from public.orders
where xero_invoice_number = 'INV-1143'
and not exists (
  select 1 from public.order_items oi where oi.order_id = public.orders.id and oi.title = 'Local Delivery'
);

insert into public.order_events (order_id, event_type, actor, note, metadata)
select id,
  'created_from_reconciliation',
  'Hermes',
  'Dedicated Supabase orders spine created and Janette/Michael Sharp order seeded after Guido correction. Current rule: Monday remains workshop/legacy truth until migration gates are met.',
  '{"xero_invoice_number":"INV-1143","monday_order_item_id":"12095497478","monday_production_plan_item_id":"12095594366"}'::jsonb
from public.orders
where xero_invoice_number = 'INV-1143'
and not exists (
  select 1 from public.order_events oe where oe.order_id = public.orders.id and oe.event_type = 'created_from_reconciliation'
);
