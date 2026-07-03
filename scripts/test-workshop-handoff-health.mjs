import assert from 'node:assert/strict';
import { buildWorkshopHandoff, summarizeWorkshopHandoffs } from '../lib/production/handoff-health.ts';

const baseOrder = {
  id: 101,
  customer: 'Trusty Table',
  product: 'Table',
  rawMondayItem: 'Table',
  rawMondayStatus: 'In production',
  rawMondayTopPanel: '2nd coat',
  rawMondayLegs: 'Black steel',
  value: 8500,
  quantity: 1,
  status: 'In Production',
  stepsKey: 'TABLE_STEPS',
  currentStep: 8,
  stepNote: '2nd Coat',
  orderedDate: '2026-05-01',
  shipDate: '2026-06-01',
  xero: 'https://in.xero.com/example',
  xeroInvoiceNumber: 'INV-1234',
  freightRef: 'Mainfreight quote checked',
  deliveryLocation: 'Auckland',
  notes: 'Customer wants delivery after 10am',
};

const ready = buildWorkshopHandoff(baseOrder);
assert.equal(ready.level, 'ready');
assert.equal(ready.label, 'Ready for workshop');
assert.deepEqual(ready.missing, []);
assert.ok(ready.present.includes('item/spec'));
assert.ok(ready.present.includes('delivery/collection'));

const missingInvoice = buildWorkshopHandoff({ ...baseOrder, xero: null, xeroInvoiceNumber: null });
assert.equal(missingInvoice.level, 'check', 'missing invoice link is a check, not a hard workshop block');
assert.ok(missingInvoice.missing.includes('Xero/invoice link'));

const blocked = buildWorkshopHandoff({
  ...baseOrder,
  rawMondayItem: null,
  product: 'Other',
  rawMondayTopPanel: null,
  stepNote: '',
  shipDate: null,
  freightRef: null,
  deliveryLocation: null,
  xero: null,
  xeroInvoiceNumber: null,
});
assert.equal(blocked.level, 'blocked');
assert.equal(blocked.label, 'Needs detail');
assert.ok(blocked.missing.includes('item/spec'));
assert.ok(blocked.missing.includes('due date'));
assert.ok(blocked.next.includes('Confirm'));

const sample = buildWorkshopHandoff({
  ...baseOrder,
  id: 202,
  rawMondayItem: 'Sample',
  rawMondayStatus: 'To Process',
  product: 'Table',
  xero: null,
  xeroInvoiceNumber: null,
  shipDate: '2026-06-03',
  notes: '',
});
assert.equal(sample.level, 'ready', 'samples do not need Xero to be workshop-ready');
assert.ok(sample.present.includes('sample follow-up cue'));
assert.ok(sample.present.includes('No-charge sample'));

const internalSample = buildWorkshopHandoff({
  ...baseOrder,
  id: 203,
  customer: 'FL Beech Samples - Blackwash',
  rawMondayItem: 'Sample',
  rawMondayStatus: 'In production',
  product: 'Table',
  xero: null,
  xeroInvoiceNumber: null,
  shipDate: '2026-06-03',
  notes: '',
});
assert.ok(internalSample.present.includes('Internal / no invoice'));

const summary = summarizeWorkshopHandoffs([
  baseOrder,
  { ...baseOrder, id: 102, xero: null, xeroInvoiceNumber: null },
  { ...baseOrder, id: 103, rawMondayItem: null, product: 'Other', shipDate: null, freightRef: null, deliveryLocation: null, rawMondayTopPanel: null, stepNote: '', xero: null, xeroInvoiceNumber: null },
  { ...baseOrder, id: 104, status: 'Collected' },
]);
assert.deepEqual(summary, { active: 3, ready: 1, check: 1, blocked: 1 });

console.log('workshop handoff health tests passed');
