-- Order stage split — foundation step 1 (Tuesday roadmap, 2026-07-05)
--
-- Problem: orders.status conflated TWO independent axes — payment progress and
-- workshop progress — so payment automation and workshop edits overwrote each
-- other on one field (Fowler/Kidd manual fixes reverted within minutes).
--
-- Fix: two separate columns, each owned by one writer, neither touching the other.
--   payment_stage  — owned by the intake/reconcile pipeline (Xero + Akahu).
--   workshop_stage — owned by the board (advances as Nick & Dylan tick tasks).
--
-- This migration is ADDITIVE and REVERSIBLE. `status` is kept untouched; the app
-- keeps reading it until the board is updated to read the new columns. No CHECK
-- constraints yet — added in a later hardening step once all writers are updated,
-- so this step cannot break existing writes.
--
-- Rollback: ALTER TABLE public.orders DROP COLUMN payment_stage, DROP COLUMN workshop_stage;

-- 1. DDL — add the two columns (nullable text).
alter table public.orders add column if not exists payment_stage text;
alter table public.orders add column if not exists workshop_stage text;

comment on column public.orders.payment_stage is
  'Payment axis (owned by intake/reconcile): quote / awaiting_deposit / deposit_paid / paid_in_full. Independent of workshop_stage.';
comment on column public.orders.workshop_stage is
  'Workshop axis (owned by the board): not_started / materials / in_production / finishing / curing / qc / ready / dispatched / paused / cancelled. Independent of payment_stage.';

-- 2. Backfill — best-effort from the current single status + dates. Approximate on
--    purpose; going forward each axis is written cleanly by its one owner.

-- payment_stage
update public.orders set payment_stage = case
  when paid_on_date is not null and status in ('complete','delivered') then 'paid_in_full'
  when paid_on_date is not null then 'deposit_paid'
  when status = 'awaiting_payment' then 'awaiting_deposit'
  else 'quote'
end
where payment_stage is null;

-- workshop_stage
update public.orders set workshop_stage = case
  when status = 'cancelled' then 'cancelled'
  when status = 'delivered' then 'dispatched'
  when status = 'awaiting_dispatch' then 'ready'
  when status in ('finished','complete') or finished_date is not null then 'finished'
  when status = 'in_production' then 'in_production'
  when status = 'paused' then 'paused'
  else 'not_started'
end
where workshop_stage is null;
