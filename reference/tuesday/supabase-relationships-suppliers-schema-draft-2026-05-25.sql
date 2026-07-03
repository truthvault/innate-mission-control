-- Innate / Tuesday relationship spine draft
-- Created 2026-05-25 for key suppliers/contacts such as Paul Quinlan / Northland tōtara.
-- Draft only. Do not apply without Guido approval.
-- Purpose: central source of truth for complicated long-term supplier/partner relationships,
-- separate from one-off leads/orders but linkable to emails, Drive folders, assets, content, orders, and timber/source facts.

create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organisation_type text not null default 'supplier_vendor'
    check (organisation_type in (
      'supplier_vendor',          -- sends invoices / sells goods or services to Innate
      'strategic_relationship',   -- important facilitator, provenance/source person, advisor, partner; may not invoice us
      'customer',
      'contractor',
      'iwi',
      'government',
      'media',
      'other'
    )),
  status text not null default 'active'
    check (status in ('active','watch','paused','archived')),
  priority text not null default 'normal'
    check (priority in ('strategic','high','normal','low')),
  website text,
  phone text,
  email text,
  location text,
  source_system text not null default 'supabase',
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (name)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  full_name text not null,
  role_title text,
  email text,
  phone text,
  relationship_type text not null default 'strategic_relationship_contact'
    check (relationship_type in ('supplier_vendor_contact','strategic_relationship_contact','customer_contact','contractor','other')),
  status text not null default 'active'
    check (status in ('active','watch','paused','archived')),
  priority text not null default 'normal'
    check (priority in ('strategic','high','normal','low')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (email),
  unique (full_name, organisation_id)
);

create table if not exists public.relationship_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  record_type text not null
    check (record_type in ('overview','meeting_note','email_summary','phone_call','supply_update','timber_source','pricing','legal_compliance','content_opportunity','todo','decision','risk','other')),
  title text not null,
  record_date date,
  summary text not null,
  next_action text,
  owner text,
  priority text not null default 'normal'
    check (priority in ('urgent','high','normal','low')),
  status text not null default 'open'
    check (status in ('open','waiting','done','parked','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.relationship_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  relationship_record_id uuid references public.relationship_records(id) on delete cascade,
  link_type text not null
    check (link_type in ('email_thread','gmail_message','drive_folder','drive_file','website_page','content_asset','order','lead','xero','monday','supabase_record','other')),
  label text not null,
  url text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (link_type, external_id)
);

create index if not exists organisations_type_priority_idx on public.organisations (organisation_type, priority, status);
create index if not exists contacts_org_idx on public.contacts (organisation_id);
create index if not exists contacts_email_idx on public.contacts (email);
create index if not exists relationship_records_org_idx on public.relationship_records (organisation_id, record_date desc);
create index if not exists relationship_records_contact_idx on public.relationship_records (contact_id, record_date desc);
create index if not exists relationship_records_type_status_idx on public.relationship_records (record_type, status, priority);
create index if not exists relationship_links_org_idx on public.relationship_links (organisation_id);
create index if not exists relationship_links_record_idx on public.relationship_links (relationship_record_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organisations_touch_updated_at on public.organisations;
create trigger organisations_touch_updated_at
before update on public.organisations
for each row execute function public.touch_updated_at();

drop trigger if exists contacts_touch_updated_at on public.contacts;
create trigger contacts_touch_updated_at
before update on public.contacts
for each row execute function public.touch_updated_at();

drop trigger if exists relationship_records_touch_updated_at on public.relationship_records;
create trigger relationship_records_touch_updated_at
before update on public.relationship_records
for each row execute function public.touch_updated_at();

comment on table public.organisations is 'Canonical Innate organisations: supplier-vendors who invoice us, strategic relationships/facilitators who may not invoice us, customers, contractors, iwi/government/media relationships.';
comment on table public.contacts is 'People linked to organisations, including key supplier/customer/partner contacts.';
comment on table public.relationship_records is 'Long-form relationship memory: meeting notes, supply updates, source/provenance facts, actions, risks, decisions.';
comment on table public.relationship_links is 'Links relationship spine to Gmail, Drive, content assets, orders, leads, Xero, Monday, and other source records.';

-- Suggested first seed after approval, not applied here:
-- organisation: Paul Quinlan / related entity TBC, organisation_type `strategic_relationship`, priority `strategic`.
-- contact email: pdq@pqla.co.nz, relationship_type `strategic_relationship_contact`.
-- link: Drive folder "Paul Quinlan photos from Innate Gmail"
-- initial records: relationship overview, 2021-2026 photo/email timeline, supply/compliance/provenance summary, current next actions.
