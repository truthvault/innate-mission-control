-- Tuesday payment lifecycle layer for deposit + balance invoices.
-- Safe to apply after reviewing against the live Supabase project.
-- It does not remove existing columns or overwrite primary invoice history.

alter table public.order_financial_documents
  add column if not exists document_role text not null default 'primary'
    check (document_role in ('quote','primary','deposit','balance','final','adjustment','unknown')),
  add column if not exists lifecycle_stage text
    check (lifecycle_stage in ('drafted','authorised','sent','part_paid','paid','voided','unknown')),
  add column if not exists sent_channel text
    check (sent_channel in ('xero','gmail','manual','unknown')),
  add column if not exists customer_touch_event_id uuid references public.order_events(id) on delete set null;

create index if not exists order_financial_documents_order_role_idx
  on public.order_financial_documents(order_id, document_role);

create index if not exists order_financial_documents_lifecycle_idx
  on public.order_financial_documents(order_id, lifecycle_stage, amount_due);

update public.order_financial_documents
set document_role = case
    when lower(coalesce(raw_xero->>'Reference', raw_xero->>'reference', '') || ' ' || line_items::text) ~ 'deposit[[:space:]]+paid[[:space:]]+on[[:space:]]+inv-?[0-9]+'
      or lower(coalesce(raw_xero->>'Reference', raw_xero->>'reference', '')) ~ '\bbalance\b'
      then 'balance'
    when lower(coalesce(raw_xero->>'Reference', raw_xero->>'reference', '') || ' ' || line_items::text) ~ '\bdeposit\b'
      then 'deposit'
    when document_type = 'xero_quote'
      then 'quote'
    else document_role
  end,
  lifecycle_stage = case
    when lower(coalesce(status, '')) in ('paid') or coalesce(amount_due, 0) <= 0 then 'paid'
    when lower(coalesce(status, '')) in ('voided','deleted') then 'voided'
    when coalesce(amount_paid, 0) > 0 and coalesce(amount_due, 0) > 0 then 'part_paid'
    when sent_at is not null then 'sent'
    when lower(coalesce(status, '')) in ('authorised','authorized') then 'authorised'
    when lifecycle_stage is null then 'unknown'
    else lifecycle_stage
  end,
  sent_channel = case
    when sent_at is not null and sent_channel is null then 'xero'
    else sent_channel
  end
where archived_at is null;

create or replace view public.order_payment_lifecycle_v
with (security_invoker = true)
as
with docs as (
  select
    d.*,
    case
      when d.document_role is not null and d.document_role <> 'primary' then d.document_role
      when lower(coalesce(d.raw_xero->>'Reference', d.raw_xero->>'reference', '') || ' ' || d.line_items::text) ~ 'deposit[[:space:]]+paid[[:space:]]+on[[:space:]]+inv-?[0-9]+'
        or lower(coalesce(d.raw_xero->>'Reference', d.raw_xero->>'reference', '')) ~ '\bbalance\b'
        then 'balance'
      when lower(coalesce(d.raw_xero->>'Reference', d.raw_xero->>'reference', '') || ' ' || d.line_items::text) ~ '\bdeposit\b'
        then 'deposit'
      else d.document_role
    end as effective_role,
    case
      when d.lifecycle_stage is not null then d.lifecycle_stage
      when lower(coalesce(d.status, '')) = 'paid' or coalesce(d.amount_due, 0) <= 0 then 'paid'
      when lower(coalesce(d.status, '')) in ('voided','deleted') then 'voided'
      when coalesce(d.amount_paid, 0) > 0 and coalesce(d.amount_due, 0) > 0 then 'part_paid'
      when d.sent_at is not null then 'sent'
      when lower(coalesce(d.status, '')) in ('authorised','authorized') then 'authorised'
      else 'unknown'
    end as effective_stage
  from public.order_financial_documents d
  where d.archived_at is null
),
payments as (
  select
    p.financial_document_id,
    max(p.payment_date) filter (where p.match_status = 'matched' and coalesce(p.match_confidence, 0) >= 0.98) as matched_paid_at
  from public.order_payments p
  where p.archived_at is null
  group by p.financial_document_id
),
deposit_docs as (
  select distinct on (order_id)
    d.order_id,
    d.id,
    d.xero_invoice_number,
    d.total,
    d.amount_due,
    d.amount_paid,
    d.sent_at,
    d.due_at,
    d.effective_stage,
    p.matched_paid_at
  from docs d
  left join payments p on p.financial_document_id = d.id
  where d.effective_role in ('deposit','primary')
  order by d.order_id,
    case when d.effective_role = 'deposit' then 0 else 1 end,
    d.issued_at nulls last,
    d.created_at nulls last
),
balance_docs as (
  select distinct on (order_id)
    d.order_id,
    d.id,
    d.xero_invoice_number,
    d.total,
    d.amount_due,
    d.amount_paid,
    d.sent_at,
    d.due_at,
    d.customer_touch_event_id,
    d.effective_stage,
    p.matched_paid_at
  from docs d
  left join payments p on p.financial_document_id = d.id
  where d.effective_role in ('balance','final')
  order by d.order_id,
    case when d.effective_role = 'balance' then 0 else 1 end,
    d.issued_at desc nulls last,
    d.created_at desc nulls last
)
select
  o.id as order_id,
  coalesce(o.xero_invoice_number, dep.xero_invoice_number) as primary_invoice_number,
  dep.xero_invoice_number as deposit_invoice_number,
  dep.total as deposit_total,
  coalesce(dep.matched_paid_at, case when coalesce(dep.amount_due, 0) <= 0 or dep.effective_stage = 'paid' then dep.due_at end) as deposit_paid_at,
  dep.amount_due as deposit_amount_due,
  bal.xero_invoice_number as balance_invoice_number,
  bal.total as balance_total,
  bal.due_at as balance_due_at,
  bal.sent_at as balance_sent_at,
  coalesce(bal.matched_paid_at, case when coalesce(bal.amount_due, 0) <= 0 or bal.effective_stage = 'paid' then bal.due_at end) as balance_paid_at,
  bal.amount_due as balance_amount_due,
  bal.customer_touch_event_id as balance_customer_touch_event_id,
  case
    when bal.id is not null and (coalesce(bal.amount_due, 0) <= 0 or bal.effective_stage = 'paid' or bal.matched_paid_at is not null) then 'balance_paid'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 and bal.sent_at is not null then 'awaiting_balance_payment'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 then 'balance_authorised'
    when o.finished_date is not null and bal.id is null then 'ready_for_balance'
    when dep.id is not null and (coalesce(dep.amount_due, 0) <= 0 or dep.effective_stage = 'paid' or dep.matched_paid_at is not null) then 'in_production'
    when dep.id is not null and coalesce(dep.amount_due, 0) > 0 then 'deposit_due'
    else 'no_invoice'
  end as payment_stage,
  case
    when bal.id is not null and (coalesce(bal.amount_due, 0) <= 0 or bal.effective_stage = 'paid' or bal.matched_paid_at is not null) then 'Balance paid'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 and bal.sent_at is not null then 'Awaiting balance payment'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 then 'Balance authorised'
    when o.finished_date is not null and bal.id is null then 'Ready for balance invoice'
    when dep.id is not null and (coalesce(dep.amount_due, 0) <= 0 or dep.effective_stage = 'paid' or dep.matched_paid_at is not null) then 'Deposit paid'
    when dep.id is not null and coalesce(dep.amount_due, 0) > 0 then 'Awaiting deposit'
    else 'No invoice'
  end as payment_stage_label,
  case
    when bal.id is not null and (coalesce(bal.amount_due, 0) <= 0 or bal.effective_stage = 'paid' or bal.matched_paid_at is not null) then 'Balance paid. Book freight or dispatch.'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 and bal.sent_at is not null then 'Await balance payment, then book freight or dispatch.'
    when bal.id is not null and coalesce(bal.amount_due, 0) > 0 then 'Send balance invoice, then await payment.'
    when o.finished_date is not null and bal.id is null then 'Create and send balance invoice.'
    when dep.id is not null and (coalesce(dep.amount_due, 0) <= 0 or dep.effective_stage = 'paid' or dep.matched_paid_at is not null) then 'Continue production.'
    when dep.id is not null and coalesce(dep.amount_due, 0) > 0 then 'Await deposit before production planning.'
    else 'Confirm invoice state.'
  end as payment_next_action
from public.orders o
left join deposit_docs dep on dep.order_id = o.id
left join balance_docs bal on bal.order_id = o.id
where o.archived_at is null;

comment on view public.order_payment_lifecycle_v is 'Derived Tuesday read model for deposit/balance payment lifecycle. Does not replace invoice history.';
