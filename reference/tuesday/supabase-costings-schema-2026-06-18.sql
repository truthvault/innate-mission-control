-- Tuesday Costings additive schema.
-- No seed prices are included here. Cost values must come from source-backed imports or approvals.

create extension if not exists pgcrypto;

create table if not exists costing_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  supplier_type text not null default 'supplier'
    check (supplier_type in ('supplier', 'freight_carrier', 'labour', 'finish', 'hardware', 'steel', 'timber', 'service', 'other')),
  xero_contact_id text,
  website_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists costing_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  internal_code text,
  supplier_id uuid references costing_suppliers(id) on delete set null,
  supplier_code text,
  category text not null default 'uncategorised'
    check (category in ('timber', 'sheet_material', 'finish', 'hardware', 'steel_base', 'freight', 'labour', 'machining', 'packaging', 'power', 'service', 'other', 'uncategorised')),
  unit text,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_code),
  unique (supplier_id, supplier_code)
);

create table if not exists costing_source_links (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('xero_bill', 'xero_invoice', 'drive_sheet', 'supplier_pdf', 'gmail', 'manual_note', 'calculator', 'supabase', 'other')),
  source_label text not null,
  source_url text,
  external_id text,
  captured_at timestamptz not null default now(),
  captured_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_type, external_id)
);

create table if not exists costing_price_observations (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references costing_materials(id) on delete set null,
  supplier_id uuid references costing_suppliers(id) on delete set null,
  source_link_id uuid references costing_source_links(id) on delete set null,
  observed_at timestamptz not null default now(),
  source_type text not null
    check (source_type in ('xero_bill', 'xero_invoice', 'drive_sheet', 'supplier_pdf', 'gmail', 'manual_note', 'calculator', 'supabase', 'other')),
  source_label text not null,
  source_url text,
  supplier_item_label text,
  unit text,
  quantity numeric(14,4),
  unit_cost_ex_gst numeric(14,4),
  line_cost_ex_gst numeric(14,4),
  gst_amount numeric(14,4),
  currency text not null default 'NZD',
  xero_bill_number text,
  xero_bill_date date,
  xero_line_description text,
  inbound_freight_ex_gst numeric(14,4),
  customer_delivery_charge_ex_gst numeric(14,4),
  confidence text not null default 'unknown'
    check (confidence in ('high', 'medium', 'low', 'unknown')),
  review_status text not null default 'needs_review'
    check (review_status in ('fresh', 'stale', 'needs_review', 'conflict', 'missing_source', 'approved', 'rejected')),
  notes text,
  blocker text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (unit_cost_ex_gst is null or unit_cost_ex_gst >= 0),
  check (line_cost_ex_gst is null or line_cost_ex_gst >= 0),
  check (inbound_freight_ex_gst is null or inbound_freight_ex_gst >= 0),
  check (customer_delivery_charge_ex_gst is null or customer_delivery_charge_ex_gst >= 0)
);

create table if not exists costing_current_prices (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references costing_materials(id) on delete cascade,
  approved_unit_cost_ex_gst numeric(14,4) not null check (approved_unit_cost_ex_gst >= 0),
  unit text,
  source_observation_id uuid references costing_price_observations(id) on delete set null,
  approved_at timestamptz not null default now(),
  approved_by text,
  approval_note text,
  status text not null default 'approved'
    check (status in ('approved', 'superseded', 'rejected')),
  created_at timestamptz not null default now()
);

create unique index if not exists costing_current_prices_one_approved_per_material
  on costing_current_prices(material_id)
  where status = 'approved';

create table if not exists product_costing_sheets (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_code text,
  product_family text,
  default_variant text,
  status text not null default 'needs_review'
    check (status in ('active', 'draft', 'needs_review', 'archived')),
  source_link_id uuid references costing_source_links(id) on delete set null,
  source_type text
    check (source_type is null or source_type in ('xero_bill', 'xero_invoice', 'drive_sheet', 'supplier_pdf', 'gmail', 'manual_note', 'calculator', 'supabase', 'other')),
  source_label text,
  source_url text,
  notes text,
  blocker text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_code)
);

create table if not exists product_costing_versions (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references product_costing_sheets(id) on delete cascade,
  version_label text,
  imported_at timestamptz not null default now(),
  imported_by text,
  source_link_id uuid references costing_source_links(id) on delete set null,
  source_hash text,
  stale_source_line_count integer check (stale_source_line_count is null or stale_source_line_count >= 0),
  total_materials_ex_gst numeric(14,4) check (total_materials_ex_gst is null or total_materials_ex_gst >= 0),
  total_labour_hours numeric(14,4) check (total_labour_hours is null or total_labour_hours >= 0),
  total_labour_cost_ex_gst numeric(14,4) check (total_labour_cost_ex_gst is null or total_labour_cost_ex_gst >= 0),
  other_costs_ex_gst numeric(14,4) check (other_costs_ex_gst is null or other_costs_ex_gst >= 0),
  total_cost_ex_gst numeric(14,4) check (total_cost_ex_gst is null or total_cost_ex_gst >= 0),
  sell_price_ex_gst numeric(14,4) check (sell_price_ex_gst is null or sell_price_ex_gst >= 0),
  sell_price_incl_gst numeric(14,4) check (sell_price_incl_gst is null or sell_price_incl_gst >= 0),
  gross_profit_ex_gst numeric(14,4),
  gross_margin_percent numeric(8,4),
  markup_percent numeric(8,4),
  ready_to_quote_status text not null default 'blocked'
    check (ready_to_quote_status in ('ready', 'blocked', 'needs_review')),
  approval_status text not null default 'unapproved'
    check (approval_status in ('unapproved', 'approved', 'superseded', 'rejected')),
  notes text,
  blocker text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists product_costing_lines (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references product_costing_versions(id) on delete cascade,
  material_id uuid references costing_materials(id) on delete set null,
  source_observation_id uuid references costing_price_observations(id) on delete set null,
  line_type text not null default 'material'
    check (line_type in ('material', 'labour', 'freight', 'finish', 'hardware', 'steel', 'machining', 'service', 'other')),
  line_label text not null,
  quantity numeric(14,4),
  unit text,
  unit_cost_ex_gst numeric(14,4) check (unit_cost_ex_gst is null or unit_cost_ex_gst >= 0),
  total_cost_ex_gst numeric(14,4) check (total_cost_ex_gst is null or total_cost_ex_gst >= 0),
  source_line_reference text,
  raw_payload jsonb not null default '{}'::jsonb,
  freshness_status text not null default 'missing_source'
    check (freshness_status in ('fresh', 'stale', 'needs_review', 'conflict', 'missing_source')),
  confidence text not null default 'unknown'
    check (confidence in ('high', 'medium', 'low', 'unknown')),
  notes text,
  blocker text,
  created_at timestamptz not null default now()
);

create table if not exists costing_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('import', 'reconciliation', 'approval', 'override', 'blocker', 'readback', 'review')),
  entity_type text not null
    check (entity_type in ('supplier', 'material', 'price_observation', 'current_price', 'product_sheet', 'product_version', 'product_line', 'source_link')),
  entity_id uuid,
  source_link_id uuid references costing_source_links(id) on delete set null,
  event_label text not null,
  event_status text not null default 'logged'
    check (event_status in ('logged', 'succeeded', 'failed', 'needs_review')),
  actor text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists costing_materials_supplier_idx on costing_materials(supplier_id);
create index if not exists costing_materials_category_idx on costing_materials(category);
create index if not exists costing_price_observations_material_observed_idx on costing_price_observations(material_id, observed_at desc);
create index if not exists costing_price_observations_supplier_idx on costing_price_observations(supplier_id);
create index if not exists costing_price_observations_review_idx on costing_price_observations(review_status);
create index if not exists product_costing_versions_sheet_imported_idx on product_costing_versions(sheet_id, imported_at desc);
create index if not exists product_costing_lines_version_idx on product_costing_lines(version_id);
create index if not exists costing_audit_events_entity_idx on costing_audit_events(entity_type, entity_id, created_at desc);

create or replace view costing_material_summary as
select
  m.id,
  m.name,
  m.internal_code,
  m.supplier_code,
  m.category,
  s.name as supplier_name,
  coalesce(cp.unit, m.unit, latest.unit) as unit,
  cp.approved_unit_cost_ex_gst as current_approved_unit_cost_ex_gst,
  cp.approved_at as current_approved_at,
  latest.unit_cost_ex_gst as latest_observed_unit_cost_ex_gst,
  case
    when latest.id is null then 'missing_source'
    when latest.review_status in ('fresh', 'stale', 'needs_review', 'conflict', 'missing_source') then latest.review_status
    when cp.id is null then 'needs_review'
    when latest.review_status in ('conflict', 'needs_review', 'stale', 'missing_source') then latest.review_status
    else 'fresh'
  end as price_status,
  latest.xero_bill_number as latest_xero_bill_number,
  latest.xero_bill_date as latest_xero_bill_date,
  latest.xero_line_description as latest_xero_line_description,
  freight.average_inbound_freight_ex_gst,
  freight.average_inbound_freight_sample_count,
  latest.inbound_freight_ex_gst as latest_inbound_freight_ex_gst,
  latest.customer_delivery_charge_ex_gst as customer_delivery_charge_ex_gst,
  latest.source_type,
  latest.source_label,
  latest.source_url,
  latest.observed_at as last_checked_at,
  coalesce(latest.confidence, 'unknown') as confidence,
  coalesce(latest.notes, m.notes) as notes,
  latest.blocker
from costing_materials m
left join costing_suppliers s on s.id = m.supplier_id
left join lateral (
  select *
  from costing_current_prices c
  where c.material_id = m.id and c.status = 'approved'
  order by c.approved_at desc
  limit 1
) cp on true
left join lateral (
  select *
  from costing_price_observations o
  where o.material_id = m.id
  order by o.observed_at desc, o.created_at desc
  limit 1
) latest on true
left join lateral (
  select
    avg(o.inbound_freight_ex_gst) as average_inbound_freight_ex_gst,
    count(*)::integer as average_inbound_freight_sample_count
  from costing_price_observations o
  where o.material_id = m.id and o.inbound_freight_ex_gst is not null
) freight on true
where m.is_active = true;

create or replace view product_costing_sheet_summary as
select
  s.id,
  s.product_name,
  s.product_code,
  s.product_family,
  s.default_variant,
  s.status,
  s.source_type,
  s.source_label,
  s.source_url,
  v.imported_at as last_imported_at,
  v.stale_source_line_count,
  v.total_materials_ex_gst,
  v.total_labour_hours,
  v.total_labour_cost_ex_gst,
  v.other_costs_ex_gst,
  v.total_cost_ex_gst,
  v.sell_price_ex_gst,
  v.sell_price_incl_gst,
  v.gross_profit_ex_gst,
  v.gross_margin_percent,
  v.markup_percent,
  coalesce(v.ready_to_quote_status, 'blocked') as ready_to_quote_status,
  coalesce(v.notes, s.notes) as notes,
  coalesce(v.blocker, s.blocker) as blocker
from product_costing_sheets s
left join lateral (
  select *
  from product_costing_versions v
  where v.sheet_id = s.id
  order by v.imported_at desc, v.created_at desc
  limit 1
) v on true
where s.status <> 'archived';

alter table costing_suppliers enable row level security;
alter table costing_materials enable row level security;
alter table costing_source_links enable row level security;
alter table costing_price_observations enable row level security;
alter table costing_current_prices enable row level security;
alter table product_costing_sheets enable row level security;
alter table product_costing_versions enable row level security;
alter table product_costing_lines enable row level security;
alter table costing_audit_events enable row level security;

comment on table costing_suppliers is 'Tuesday Costings canonical supplier/vendor/source list.';
comment on table costing_materials is 'Tuesday Costings canonical material, service, freight, labour, finish, hardware, steel base, and similar cost item list.';
comment on table costing_price_observations is 'Raw observed source-backed prices. Latest observations are not automatically approved current prices.';
comment on table costing_current_prices is 'Approved selected current price per material. This can remain empty until Guido or an approved process selects a price.';
comment on table product_costing_sheets is 'Reusable product/BOM costing sheet records from Drive sheets or other factual sources.';
comment on table product_costing_versions is 'Imported or reconciled product costing sheet versions with source hashes and totals only when source-backed.';
comment on table product_costing_lines is 'Cost/BOM lines tied to product costing versions and optionally canonical materials.';
comment on table costing_source_links is 'Evidence links and references for Xero, Drive, Gmail, PDFs, Supabase rows, calculators, and manual notes.';
comment on table costing_audit_events is 'Audit trail for imports, reconciliation, approvals, overrides, blockers, and review events.';
