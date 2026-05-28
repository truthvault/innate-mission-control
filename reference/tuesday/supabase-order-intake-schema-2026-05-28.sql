-- Supabase-first production order intake spine.
-- Tuesday is the source of truth; Xero/Akahu are evidence; Monday is not mutated.

create extension if not exists pgcrypto;

create table if not exists public.order_financial_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  document_type text not null default 'xero_invoice'
    check (document_type in ('xero_quote','xero_invoice','xero_credit_note','manual_adjustment')),
  xero_quote_number text,
  xero_quote_id text,
  xero_invoice_number text,
  xero_invoice_id text,
  xero_invoice_url text,
  contact_name text,
  contact_email text,
  status text,
  sent_at timestamptz,
  issued_at date,
  due_at date,
  subtotal numeric,
  tax numeric,
  total numeric,
  amount_paid numeric,
  amount_due numeric,
  currency text not null default 'NZD',
  line_items jsonb not null default '[]'::jsonb,
  raw_xero jsonb not null default '{}'::jsonb,
  confidence text not null default 'probable'
    check (confidence in ('exact','probable','manual_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists order_financial_documents_xero_invoice_id_unique
  on public.order_financial_documents (xero_invoice_id);
create unique index if not exists order_financial_documents_xero_invoice_number_unique
  on public.order_financial_documents (xero_invoice_number);
create unique index if not exists order_financial_documents_xero_quote_id_unique
  on public.order_financial_documents (xero_quote_id);
create index if not exists order_financial_documents_order_id_idx on public.order_financial_documents(order_id);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  financial_document_id uuid references public.order_financial_documents(id) on delete set null,
  source_system text not null check (source_system in ('akahu','xero_payment','manual')),
  external_transaction_id text,
  payment_date date,
  amount numeric not null,
  currency text not null default 'NZD',
  payer_name text,
  bank_account_name text,
  bank_reference text,
  bank_particulars text,
  bank_code text,
  xero_invoice_number text,
  match_status text not null default 'unmatched'
    check (match_status in ('matched','probable','unmatched','ignored')),
  match_confidence numeric,
  match_reasons jsonb not null default '[]'::jsonb,
  raw_akahu jsonb not null default '{}'::jsonb,
  raw_xero jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists order_payments_source_external_unique
  on public.order_payments (source_system, external_transaction_id);
create index if not exists order_payments_order_id_idx on public.order_payments(order_id);
create index if not exists order_payments_xero_invoice_number_idx on public.order_payments(xero_invoice_number);

create table if not exists public.order_intake_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  review_state text not null default 'awaiting_payment'
    check (review_state in ('awaiting_payment','paid_needs_review','needs_review','approved')),
  source_summary jsonb not null default '{}'::jsonb,
  suggested_tasks jsonb not null default '[]'::jsonb,
  draft_tasks jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  approved_by text,
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);

create index if not exists order_intake_reviews_state_idx on public.order_intake_reviews(review_state);

create table if not exists public.production_order_tasks (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  intake_review_id uuid references public.order_intake_reviews(id) on delete set null,
  source_task_id text,
  title text not null,
  detail text,
  owner text not null check (owner in ('Nick','Dylan','Guido','Other')),
  scheduled_date date not null,
  day_key text not null check (day_key in ('monday','tuesday','wednesday','thursday','friday')),
  estimated_hours numeric not null default 1,
  sort_order integer not null default 0,
  status text not null default 'planned' check (status in ('planned','done','deleted')),
  completed_at timestamptz,
  completed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, source_task_id)
);

create index if not exists production_order_tasks_order_id_idx on public.production_order_tasks(order_id);
create index if not exists production_order_tasks_scheduled_date_idx on public.production_order_tasks(scheduled_date);
drop trigger if exists order_financial_documents_touch_updated_at on public.order_financial_documents;
create trigger order_financial_documents_touch_updated_at
before update on public.order_financial_documents
for each row execute function public.touch_updated_at();

drop trigger if exists order_payments_touch_updated_at on public.order_payments;
create trigger order_payments_touch_updated_at
before update on public.order_payments
for each row execute function public.touch_updated_at();

drop trigger if exists order_intake_reviews_touch_updated_at on public.order_intake_reviews;
create trigger order_intake_reviews_touch_updated_at
before update on public.order_intake_reviews
for each row execute function public.touch_updated_at();

drop trigger if exists production_order_tasks_touch_updated_at on public.production_order_tasks;
create trigger production_order_tasks_touch_updated_at
before update on public.production_order_tasks
for each row execute function public.touch_updated_at();

comment on table public.order_intake_reviews is 'Human approval queue for Supabase-first production order intake.';
comment on table public.production_order_tasks is 'Approved Supabase production tasks; Monday is not written by this flow.';
