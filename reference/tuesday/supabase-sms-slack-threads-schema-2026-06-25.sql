-- Innate Tuesday / SMS Slack thread mapping
-- Apply in Supabase SQL editor only after review and approval.
-- This lets Slack thread replies map back to the original customer number.

create extension if not exists pgcrypto;

create table if not exists public.sms_slack_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  inbound_sms_id uuid references public.sms_messages(id) on delete set null,
  last_outbound_sms_id uuid references public.sms_messages(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  slack_channel_id text not null,
  slack_message_ts text not null,
  slack_thread_ts text not null,
  customer_number text,
  customer_number_normalized text not null,
  service_number text,
  service_number_normalized text,
  status text not null default 'active',
  raw_payload jsonb
);

create unique index if not exists sms_slack_threads_channel_thread_uidx
  on public.sms_slack_threads (slack_channel_id, slack_thread_ts);

create index if not exists sms_slack_threads_customer_number_idx
  on public.sms_slack_threads (customer_number_normalized);

create index if not exists sms_slack_threads_inbound_sms_idx
  on public.sms_slack_threads (inbound_sms_id);

create index if not exists sms_slack_threads_lead_id_idx
  on public.sms_slack_threads (lead_id);

create or replace function public.set_sms_slack_threads_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sms_slack_threads_updated_at on public.sms_slack_threads;
create trigger sms_slack_threads_updated_at
before update on public.sms_slack_threads
for each row execute function public.set_sms_slack_threads_updated_at();
