-- Innate / Tuesday order customer mirror and private order documents
-- Created 2026-06-18 as a local/reference migration. Review before applying.
-- Goal: keep customer-visible promises/specs/documents visible in Tuesday without cluttering the production task view.

create extension if not exists pgcrypto;

-- Private Supabase Storage bucket. This insert is idempotent when run with service-role privileges.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-documents',
  'order-documents',
  false,
  52428800,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  document_kind text not null default 'other'
    check (document_kind in ('xero_invoice_pdf','customer_attachment','drawing','screenshot','other')),
  label text not null,
  filename text not null,
  content_type text,
  byte_size bigint,
  sha256 text,
  storage_bucket text not null default 'order-documents',
  storage_path text not null,
  source_system text not null default 'gmail',
  source_message_id text,
  source_thread_id text,
  source_attachment_ref text,
  source_url text,
  customer_visible boolean not null default true,
  sent_to_customer_at timestamptz,
  sort_order integer not null default 100,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  unique (order_id, sha256)
);

create index if not exists order_documents_order_id_idx on public.order_documents(order_id, sort_order, created_at);
create index if not exists order_documents_source_message_idx on public.order_documents(source_message_id);
create index if not exists order_documents_sha256_idx on public.order_documents(sha256);

create table if not exists public.order_customer_mirror (
  order_id uuid primary key references public.orders(id) on delete cascade,
  customer_known_summary text not null,
  approved_paid_for_summary text,
  lead_time_promise text,
  current_customer_known_spec text,
  source_message_id text,
  source_thread_id text,
  first_contact_at timestamptz,
  timeline jsonb not null default '[]'::jsonb,
  quirks_issues jsonb not null default '[]'::jsonb,
  communication_style_tags jsonb not null default '[]'::jsonb,
  communication_style_summary text,
  confidence text not null default 'medium'
    check (confidence in ('low','medium','high')),
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_customer_mirror_source_message_idx on public.order_customer_mirror(source_message_id);
create index if not exists order_customer_mirror_first_contact_idx on public.order_customer_mirror(first_contact_at);

drop trigger if exists order_documents_touch_updated_at on public.order_documents;
create trigger order_documents_touch_updated_at
before update on public.order_documents
for each row execute function public.touch_updated_at();

drop trigger if exists order_customer_mirror_touch_updated_at on public.order_customer_mirror;
create trigger order_customer_mirror_touch_updated_at
before update on public.order_customer_mirror
for each row execute function public.touch_updated_at();

comment on table public.order_documents is 'Private customer/order documents shown through Tuesday server-generated signed links. Raw Gmail attachment ids stay server/backfill-only.';
comment on column public.order_documents.source_attachment_ref is 'Internal source attachment identifier for de-dupe/provenance. Do not expose in UI routes.';
comment on table public.order_customer_mirror is 'Compact sourced mirror of what the customer has seen, approved, paid for, and expects.';
comment on column public.order_customer_mirror.timeline is 'Array of sourced customer/order events: date, title, detail, source, confidence.';
comment on column public.order_customer_mirror.source_metadata is 'Internal provenance such as Gmail/Xero/order_event refs and backfill script version.';

-- RLS / policy plan:
-- 1. Keep both tables service-role only for the first Tuesday implementation.
-- 2. Do not grant anon/authenticated direct select on public.order_documents or public.order_customer_mirror.
-- 3. Do not grant direct storage object reads to anon/authenticated. Tuesday API routes must use the service role to create short-lived signed URLs.
-- 4. If authenticated staff access is added later, gate rows through an internal staff claim and keep storage reads signed/proxied.
alter table public.order_documents enable row level security;
alter table public.order_customer_mirror enable row level security;

drop policy if exists "order_documents_service_role_all" on public.order_documents;
create policy "order_documents_service_role_all"
on public.order_documents
for all
to service_role
using (true)
with check (true);

drop policy if exists "order_customer_mirror_service_role_all" on public.order_customer_mirror;
create policy "order_customer_mirror_service_role_all"
on public.order_customer_mirror
for all
to service_role
using (true)
with check (true);

drop policy if exists "order_documents_bucket_service_role_all" on storage.objects;
create policy "order_documents_bucket_service_role_all"
on storage.objects
for all
to service_role
using (bucket_id = 'order-documents')
with check (bucket_id = 'order-documents');

-- Myriam / INV-1160 seed draft. Keep commented for review; scripts/backfill-myriam-customer-mirror.py is the safer dry-run/apply path.
-- insert into public.order_customer_mirror (
--   order_id,
--   customer_known_summary,
--   approved_paid_for_summary,
--   lead_time_promise,
--   current_customer_known_spec,
--   source_message_id,
--   source_thread_id,
--   timeline,
--   quirks_issues,
--   communication_style_tags,
--   communication_style_summary,
--   confidence,
--   source_metadata
-- )
-- select id,
--   'Customer received Xero invoice INV-1160 with stool design drawings and was asked to final-check the stool details before paying.',
--   'Payment confirms the order and secures the workshop slot.',
--   'Current lead time is approximately 6 weeks from payment, with Innate aiming to complete sooner.',
--   'The customer-known build spec is the stool details/drawings attached to the Xero-sent email.',
--   '19ece8926201ae63',
--   '19ece8926201ae63',
--   '[{"date":null,"title":"Xero invoice and drawings sent","detail":"Invoice INV-1160 email included attached stool design drawings and requested a final details check before payment.","source":"gmail:19ece8926201ae63","confidence":"high"},{"date":null,"title":"Payment confirms order","detail":"Email says payment confirms the order and secures the workshop slot.","source":"gmail:19ece8926201ae63","confidence":"high"}]'::jsonb,
--   '[]'::jsonb,
--   '["warm","clear-final-check-needed","payment-confirms-slot"]'::jsonb,
--   'Use clear, warm wording. The key risk is changing build details after payment because the email frames the attached specs as what Innate will build from.',
--   'high',
--   '{"invoice_number":"INV-1160","lead_id":"24ffdfad-4c7a-4bef-a87b-2e7752f8fdfe","financial_document_id":"6cb695a2-247a-4986-8846-20b71fb0601e","source":"Hermes evidence supplied 2026-06-18"}'::jsonb
-- from public.orders
-- where xero_invoice_number = 'INV-1160'
-- on conflict (order_id) do update set
--   customer_known_summary = excluded.customer_known_summary,
--   approved_paid_for_summary = excluded.approved_paid_for_summary,
--   lead_time_promise = excluded.lead_time_promise,
--   current_customer_known_spec = excluded.current_customer_known_spec,
--   source_message_id = excluded.source_message_id,
--   source_thread_id = excluded.source_thread_id,
--   timeline = excluded.timeline,
--   quirks_issues = excluded.quirks_issues,
--   communication_style_tags = excluded.communication_style_tags,
--   communication_style_summary = excluded.communication_style_summary,
--   confidence = excluded.confidence,
--   source_metadata = excluded.source_metadata;
