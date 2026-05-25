import assert from 'node:assert/strict';
import {
  reconcileSourceOfTruth,
  renderReconciliationMarkdown,
  normalizeInvoiceNumber,
} from '../lib/tuesday/source-of-truth-reconciliation.ts';

assert.equal(normalizeInvoiceNumber('inv1123'), 'INV-1123');
assert.equal(normalizeInvoiceNumber('INV--1123'), 'INV-1123');
assert.equal(normalizeInvoiceNumber('invoice INV 1123'), 'INV-1123');

const result = reconcileSourceOfTruth({
  runAt: '2026-05-25T02:30:00.000Z',
  supabase: {
    status: 'connected',
    orders: [
      {
        id: 'order-1',
        customerName: 'Blair York',
        canonicalStatus: 'complete',
        total: 3000,
        xeroInvoiceNumber: 'INV-1001',
        mondayItemId: '501',
      },
      {
        id: 'order-2',
        customerName: 'Kelven Plamondon',
        canonicalStatus: 'finished',
        total: 4000,
        xeroInvoiceNumber: 'INV-2001',
        mondayItemId: '502',
      },
      {
        id: 'order-3',
        customerName: 'Abigail Richards / Michael Calder',
        canonicalStatus: 'in_production',
        total: 5000,
        xeroInvoiceNumber: null,
        mondayItemId: '503',
      },
    ],
  },
  monday: {
    status: 'connected',
    orders: [
      { id: 501, customer: 'Blair York', status: 'Collected', rawMondayStatus: 'Collected', xeroInvoiceNumber: 'INV-1001' },
      { id: 502, customer: 'Kelven Plamondon', status: 'Collected', rawMondayStatus: 'Collected', xeroInvoiceNumber: 'INV-2001' },
      { id: 503, customer: 'Abigail Richards / Michael Calder', status: 'In Production', rawMondayStatus: 'In production', xeroInvoiceNumber: null },
    ],
  },
  xero: {
    status: 'connected',
    documents: [
      { source: 'xero', documentType: 'invoice', invoiceNumber: 'INV-1001', status: 'PAID', total: 3000, amountPaid: 3000, amountDue: 0, contactName: 'Blair York', sentConfidence: 'exact' },
      { source: 'xero', documentType: 'invoice', invoiceNumber: 'INV-2001', status: 'AUTHORISED', total: 1000, amountPaid: 500, amountDue: 500, contactName: 'Kelven Plamondon', sentConfidence: 'unknown' },
      { source: 'xero', documentType: 'invoice', invoiceNumber: 'INV-2002', status: 'AUTHORISED', total: 3000, amountPaid: 0, amountDue: 3000, contactName: 'Kelven Plamondon', sentConfidence: 'probable' },
    ],
  },
  akahu: {
    status: 'connected',
    payments: [
      { source: 'akahu', transactionId: 'txn-1', amount: 3000, date: '2026-05-25', payerName: 'Blair York', reference: 'INV1001', confidence: 0.99, reasons: ['exact_invoice_reference'] },
      { source: 'akahu', transactionId: 'txn-2', amount: 500, date: '2026-05-25', payerName: 'Kelven Plamondon', reference: 'INV-2001 deposit', confidence: 0.98, reasons: ['exact_invoice_reference'] },
      { source: 'akahu', transactionId: 'txn-3', amount: 2500, date: '2026-05-25', payerName: 'Mystery Customer', reference: 'table', confidence: 0.2, reasons: ['weak_name_amount_only'] },
    ],
  },
});

assert.equal(result.sourceStatuses.supabase, 'connected');
assert.equal(result.sourceStatuses.xero, 'connected');
assert.equal(result.orders.length, 3);

const blair = result.orders.find((order) => order.orderId === 'order-1');
assert.equal(blair?.financialStatus, 'paid_in_full');
assert.equal(blair?.balanceDue, 0);
assert.equal(blair?.invoiceCount, 1);
assert.equal(blair?.mondayDrift.length, 0, 'collected Monday mirror agrees with complete Supabase state');

const kelven = result.orders.find((order) => order.orderId === 'order-2');
assert.equal(kelven?.financialStatus, 'part_paid');
assert.equal(kelven?.invoiceCount, 2, 'multiple Xero invoices roll up to one order');
assert.equal(kelven?.invoiceTotal, 4000);
assert.equal(kelven?.bankAmountMatched, 500);
assert.equal(kelven?.balanceDue, 3500);
assert.ok(kelven?.matchReasons.some((reason) => reason.includes('Multiple Xero documents')));
assert.equal(kelven?.mondayDrift[0]?.kind, 'status_mismatch');
assert.match(kelven?.mondayDrift[0]?.message ?? '', /Monday mirror says Collected/);

const abigail = result.orders.find((order) => order.orderId === 'order-3');
assert.equal(abigail?.financialStatus, 'not_invoiced');
assert.equal(abigail?.invoiceCount, 0);

assert.equal(result.unmatchedPayments.length, 1, 'weak Akahu payment remains unmatched for review');
assert.equal(result.unmatchedPayments[0].transactionId, 'txn-3');
assert.ok(result.reportItems.some((item) => item.issue.includes('Supabase/Monday drift')));

const disconnected = reconcileSourceOfTruth({
  runAt: '2026-05-25T02:30:00.000Z',
  supabase: { status: 'not_connected', orders: [], error: 'missing SUPABASE_SERVICE_ROLE_KEY' },
  monday: { status: 'not_connected', orders: [], error: 'missing MONDAY_API_TOKEN' },
  xero: { status: 'xero_not_connected', documents: [], error: 'missing XERO_CLIENT_ID/XERO_CLIENT_SECRET' },
  akahu: { status: 'akahu_not_connected', payments: [], error: 'missing AKAHU_APP_TOKEN' },
});
assert.equal(disconnected.sourceStatuses.xero, 'xero_not_connected');
assert.equal(disconnected.sourceStatuses.akahu, 'akahu_not_connected');
assert.doesNotThrow(() => renderReconciliationMarkdown(disconnected));

const markdown = renderReconciliationMarkdown(result);
assert.match(markdown, /Source-of-truth reconciliation/);
assert.match(markdown, /Kelven Plamondon/);
assert.match(markdown, /Unmatched deposits/);

console.log('source-of-truth reconciliation tests passed');
