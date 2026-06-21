-- Innate / Tuesday sample dispatch spine
-- Created 2026-06-02 after Guido approval: Supabase tracks sample dispatches going forward.
-- Drive remains the photo/file store for now; Supabase stores records and Drive links.

create extension if not exists pgcrypto;

create table if not exists public.sample_dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_key text unique,
  lead_id uuid references public.leads(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  customer_name text not null,
  contact_name text,
  email text,
  phone text,
  status text not null default 'planned'
    check (status in ('planned','packed','photographed','sent','delivered','followed_up','returned','lost','cancelled')),
  priority text not null default 'normal'
    check (priority in ('hot','high','normal','low')),
  sample_items jsonb not null default '[]'::jsonb,
  species text,
  finish text,
  quantity integer,
  requested_at timestamptz,
  packed_at timestamptz,
  photographed_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  followed_up_at timestamptz,
  follow_up_at date,
  carrier text,
  tracking_number text,
  shipping_address_summary text,
  photo_status text not null default 'needed'
    check (photo_status in ('needed','photographed','missing','not_required')),
  photo_drive_folder_url text,
  photo_drive_file_urls jsonb not null default '[]'::jsonb,
  shopify_order_id text,
  gmail_thread_id text,
  gmail_message_id text,
  source_system text not null default 'supabase'
    check (source_system in ('supabase','gmail','shopify','monday','manual','hermes_reconstruction')),
  confidence text not null default 'confirmed'
    check (confidence in ('confirmed','likely','needs_confirmation')),
  next_action text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists sample_dispatches_lead_id_idx on public.sample_dispatches(lead_id);
create index if not exists sample_dispatches_order_id_idx on public.sample_dispatches(order_id);
create index if not exists sample_dispatches_status_idx on public.sample_dispatches(status);
create index if not exists sample_dispatches_photo_status_idx on public.sample_dispatches(photo_status);
create index if not exists sample_dispatches_follow_up_at_idx on public.sample_dispatches(follow_up_at);
create index if not exists sample_dispatches_sent_at_idx on public.sample_dispatches(sent_at);
create index if not exists sample_dispatches_email_idx on public.sample_dispatches(lower(email));
create index if not exists sample_dispatches_customer_name_idx on public.sample_dispatches(customer_name);

create table if not exists public.sample_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  sample_dispatch_id uuid not null references public.sample_dispatches(id) on delete cascade,
  event_type text not null,
  actor text,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sample_dispatch_events_dispatch_id_idx on public.sample_dispatch_events(sample_dispatch_id);
create index if not exists sample_dispatch_events_event_type_idx on public.sample_dispatch_events(event_type);

create table if not exists public.sample_dispatch_links (
  id uuid primary key default gen_random_uuid(),
  sample_dispatch_id uuid not null references public.sample_dispatches(id) on delete cascade,
  link_type text not null
    check (link_type in ('drive_folder','drive_file','gmail_thread','gmail_message','shopify_order','courier_tracking','monday_item','lead','order','other')),
  external_id text,
  label text not null,
  url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(sample_dispatch_id, link_type, external_id)
);

create index if not exists sample_dispatch_links_dispatch_id_idx on public.sample_dispatch_links(sample_dispatch_id);
create index if not exists sample_dispatch_links_link_type_idx on public.sample_dispatch_links(link_type);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sample_dispatches_touch_updated_at on public.sample_dispatches;
create trigger sample_dispatches_touch_updated_at
before update on public.sample_dispatches
for each row execute function public.touch_updated_at();

comment on table public.sample_dispatches is 'Innate sample dispatch source of truth. Tracks planned/sent/delivered/follow-up state; photos remain in Drive with links stored here.';
comment on column public.sample_dispatches.photo_status is 'Samples should be photographed before dispatch like normal orders; Drive links are recorded when available.';
comment on table public.sample_dispatch_events is 'Audit/status/touchpoint events for sample dispatches.';
comment on table public.sample_dispatch_links is 'External/internal references linked to a sample dispatch, including Drive/Gmail/Shopify/courier links.';

-- Seed reconstructed recent sample dispatches from Supabase/Gmail/Shopify audit on 2026-06-02.
with rows as (
  select * from (values
    (
      'sample-2026-05-quintin-erueti-totara',
      'Te Runanga o Kirikiriroa - Quintin Erueti',
      'Quintin Erueti',
      'qerueti@terunanga.org.nz',
      'delivered',
      'hot',
      '[{"species":"Northland tōtara","description":"tōtara samples"}]'::jsonb,
      'Northland tōtara',
      null,
      null::integer,
      null::timestamptz,
      '2026-05-19 12:00:00+12'::timestamptz,
      '2026-05-22 12:00:00+12'::timestamptz,
      '2026-05-29'::date,
      null,
      null,
      '59 Higgins Road, Frankton, Hamilton',
      'missing',
      null,
      '[]'::jsonb,
      null,
      '19e1a83ee8af2e24',
      'gmail',
      'confirmed',
      'Waiting on customer after follow-up/voicemail; keep as hot lead.',
      'Reconstructed from Supabase lead notes and Gmail. Notes say tōtara samples were sent to Hamilton and later delivered.',
      '{"reconstructed_at":"2026-06-02","evidence":"Supabase lead notes + Gmail sample/courier context"}'::jsonb
    ),
    (
      'sample-2026-05-amanda-lawrey-rimu',
      'Amanda Lawrey',
      'Amanda Lawrey',
      'mandsnz@gmail.com',
      'sent',
      'normal',
      '[{"species":"West Coast Rimu","description":"rimu sample"}]'::jsonb,
      'West Coast Rimu',
      null,
      null::integer,
      null::timestamptz,
      '2026-05-18 12:00:00+12'::timestamptz,
      null::timestamptz,
      '2026-05-29'::date,
      'NZ Post Courier Non-Signature',
      'LV245591293NZ',
      null,
      'missing',
      null,
      '[]'::jsonb,
      null,
      null,
      'supabase',
      'confirmed',
      'Waiting on customer after follow-up.',
      'Supabase notes say rimu sample sent 2026-05-18; tracking LV 245 591 293 NZ; follow-up sent 2026-05-22.',
      '{"reconstructed_at":"2026-06-02","tracking_raw":"LV 245 591 293 NZ"}'::jsonb
    ),
    (
      'sample-2026-05-jtb-architects-pack',
      'JTB Architects - Diana Shchukin',
      'Diana Shchukin / Sinead Satherley',
      'sinead.satherley@jtbarchitects.co.nz',
      'delivered',
      'normal',
      '[{"description":"sample pack"}]'::jsonb,
      null,
      null,
      null::integer,
      '2026-05-07 12:00:00+12'::timestamptz,
      '2026-05-09 12:00:00+12'::timestamptz,
      '2026-05-22 12:00:00+12'::timestamptz,
      '2026-05-29'::date,
      'Fast courier',
      null,
      null,
      'missing',
      null,
      '[]'::jsonb,
      null,
      '19e05ccafa8c07a4',
      'gmail',
      'confirmed',
      'Waiting on customer/specifier project movement.',
      'Gmail says sample pack requested 2026-05-07 and Guido said 2026-05-08 it would go fast courier next day; 2026-05-22 call note says samples arrived/looked great.',
      '{"reconstructed_at":"2026-06-02","gmail_message_id":"19e05ccafa8c07a4"}'::jsonb
    ),
    (
      'sample-2026-05-greg-jarman',
      'Greg Jarman',
      'Greg Jarman',
      'gergmanjar@gmail.com',
      'delivered',
      'low',
      '[{"description":"timber samples"}]'::jsonb,
      null,
      null,
      null::integer,
      null::timestamptz,
      null::timestamptz,
      '2026-05-14 12:00:00+12'::timestamptz,
      null::date,
      null,
      null,
      null,
      'missing',
      null,
      '[]'::jsonb,
      null,
      null,
      'supabase',
      'confirmed',
      'Low conversion unless board-width concern can be addressed.',
      'Supabase/Gmail evidence says Greg confirmed on 2026-05-14: Yes I got the samples ok; he was not excited by narrow board width.',
      '{"reconstructed_at":"2026-06-02"}'::jsonb
    ),
    (
      'sample-2026-05-sherry-cai-order-1333-replacement',
      'Sherry Cai',
      'Liling Cai / Sherry',
      'caililingsherry913@gmail.com',
      'sent',
      'normal',
      '[{"species":"West Coast Rimu","finish":"Country Bark","description":"replacement sample after one sample broke in shipping"}]'::jsonb,
      'West Coast Rimu',
      'Country Bark',
      null::integer,
      null::timestamptz,
      '2026-05-22 13:33:00+12'::timestamptz,
      null::timestamptz,
      null::date,
      null,
      'LV2407550185NZ',
      null,
      'missing',
      null,
      '[]'::jsonb,
      '1333',
      '19e4d50cb3eaa19b',
      'shopify',
      'confirmed',
      'Waiting on customer after replacement sample.',
      'Shopify order #1333 samples arrived 2026-05-22; one Country Bark sample broke. Guido replied that replacement West Coast Rimu - Country Bark sample would be sent.',
      '{"reconstructed_at":"2026-06-02","original_broken_sample_message_id":"19e4cea05a09bd7e","tracking_raw":"LV2407550185NZ"}'::jsonb
    ),
    (
      'sample-2026-05-angela-lieskounig',
      'Angela Lieskounig',
      'Angela Lieskounig',
      'apoutu007@gmail.com',
      'delivered',
      'normal',
      '[{"description":"timber samples"}]'::jsonb,
      null,
      null,
      null::integer,
      null::timestamptz,
      null::timestamptz,
      '2026-05-19 12:00:00+12'::timestamptz,
      null::date,
      null,
      null,
      null,
      'missing',
      null,
      '[]'::jsonb,
      null,
      null,
      'supabase',
      'confirmed',
      'Sample colour/spec issue needs care: customer said colours were too red; possible clear/natural vs Country Bark mismatch.',
      'Angela confirmed 2026-05-19 she received timber samples; colour mismatch/risk noted.',
      '{"reconstructed_at":"2026-06-02"}'::jsonb
    )
  ) as v(dispatch_key, customer_name, contact_name, email, status, priority, sample_items, species, finish, quantity, requested_at, sent_at, delivered_at, follow_up_at, carrier, tracking_number, shipping_address_summary, photo_status, photo_drive_folder_url, photo_drive_file_urls, shopify_order_id, gmail_message_id, source_system, confidence, next_action, notes, metadata)
), matched as (
  select
    rows.*,
    l.id as lead_id
  from rows
  left join lateral (
    select id
    from public.leads
    where lower(coalesce(email,'')) = lower(rows.email)
       or lower(customer_name) = lower(rows.customer_name)
       or lower(coalesce(contact_name,'')) = lower(rows.contact_name)
    order by updated_at desc nulls last
    limit 1
  ) l on true
), upserted as (
  insert into public.sample_dispatches (
    dispatch_key, lead_id, customer_name, contact_name, email, status, priority,
    sample_items, species, finish, quantity, requested_at, sent_at, delivered_at,
    follow_up_at, carrier, tracking_number, shipping_address_summary, photo_status,
    photo_drive_folder_url, photo_drive_file_urls, shopify_order_id, gmail_message_id,
    source_system, confidence, next_action, notes, metadata
  )
  select
    dispatch_key, lead_id, customer_name, contact_name, email, status, priority,
    sample_items, species, finish, quantity, requested_at, sent_at, delivered_at,
    follow_up_at, carrier, tracking_number, shipping_address_summary, photo_status,
    photo_drive_folder_url, photo_drive_file_urls, shopify_order_id, gmail_message_id,
    source_system, confidence, next_action, notes, metadata
  from matched
  on conflict (dispatch_key) do update set
    lead_id = excluded.lead_id,
    customer_name = excluded.customer_name,
    contact_name = excluded.contact_name,
    email = excluded.email,
    status = excluded.status,
    priority = excluded.priority,
    sample_items = excluded.sample_items,
    species = excluded.species,
    finish = excluded.finish,
    quantity = excluded.quantity,
    requested_at = excluded.requested_at,
    sent_at = excluded.sent_at,
    delivered_at = excluded.delivered_at,
    follow_up_at = excluded.follow_up_at,
    carrier = excluded.carrier,
    tracking_number = excluded.tracking_number,
    shipping_address_summary = excluded.shipping_address_summary,
    photo_status = excluded.photo_status,
    photo_drive_folder_url = excluded.photo_drive_folder_url,
    photo_drive_file_urls = excluded.photo_drive_file_urls,
    shopify_order_id = excluded.shopify_order_id,
    gmail_message_id = excluded.gmail_message_id,
    source_system = excluded.source_system,
    confidence = excluded.confidence,
    next_action = excluded.next_action,
    notes = excluded.notes,
    metadata = public.sample_dispatches.metadata || excluded.metadata
  returning id, dispatch_key
)
insert into public.sample_dispatch_events (sample_dispatch_id, event_type, actor, note, metadata)
select id,
  'reconstructed_from_existing_records',
  'Hermes',
  'Initial sample dispatch record reconstructed from Supabase/Gmail/Shopify evidence on 2026-06-02 after Guido approved Supabase sample tracking.',
  jsonb_build_object('dispatch_key', dispatch_key)
from upserted
where not exists (
  select 1 from public.sample_dispatch_events e
  where e.sample_dispatch_id = upserted.id
    and e.event_type = 'reconstructed_from_existing_records'
);
