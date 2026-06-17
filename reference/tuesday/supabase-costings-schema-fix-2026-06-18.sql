-- Tuesday Costings schema fix after first application.
-- Keeps product_costing_lines aligned with the UI/data model by allowing machining lines
-- and preserving source line payloads for quote/batch evidence.

alter table product_costing_lines
  drop constraint if exists product_costing_lines_line_type_check;

alter table product_costing_lines
  add constraint product_costing_lines_line_type_check
  check (line_type in ('material', 'labour', 'freight', 'finish', 'hardware', 'steel', 'machining', 'service', 'other'));

alter table product_costing_lines
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

comment on column product_costing_lines.raw_payload is 'Source row payload for source-backed cost line imports. No invented values.';
