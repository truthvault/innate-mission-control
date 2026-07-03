import assert from 'node:assert/strict';
import { invoiceExpectationForOrder, orderNeedsXeroInvoice } from '../lib/production/invoice-expectation.js';

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
  xero: null,
  xeroInvoiceNumber: null,
  freightRef: 'Mainfreight quote checked',
  deliveryLocation: 'Auckland',
  notes: '',
};

assert.equal(invoiceExpectationForOrder(baseOrder).state, 'required');
assert.equal(orderNeedsXeroInvoice(baseOrder), true);

const invoiced = { ...baseOrder, xeroInvoiceNumber: 'INV-1234' };
assert.equal(invoiceExpectationForOrder(invoiced).state, 'required');
assert.equal(orderNeedsXeroInvoice(invoiced), false);

const amanda = { ...baseOrder, customer: 'Amanda Lawrey', rawMondayItem: 'Sample', value: null };
assert.equal(invoiceExpectationForOrder(amanda).state, 'no_charge_sample');
assert.equal(orderNeedsXeroInvoice(amanda), false);

const flBeech = { ...baseOrder, customer: 'FL Beech Samples - Blackwash', rawMondayItem: 'Sample', value: null };
assert.equal(invoiceExpectationForOrder(flBeech).state, 'internal');
assert.equal(orderNeedsXeroInvoice(flBeech), false);

const blair = { ...baseOrder, customer: 'Blair York', rawMondayItem: 'Table + bench', value: null };
assert.equal(invoiceExpectationForOrder(blair).state, 'ignored');
assert.equal(orderNeedsXeroInvoice(blair), false);

console.log('invoice expectation tests passed');
