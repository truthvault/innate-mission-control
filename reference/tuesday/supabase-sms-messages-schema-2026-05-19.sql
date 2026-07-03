-- Innate Tuesday / 2talk SMS message log
-- Apply in Supabase SQL editor after review.
-- This stores administrative/customer-service SMS only. Not for marketing campaigns.

create extension if not exists pgcrypto;

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_id uuid references public.leads(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default '2talk',
  provider_message_id text,
  from_number text,
  from_number_normalized text,
  to_number text,
  to_number_normalized text,
  message_body text not null,
  status text not null default 'received',
  received_at timestamptz,
  sent_at timestamptz,
  raw_payload jsonb,
  error text
);

create index if not exists sms_messages_created_at_idx on public.sms_messages (created_at desc);
create index if not exists sms_messages_lead_id_idx on public.sms_messages (lead_id);
create index if not exists sms_messages_from_number_normalized_idx on public.sms_messages (from_number_normalized);
create index if not exists sms_messages_to_number_normalized_idx on public.sms_messages (to_number_normalized);
create unique index if not exists sms_messages_provider_message_id_idx
  on public.sms_messages (provider, provider_message_id)
  where provider_message_id is not null;

create or replace function public.set_sms_messages_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sms_messages_updated_at on public.sms_messages;
create trigger sms_messages_updated_at
before update on public.sms_messages
for each row execute function public.set_sms_messages_updated_at();
