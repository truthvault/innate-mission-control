import fs from 'node:fs';

const source = fs.readFileSync('app/leads/LeadsClient.tsx', 'utf8');

const mustHave = [
  ['cash first strip component', 'function CashFirstStrip('],
  ['cash first strip placement before Do Today', '<CashFirstStrip leads={activeRows} onSelect={(lead) => setSelectedId(lead.id)} />'],
  ['cash first strip title', 'Cash first'],
  ['read-only strip copy', 'Read-only: quotes and high-value leads only. No status changes here.'],
  ['cash first helper', 'function cashFirstLeads('],
  ['cash first sorts by cashflow', 'return leads.filter(isCashFirstLead).sort(sortByCashflow).slice(0, 4);'],
  ['cash first includes high-value active leads', 'function isCashFirstLead(lead: Lead)'],
  ['cash first value label', 'Total visible cash value'],
  ['cash first select-only label', 'Open context'],
];

const mustNotHaveNearStrip = [
  ['no save inside cash strip', 'function CashFirstStrip(', 'Save lead'],
  ['no create inside cash strip', 'function CashFirstStrip(', 'Create lead'],
  ['no edit inside cash strip', 'function CashFirstStrip(', 'Edit lead'],
];

const missing = mustHave.filter(([, needle]) => !source.includes(needle));
const forbidden = mustNotHaveNearStrip.filter(([, startNeedle, forbiddenNeedle]) => {
  const start = source.indexOf(startNeedle);
  if (start === -1) return false;
  const end = source.indexOf('\nfunction ', start + startNeedle.length);
  const chunk = source.slice(start, end === -1 ? source.length : end);
  return chunk.includes(forbiddenNeedle);
});

if (missing.length || forbidden.length) {
  if (missing.length) {
    console.error('Leads cash-first strip requirements missing:');
    for (const [label, needle] of missing) console.error(`- ${label}: ${needle}`);
  }
  if (forbidden.length) {
    console.error('Leads cash-first strip forbidden patterns present:');
    for (const [label,, needle] of forbidden) console.error(`- ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log('OK: Leads cash-first read-only strip requirements present');
