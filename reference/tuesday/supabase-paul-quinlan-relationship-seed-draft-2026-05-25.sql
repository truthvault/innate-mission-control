-- Paul Quinlan / Northland tōtara relationship seed
-- Draft only. Apply after `supabase-relationships-suppliers-schema-draft-2026-05-25.sql` is applied.
-- Reflects Guido's category split:
-- - supplier_vendor = actual suppliers/vendors who invoice Innate
-- - strategic_relationship = important facilitators/people/partners who may not invoice us

with org as (
  insert into public.organisations (
    name,
    organisation_type,
    status,
    priority,
    email,
    location,
    notes,
    metadata
  ) values (
    'Paul Quinlan / Northland tōtara relationship',
    'strategic_relationship',
    'active',
    'strategic',
    'pdq@pqla.co.nz',
    'Northland / NZ native timber network',
    'Strategic tōtara facilitator/provenance relationship. Paul appears to support Northland tōtara supply, harvest/provenance evidence, photo/context sharing, Tāne’s Tree Trust/social/media material, and related source-story opportunities. He is not currently treated as an invoice-sending supplier/vendor.',
    '{"material_focus":["Northland tōtara","sustainable/native timber provenance"],"does_invoice_innate":false,"source":"Innate Gmail + Drive photo save audit 2026-05-25"}'::jsonb
  )
  on conflict (name) do update set
    organisation_type = excluded.organisation_type,
    status = excluded.status,
    priority = excluded.priority,
    email = excluded.email,
    location = excluded.location,
    notes = excluded.notes,
    metadata = public.organisations.metadata || excluded.metadata,
    updated_at = now()
  returning id
), contact as (
  insert into public.contacts (
    organisation_id,
    full_name,
    email,
    relationship_type,
    status,
    priority,
    notes,
    metadata
  )
  select
    org.id,
    'Paul Quinlan',
    'pdq@pqla.co.nz',
    'strategic_relationship_contact',
    'active',
    'strategic',
    'Key person for Northland tōtara / provenance / harvest-photo relationship. Needs deeper email-thread extraction for exact role/entity, source locations, supply terms, compliance wording, and current asks.',
    '{"source":"Innate Gmail attachment audit 2026-05-25"}'::jsonb
  from org
  on conflict (email) do update set
    organisation_id = excluded.organisation_id,
    relationship_type = excluded.relationship_type,
    status = excluded.status,
    priority = excluded.priority,
    notes = excluded.notes,
    metadata = public.contacts.metadata || excluded.metadata,
    updated_at = now()
  returning id, organisation_id
), overview as (
  insert into public.relationship_records (
    organisation_id,
    contact_id,
    record_type,
    title,
    record_date,
    summary,
    next_action,
    owner,
    priority,
    status,
    metadata
  )
  select
    contact.organisation_id,
    contact.id,
    'overview',
    'Paul Quinlan / Northland tōtara relationship overview',
    '2026-05-25',
    'Recovered/saved Paul Quinlan Innate Gmail photo attachments show a long-running strategic Northland tōtara relationship from 2021 to 2026, including introduction/supply, laminated tōtara, SFM/sustainable harvest photos, Tāne’s Tree Trust/social/media material, MPI/post-harvest inspection evidence, milling/extraction photos, and current small tōtara post supply. This should live as a strategic relationship, not just a normal invoice-sending supplier.',
    'Read the 60 matched email threads and extract exact entity/role, source locations, supply/pricing/availability, compliance/provenance language, restrictions/permissions for image use, and open asks.',
    'Hermes',
    'high',
    'open',
    '{"gmail_query":"from:pdq@pqla.co.nz has:attachment","messages_matched":60,"photos_found":149,"uploaded_new_files":146,"duplicate_skips":3,"errors":0}'::jsonb
  from contact
  returning id, organisation_id, contact_id
)
insert into public.relationship_links (
  organisation_id,
  contact_id,
  relationship_record_id,
  link_type,
  label,
  url,
  external_id,
  metadata
)
select
  overview.organisation_id,
  overview.contact_id,
  overview.id,
  'drive_folder',
  'Paul Quinlan photos from Innate Gmail',
  'https://drive.google.com/drive/folders/1t41dessyVMQ6P7Qx5VnHO5g2Hd9KHefO',
  '1t41dessyVMQ6P7Qx5VnHO5g2Hd9KHefO',
  '{"drive_account":"gjloeffler@gmail.com","source_gmail":"guido@innatefurniture.co.nz","report":"/Users/mack-mini/.hermes/tmp/paul_quinlan_innate_photos/report.md"}'::jsonb
from overview
on conflict (link_type, external_id) do update set
  organisation_id = excluded.organisation_id,
  contact_id = excluded.contact_id,
  relationship_record_id = excluded.relationship_record_id,
  label = excluded.label,
  url = excluded.url,
  metadata = public.relationship_links.metadata || excluded.metadata;
