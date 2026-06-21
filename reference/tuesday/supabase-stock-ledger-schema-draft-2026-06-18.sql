-- Tuesday Ultimate Stock additive schema draft.
-- Draft only. Do not apply without Guido approval.
-- Purpose: Tuesday-owned stock ledger fed by Xero receipts, costing sheets/order usage, and monthly stocktake reconciliation.

create extension if not exists pgcrypto;

create table if not exists stock_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_type text not null default 'workshop'
    check (location_type in ('workshop', 'rack', 'shelf', 'supplier_held', 'in_transit', 'quarantine', 'job_area', 'other')),
  supplier_id uuid references costing_suppliers(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  item_code text,
  name text not null,
  category text not null default 'other'
    check (category in ('timber', 'sheet_material', 'steel', 'finish', 'hardware', 'fabric', 'beanbag_fill', 'packaging', 'consumable', 'component', 'other')),
  species_or_material text,
  dimensions text,
  default_unit text not null default 'each',
  costing_material_id uuid references costing_materials(id) on delete set null,
  xero_item_id text,
  default_supplier_id uuid references costing_suppliers(id) on delete set null,
  preferred_location_id uuid references stock_locations(id) on delete set null,
  reorder_point numeric(14,4),
  reorder_quantity numeric(14,4),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_code),
  check (reorder_point is null or reorder_point >= 0),
  check (reorder_quantity is null or reorder_quantity >= 0)
);

create table if not exists stock_source_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('xero_bill', 'xero_invoice', 'xero_item', 'costing_sheet', 'production_order', 'stocktake', 'supplier_confirmation', 'gmail', 'legacy_monday', 'manual_note', 'other')),
  source_label text not null,
  source_url text,
  external_id text,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source_type, external_id)
);

create table if not exists stock_lots (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  location_id uuid references stock_locations(id) on delete set null,
  supplier_id uuid references costing_suppliers(id) on delete set null,
  source_link_id uuid references stock_source_links(id) on delete set null,
  received_date date,
  lot_label text,
  quantity_received numeric(14,4) not null default 0 check (quantity_received >= 0),
  remaining_quantity numeric(14,4) not null default 0 check (remaining_quantity >= 0),
  unit text not null,
  unit_cost_ex_gst numeric(14,4) check (unit_cost_ex_gst is null or unit_cost_ex_gst >= 0),
  landed_unit_cost_ex_gst numeric(14,4) check (landed_unit_cost_ex_gst is null or landed_unit_cost_ex_gst >= 0),
  condition_status text not null default 'usable'
    check (condition_status in ('usable', 'needs_inspection', 'damaged', 'reserved_quality_issue', 'unknown')),
  confidence text not null default 'unknown'
    check (confidence in ('high', 'medium', 'low', 'unknown')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  lot_id uuid references stock_lots(id) on delete set null,
  location_id uuid references stock_locations(id) on delete set null,
  movement_type text not null
    check (movement_type in ('receipt_from_xero_bill', 'reserve_for_job', 'release_reservation', 'consume_to_job', 'stocktake_count', 'stocktake_adjustment', 'supplier_held_confirmation', 'manual_adjustment', 'wastage_damage', 'return_to_supplier', 'correction', 'opening_balance')),
  quantity_delta numeric(14,4) not null,
  unit text not null,
  value_delta_ex_gst numeric(14,4),
  source_link_id uuid references stock_source_links(id) on delete set null,
  job_id uuid,
  order_id uuid,
  costing_version_id uuid references product_costing_versions(id) on delete set null,
  approval_status text not null default 'system_proposed'
    check (approval_status in ('system_proposed', 'auto_applied', 'approved', 'rejected', 'needs_review')),
  actor text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists job_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  costing_version_id uuid references product_costing_versions(id) on delete set null,
  costing_line_id uuid references product_costing_lines(id) on delete set null,
  job_id uuid,
  order_id uuid,
  customer_name text,
  required_quantity numeric(14,4) not null default 0 check (required_quantity >= 0),
  reserved_quantity numeric(14,4) not null default 0 check (reserved_quantity >= 0),
  consumed_quantity numeric(14,4) not null default 0 check (consumed_quantity >= 0),
  unit text not null,
  due_date date,
  status text not null default 'planned'
    check (status in ('planned', 'reserved', 'partially_consumed', 'consumed', 'released', 'shortage', 'variance', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stocktake_sessions (
  id uuid primary key default gen_random_uuid(),
  stocktake_month date not null,
  status text not null default 'open'
    check (status in ('open', 'counting', 'variance_review', 'approved', 'posted_to_xero_pack', 'archived')),
  started_at timestamptz,
  completed_at timestamptz,
  counted_by text,
  reviewed_by text,
  total_system_value_before_ex_gst numeric(14,4),
  total_counted_value_ex_gst numeric(14,4),
  variance_value_ex_gst numeric(14,4),
  source_link_id uuid references stock_source_links(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stocktake_month)
);

create table if not exists stocktake_counts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references stocktake_sessions(id) on delete cascade,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  location_id uuid references stock_locations(id) on delete set null,
  counted_quantity numeric(14,4) not null check (counted_quantity >= 0),
  system_quantity numeric(14,4) not null default 0 check (system_quantity >= 0),
  variance_quantity numeric(14,4) generated always as (counted_quantity - system_quantity) stored,
  unit text not null,
  unit_cost_ex_gst numeric(14,4),
  variance_value_ex_gst numeric(14,4),
  reason_code text
    check (reason_code is null or reason_code in ('usage_not_recorded', 'receipt_not_recorded', 'count_error', 'wastage', 'damage', 'unit_conversion', 'supplier_held_difference', 'mapping_error', 'unknown', 'other')),
  resolution_status text not null default 'needs_review'
    check (resolution_status in ('needs_review', 'accepted', 'recount_required', 'adjustment_posted', 'rejected')),
  notes text,
  created_at timestamptz not null default now(),
  unique (session_id, stock_item_id, location_id)
);

create table if not exists stock_mapping_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null
    check (rule_type in ('xero_bill_line', 'supplier_item', 'description_keyword', 'xero_item', 'costing_line')),
  supplier_id uuid references costing_suppliers(id) on delete set null,
  match_pattern text not null,
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  unit text,
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stock_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_type text not null
    check (exception_type in ('unmapped_xero_bill_line', 'ambiguous_quantity', 'price_jump', 'negative_available', 'stock_shortage', 'stale_count', 'supplier_confirmation_missing', 'variance_review', 'duplicate_item', 'unit_conversion_needed', 'other')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  stock_item_id uuid references stock_items(id) on delete set null,
  source_link_id uuid references stock_source_links(id) on delete set null,
  title text not null,
  detail text,
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  assigned_to text,
  resolved_at timestamptz,
  resolution_note text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view stock_item_balances as
select
  si.id as stock_item_id,
  si.item_code,
  si.name,
  si.category,
  si.species_or_material,
  si.dimensions,
  si.default_unit,
  coalesce(sum(sm.quantity_delta) filter (where sm.movement_type not in ('reserve_for_job', 'release_reservation')), 0) as quantity_on_hand,
  coalesce(sum(case when sm.movement_type = 'reserve_for_job' then sm.quantity_delta when sm.movement_type = 'release_reservation' then sm.quantity_delta else 0 end), 0) as quantity_reserved,
  coalesce(sum(sm.quantity_delta) filter (where sm.movement_type not in ('reserve_for_job', 'release_reservation')), 0)
    - coalesce(sum(case when sm.movement_type = 'reserve_for_job' then sm.quantity_delta when sm.movement_type = 'release_reservation' then sm.quantity_delta else 0 end), 0) as quantity_available,
  cp.approved_unit_cost_ex_gst,
  coalesce(sum(sm.quantity_delta) filter (where sm.movement_type not in ('reserve_for_job', 'release_reservation')), 0) * cp.approved_unit_cost_ex_gst as stock_value_ex_gst,
  max(sm.created_at) as last_movement_at,
  si.is_active
from stock_items si
left join stock_movements sm on sm.stock_item_id = si.id and sm.approval_status in ('auto_applied', 'approved')
left join costing_current_prices cp on cp.material_id = si.costing_material_id and cp.status = 'approved'
group by si.id, cp.approved_unit_cost_ex_gst;

create index if not exists stock_items_category_idx on stock_items(category);
create index if not exists stock_items_costing_material_idx on stock_items(costing_material_id);
create index if not exists stock_lots_item_idx on stock_lots(stock_item_id);
create index if not exists stock_movements_item_created_idx on stock_movements(stock_item_id, created_at desc);
create index if not exists stock_movements_source_idx on stock_movements(source_link_id);
create index if not exists job_stock_reservations_item_idx on job_stock_reservations(stock_item_id);
create index if not exists stocktake_counts_session_idx on stocktake_counts(session_id);
create index if not exists stock_exceptions_status_idx on stock_exceptions(status, severity);
