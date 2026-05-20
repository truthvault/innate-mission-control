#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { doToday, needsNextStep, sortLeads, doTodayReason } from '../lib/leads/prioritisation.mjs';
import { matchesLeadSearch } from '../lib/leads/search.mjs';

const baseLead = {
  id: 'base',
  customerName: 'Base Customer',
  contactName: 'Casey',
  email: 'casey@example.test',
  phone: '021000000',
  source: 'Website enquiry',
  sourceSystem: 'supabase',
  status: 'qualifying',
  priority: 'normal',
  owner: 'Guido',
  estimatedValue: 0,
  nextFollowUpAt: undefined,
  lastInteractionAt: '2026-05-18',
  lastInteractionSummary: 'Asked about oval dining table',
  nextAction: 'No Action',
  productCategory: 'Dining table',
  notes: 'Needs showroom visit',
  mondayItemId: '123',
  sampleSpecies: 'Totara',
  sampleStatus: 'sent',
  sampleDeliveredAt: '2026-05-19',
  sampleNextAction: 'Check sample response',
  updatedAt: '2026-05-18T00:00:00.000Z',
};

const today = '2026-05-20';

assert.equal(
  needsNextStep({ ...baseLead, status: 'waiting_on_customer', nextAction: 'No Action', nextFollowUpAt: undefined }),
  false,
  'waiting-on-customer leads with No Action should not be treated as missing next step'
);

assert.equal(
  doToday({ ...baseLead, status: 'waiting_on_customer', priority: 'hot', estimatedValue: 12000, nextAction: 'No Action', nextFollowUpAt: '2026-05-27' }, today),
  false,
  'future waiting-on-customer leads should stay out of Do Today until due'
);

assert.equal(
  doToday({ ...baseLead, status: 'waiting_on_customer', priority: 'hot', estimatedValue: 12000, nextAction: 'No Action', nextFollowUpAt: '2026-05-20' }, today),
  true,
  'waiting-on-customer leads should return to Do Today on their follow-up date'
);

assert.equal(
  doTodayReason({ ...baseLead, status: 'waiting_on_customer', nextFollowUpAt: '2026-05-27', nextAction: 'No Action' }, today),
  undefined,
  'non-action waiting leads should have no Do Today reason before due date'
);

assert.equal(
  doTodayReason({ ...baseLead, nextFollowUpAt: '2026-05-19', nextAction: 'Confirm quote decision' }, today),
  'follow_up_due',
  'overdue follow-ups should expose an explicit reason code'
);

assert.equal(matchesLeadSearch(baseLead, 'guido'), true, 'search should include owner');
assert.equal(matchesLeadSearch(baseLead, 'qualifying'), true, 'search should include status');
assert.equal(matchesLeadSearch(baseLead, 'normal'), true, 'search should include priority');
assert.equal(matchesLeadSearch(baseLead, 'supabase'), true, 'search should include source system');
assert.equal(matchesLeadSearch(baseLead, 'totara'), true, 'search should include sample species');
assert.equal(matchesLeadSearch(baseLead, '2026-05-19'), true, 'search should include relevant dates');
assert.equal(matchesLeadSearch({ ...baseLead, estimatedValue: 12500 }, '12500'), true, 'search should include estimated value as text');

assert.deepEqual(
  sortLeads([
    { ...baseLead, id: 'old', lastInteractionAt: '2026-05-01' },
    { ...baseLead, id: 'recent', lastInteractionAt: '2026-05-19' },
  ], 'last_contact_desc').map((lead) => lead.id),
  ['recent', 'old'],
  'last_contact_desc should put recently contacted leads first'
);

assert.deepEqual(
  sortLeads([
    { ...baseLead, id: 'quoted', status: 'quoted' },
    { ...baseLead, id: 'new', status: 'new' },
  ], 'status_asc').map((lead) => lead.id),
  ['new', 'quoted'],
  'status_asc should group by status label/order'
);

assert.deepEqual(
  sortLeads([
    { ...baseLead, id: 'website', source: 'Website enquiry' },
    { ...baseLead, id: 'architect', source: 'Architect referral' },
  ], 'source_asc').map((lead) => lead.id),
  ['architect', 'website'],
  'source_asc should sort by source'
);

const clientSource = fs.readFileSync('app/leads/LeadsClient.tsx', 'utf8');
assert.match(clientSource, /300_000|300000/, 'Leads page should auto-refresh from Supabase every 5 minutes');
assert.match(clientSource, /document\.visibilityState/, 'auto-refresh should only run when the page is visible');
assert.match(clientSource, /Auto-refresh paused while editing|auto-refresh paused while editing/i, 'UI should explain when auto-refresh pauses for edits');
assert.match(clientSource, /Writes disabled|Enable Supabase lead writes|Read-only until approved/i, 'write controls should clearly show when production writes are disabled');

console.log('lead local-fix tests OK');
