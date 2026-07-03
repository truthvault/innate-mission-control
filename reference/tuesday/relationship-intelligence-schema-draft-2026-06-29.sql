-- Relationship Intelligence Spine schema draft — NOT APPLIED
-- Created: 2026-06-29
-- Purpose: discussion/prototype migration for a source-backed master relationship spine.
-- Boundary: Draft only. Do not run without explicit approval, backup, review, RLS plan, and dry-run backfill proof.

create extension if not exists pgcrypto;

-- 1. Canonical real-world entities: people, organisations, projects, households, unknowns.
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('person','organisation','project','household','unknown')),
  display_name text not null,
  canonical_name text,
  primary_location text,
  primary_role_summary text,
  business_relevance_summary text,
  relationship_status text not null default 'new'
    check (relationship_status in ('new','active','dormant','strategic','watch','archived')),
  relationship_value text not null default 'unknown'
    check (relationship_value in ('unknown','low','normal','high','strategic')),
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  privacy_level text not null default 'normal' check (privacy_level in ('normal','sensitive','restricted')),
  last_seen_at timestamptz,
  next_best_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists parties_name_idx on public.parties (canonical_name);
create index if not exists parties_status_value_idx on public.parties (relationship_status, relationship_value);

create table if not exists public.party_roles (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  role_key text not null,
  role_label text not null,
  role_context text,
  source_evidence_id uuid,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (party_id, role_key, role_context)
);

create table if not exists public.party_aliases (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  alias_type text not null default 'name' check (alias_type in ('name','organisation_name','project_name','source_display','other')),
  alias_value text not null,
  normalized_alias text,
  source_system text,
  source_ref text,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now(),
  unique (party_id, alias_type, alias_value)
);

create table if not exists public.contact_methods (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  method_type text not null check (method_type in ('email','phone','mobile','website','linkedin','instagram','address','other')),
  value text not null,
  normalized_value text,
  label text,
  source_system text,
  source_ref text,
  source_evidence_id uuid,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  privacy_level text not null default 'normal' check (privacy_level in ('normal','sensitive','restricted')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (method_type, normalized_value)
);

create table if not exists public.party_relationships (
  id uuid primary key default gen_random_uuid(),
  from_party_id uuid not null references public.parties(id) on delete cascade,
  to_party_id uuid not null references public.parties(id) on delete cascade,
  relationship_type text not null,
  label text,
  started_at date,
  ended_at date,
  source_evidence_id uuid,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_party_id, to_party_id, relationship_type)
);

-- 2. Commercial opportunities separate from parties.
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  primary_contact_party_id uuid references public.parties(id) on delete set null,
  client_party_id uuid references public.parties(id) on delete set null,
  opportunity_type text,
  product_interest text,
  estimated_value numeric(12,2),
  currency text not null default 'NZD',
  stage text not null default 'new'
    check (stage in ('new','qualifying','quote_needed','quoted','waiting_on_customer','won','lost','parked')),
  priority text not null default 'normal' check (priority in ('hot','high','normal','low')),
  source_system text,
  source_ref text,
  legacy_lead_id uuid references public.leads(id) on delete set null,
  won_order_id uuid references public.orders(id) on delete set null,
  next_action text,
  next_follow_up_at date,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

-- 3. Evidence and touchpoints.
create table if not exists public.source_evidence (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  source_type text not null,
  source_id text,
  source_url text,
  source_title text,
  source_date timestamptz,
  captured_at timestamptz not null default now(),
  quoted_excerpt text,
  content_hash text,
  privacy_level text not null default 'normal' check (privacy_level in ('normal','sensitive','restricted')),
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  metadata jsonb not null default '{}'::jsonb,
  unique (source_system, source_type, source_id)
);

create table if not exists public.touchpoints (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  channel text not null check (channel in ('phone','email','meeting','website','shopify','xero','monday','drive','telegram','public_web','other')),
  direction text check (direction in ('inbound','outbound','internal','external','unknown')),
  summary text not null,
  questions_asked jsonb not null default '[]'::jsonb,
  promises_made jsonb not null default '[]'::jsonb,
  product_intent jsonb not null default '{}'::jsonb,
  sentiment text,
  follow_up_needed boolean not null default false,
  next_action text,
  source_evidence_id uuid references public.source_evidence(id) on delete set null,
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.fact_claims (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  claim_type text not null,
  claim_text text not null,
  source_evidence_id uuid references public.source_evidence(id) on delete set null,
  confidence text not null default 'medium' check (confidence in ('low','medium','high','conflict')),
  privacy_level text not null default 'normal' check (privacy_level in ('normal','sensitive','restricted')),
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.questions_objections_intent (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  category text not null,
  detail text not null,
  source_evidence_id uuid references public.source_evidence(id) on delete set null,
  confidence text not null default 'medium' check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now()
);

create table if not exists public.commitments_promises (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  promise_direction text not null check (promise_direction in ('innate_to_party','party_to_innate','internal')),
  promise_text text not null,
  owner text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','waiting','done','cancelled','archived')),
  source_evidence_id uuid references public.source_evidence(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_profiles (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  research_summary text,
  business_relevance_summary text,
  known_experience text,
  public_projects jsonb not null default '[]'::jsonb,
  style_or_positioning_clues text,
  recommended_sales_angle text,
  risk_or_uncertainty text,
  last_researched_at timestamptz not null default now(),
  research_confidence text not null default 'medium' check (research_confidence in ('low','medium','high')),
  source_evidence_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id)
);

-- 4. Safe entity resolution review tables. These are candidates, not automatic merges.
create table if not exists public.entity_resolution_candidates (
  id uuid primary key default gen_random_uuid(),
  candidate_a_type text not null,
  candidate_a_id text not null,
  candidate_b_type text not null,
  candidate_b_id text not null,
  match_confidence text not null check (match_confidence in ('exact','strong','probable','weak','conflict')),
  match_signals jsonb not null default '[]'::jsonb,
  recommended_action text not null default 'human_review',
  status text not null default 'open' check (status in ('open','approved','rejected','merged','archived')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (candidate_a_type, candidate_a_id, candidate_b_type, candidate_b_id)
);

create table if not exists public.human_review_queue (
  id uuid primary key default gen_random_uuid(),
  review_type text not null,
  severity text not null default 'normal' check (severity in ('info','normal','high','critical')),
  object_type text not null,
  object_id text not null,
  title text not null,
  detail text,
  source_evidence_ids uuid[] not null default '{}',
  assigned_to text,
  status text not null default 'open' check (status in ('open','waiting','done','parked','archived')),
  decision text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- RLS / grants intentionally omitted from this draft. Add only after security review.
