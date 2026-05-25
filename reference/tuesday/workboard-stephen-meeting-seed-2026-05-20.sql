-- Tuesday Workboard Stephen meeting seed draft
-- Review-only until Guido explicitly approves applying to Supabase production.

with source_upsert as (
  insert into public.work_sources (source_type, title, source_date, people, summary, file_path, transcript_path)
  select
    'meeting',
    'Meeting with Stephen — sales, website, leads, customer journey',
    '2026-05-20'::date,
    '["Guido", "Stephen"]'::jsonb,
    'Stephen and Guido discussed live lead follow-up, website conversion fixes, commercial outreach, customer journey/reviews, and materials/supply actions. This is a concise source record, not the raw transcript.',
    '/Users/mack-mini/Desktop/Meeting Stephen 20 May 2026.m4a',
    '/Users/mack-mini/Desktop/Stephen meeting transcript 2026-05-20/transcript-first-55min.txt'
  where not exists (
    select 1 from public.work_sources where title = 'Meeting with Stephen — sales, website, leads, customer journey'
  )
  returning id
), source_row as (
  select id from source_upsert
  union all
  select id from public.work_sources where title = 'Meeting with Stephen — sales, website, leads, customer journey'
  limit 1
), project_seed (name, area, status, priority, owner, description) as (
  values
    ('Hot Lead Follow-up', 'leads', 'active', 'cash', 'Guido', 'Convert live quoted/commercial opportunities into deposits.'),
    ('Website Conversion Fixes', 'website', 'active', 'high', 'Website', 'Fix trust-breaking inconsistencies and improve conversion without getting lost in polish.'),
    ('Commercial Outreach Engine', 'commercial', 'active', 'high', 'Guido', 'Make it easy for agents/designers/commercial contacts to understand and sell Innate’s commercial fit.'),
    ('Customer Journey & Reviews', 'customer_journey', 'active', 'high', 'Guido', 'Turn good customer experience into repeatable updates, post-delivery delight, and Google reviews.'),
    ('Materials, Supply & NZ Steel', 'materials', 'active', 'normal', 'Guido', 'Protect material supply and strengthen the NZ provenance story.')
), project_insert as (
  insert into public.work_projects (name, area, status, priority, owner, description, source_id)
  select ps.name, ps.area, ps.status, ps.priority, ps.owner, ps.description, sr.id
  from project_seed ps
  cross join source_row sr
  where not exists (select 1 from public.work_projects wp where wp.name = ps.name)
  returning id, name
), project_row as (
  select id, name from project_insert
  union all
  select id, name from public.work_projects where name in (select name from project_seed)
), task_seed (project_name, title, area, status, priority, owner, sort_order) as (
  values
    ('Hot Lead Follow-up', 'Follow up large commercial quote once CAPEX/procurement timing should have cleared.', 'leads', 'next', 'cash', 'Guido', 10),
    ('Hot Lead Follow-up', 'Follow up Michelle / High Street-style project.', 'leads', 'next', 'cash', 'Guido', 20),
    ('Hot Lead Follow-up', 'Follow up Hamilton iwi boardroom table enquiry.', 'leads', 'next', 'cash', 'Guido', 30),
    ('Hot Lead Follow-up', 'Continue nurturing JTB Architects/design-network relationship.', 'leads', 'next', 'high', 'Guido', 40),
    ('Hot Lead Follow-up', 'Ask more leads “How did you find us?” and record source.', 'leads', 'inbox', 'normal', 'Guido', 50),
    ('Website Conversion Fixes', 'Fix Oval Crossroads copy that incorrectly references heirloom chair text.', 'website', 'next', 'high', 'Website', 10),
    ('Website Conversion Fixes', 'Fix dining table headline/font inconsistency.', 'website', 'next', 'high', 'Website', 20),
    ('Website Conversion Fixes', 'Synchronise fonts/formatting across core product pages.', 'website', 'inbox', 'normal', 'Website', 30),
    ('Website Conversion Fixes', 'Fix benchtop configurator finish-label inconsistency.', 'website', 'next', 'high', 'Website', 40),
    ('Website Conversion Fixes', 'Add hand-finished/handmade language to “What’s included”.', 'website', 'inbox', 'normal', 'Website', 50),
    ('Website Conversion Fixes', 'Standardise tabletop shape terminology: oval, pill, Danish oval, custom.', 'website', 'next', 'high', 'Website', 60),
    ('Website Conversion Fixes', 'Add/use top-down shape visuals to reduce ordering ambiguity.', 'website', 'inbox', 'normal', 'Website', 70),
    ('Website Conversion Fixes', 'Refresh About Us with warmer Guido/Nick/Dylan story.', 'website', 'parked', 'later', 'Website', 80),
    ('Commercial Outreach Engine', 'Build commercial/agent collateral set: cafe tables, restaurant tables, bar leaners, common sizes/heights.', 'commercial', 'inbox', 'high', 'Guido', 10),
    ('Commercial Outreach Engine', 'Ask Nick when Dylan can draw/render the commercial pieces.', 'commercial', 'next', 'high', 'Guido', 20),
    ('Commercial Outreach Engine', 'Decide exact standard commercial items and dimensions before Dylan starts.', 'commercial', 'next', 'high', 'Guido', 30),
    ('Commercial Outreach Engine', 'Expand commercial page with testimonials, project photos, credibility signals.', 'commercial', 'inbox', 'high', 'Website', 40),
    ('Customer Journey & Reviews', 'Define standard post-order communication timeline.', 'customer_journey', 'next', 'high', 'Guido', 10),
    ('Customer Journey & Reviews', 'Set up business SMS/digital number workflow for delivery check-ins.', 'customer_journey', 'inbox', 'high', 'Hermes', 20),
    ('Customer Journey & Reviews', 'Create Google review request timing/process.', 'customer_journey', 'inbox', 'high', 'Guido', 30),
    ('Customer Journey & Reviews', 'Develop offcut/story-board gift concept.', 'customer_journey', 'inbox', 'normal', 'Guido', 40),
    ('Customer Journey & Reviews', 'Order/prototype new-logo badges.', 'customer_journey', 'parked', 'later', 'Guido', 50),
    ('Materials, Supply & NZ Steel', 'Contact Vulcan about NZ-made 3mm 90x90 box section pricing/availability.', 'materials', 'next', 'normal', 'Guido', 10),
    ('Materials, Supply & NZ Steel', 'Confirm rimu availability for 43mm/thicker top requests.', 'materials', 'inbox', 'normal', 'Guido/Nick', 20),
    ('Materials, Supply & NZ Steel', 'Follow up David on timber/consignment timing.', 'materials', 'inbox', 'normal', 'Guido', 30),
    ('Materials, Supply & NZ Steel', 'Track tōtara delivery/kiln situation and decide whether it needs filleting.', 'materials', 'inbox', 'normal', 'Guido/Nick', 40),
    ('Materials, Supply & NZ Steel', 'Separate pinker tōtara boards for stained/darkwash tables and paler boards for natural finishes.', 'materials', 'inbox', 'normal', 'Nick/workshop', 50)
)
insert into public.work_tasks (project_id, source_id, title, area, status, priority, owner, sort_order)
select pr.id, sr.id, ts.title, ts.area, ts.status, ts.priority, ts.owner, ts.sort_order
from task_seed ts
join project_row pr on pr.name = ts.project_name
cross join source_row sr
where not exists (
  select 1
  from public.work_tasks wt
  where wt.title = ts.title
    and wt.project_id = pr.id
);
