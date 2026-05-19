#!/usr/bin/env node
import assert from 'node:assert/strict';
import { doToday, sortLeads } from '../lib/leads/prioritisation.mjs';

const baseLead = {
  id: 'base',
  customerName: 'Base',
  status: 'qualifying',
  priority: 'normal',
  estimatedValue: 0,
  nextFollowUpAt: undefined,
  nextAction: 'No Action',
  productCategory: 'Dining table',
  updatedAt: '2026-05-18T00:00:00.000Z',
};

const today = '2026-05-20';

const aidanDecking = {
  ...baseLead,
  id: 'aidan',
  customerName: 'Gem Builders - Aidan Hutchison',
  productCategory: 'Decking',
  estimatedValue: 8000,
  nextFollowUpAt: '2026-05-22',
  nextAction: 'No Action',
};

assert.equal(
  doToday(aidanDecking, today),
  true,
  'Aidan decking should be in Do Today because it has a follow-up this week and no real next step'
);

assert.deepEqual(
  sortLeads([
    { ...baseLead, id: 'low', customerName: 'Low', estimatedValue: 1000, nextFollowUpAt: '2026-05-25' },
    { ...baseLead, id: 'high', customerName: 'High', estimatedValue: 9000, nextFollowUpAt: '2026-05-27' },
  ], 'value_desc').map((lead) => lead.id),
  ['high', 'low'],
  'value_desc sort should put highest value first'
);

assert.deepEqual(
  sortLeads([
    { ...baseLead, id: 'later', customerName: 'Later', nextFollowUpAt: '2026-05-29' },
    { ...baseLead, id: 'sooner', customerName: 'Sooner', nextFollowUpAt: '2026-05-21' },
  ], 'follow_up_asc').map((lead) => lead.id),
  ['sooner', 'later'],
  'follow_up_asc sort should put nearest dated follow-up first'
);

console.log('lead prioritisation tests OK');
