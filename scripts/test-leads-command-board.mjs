import fs from 'node:fs';

const source = fs.readFileSync('app/leads/LeadsClient.tsx', 'utf8');

const mustHave = [
  ['Do Today default filter', 'useState<LeadFilter>("do_today")'],
  ['overdue exact filter', '["overdue", "Overdue"]'],
  ['overdue exact KPI label', 'Overdue now'],
  ['cashflow quotes filter', '["cashflow", "Cashflow Quotes"]'],
  ['needs next step filter', '["needs_next_step", "Needs Next Step"]'],
  ['compact row component', 'function LeadRow('],
  ['detail drawer component', 'function LeadDrawer('],
  ['decision queue component', 'function DecisionQueue('],
  ['table header component', 'function LeadListHeader('],
  ['date normalization helper import', 'dateKey, doToday'],
  ['deduped warning helper', 'function leadWarnings('],
  ['drawer backdrop closes cleanly', 'onClick={closeDrawer}'],
  ['business labels not supabase labels', 'Add lead'],
  ['cashflow-first copy', 'Start here: protect cashflow and unblock Monday follow-ups.'],
  ['source-of-truth copy', 'Tuesday source-of-truth board'],
  ['source link label', 'Open source'],
  ['next action label helper', 'function sourceActionLabel('],
  ['booked visit context parser', 'function bookedVisitSummary('],
  ['modal not side drawer', 'placeItems: "center"'],
];

const mustNotHave = [
  ['always-visible row quick save', 'Quick save'],
  ['developer-facing new lead label', 'New Supabase lead'],
  ['developer-facing save label', 'Save Supabase update'],
  ['duplicate hot warning label', 'label: "Hot"'],
  ['duplicate quote sent warning label', 'label: "Quote sent"'],
  ['raw string due compare', 'lead.nextFollowUpAt && lead.nextFollowUpAt <= todayKey()'],
];

const missing = mustHave.filter(([, needle]) => !source.includes(needle));
const forbidden = mustNotHave.filter(([, needle]) => source.includes(needle));

if (missing.length || forbidden.length) {
  if (missing.length) {
    console.error('Leads polish requirements missing:');
    for (const [label, needle] of missing) console.error(`- ${label}: ${needle}`);
  }
  if (forbidden.length) {
    console.error('Leads polish forbidden patterns present:');
    for (const [label, needle] of forbidden) console.error(`- ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log('OK: Leads polished command-board requirements present');
