import assert from 'node:assert/strict';
import { buildDailyBrief } from '../lib/tuesday/daily-brief.ts';

const now = '2026-05-24T21:00:00+12:00';

const brief = buildDailyBrief({
  now,
  leads: {
    rows: [
      {
        id: 'lead-hot-new',
        createdAt: '2026-05-24T08:00:00+12:00',
        updatedAt: '2026-05-24T08:00:00+12:00',
        customerName: 'Ada Ngata',
        source: 'Website configurator',
        productCategory: 'Dining table',
        estimatedValue: 8200,
        status: 'new',
        priority: 'hot',
        nextAction: 'Draft first reply',
        sourceSystem: 'supabase',
      },
      {
        id: 'lead-stale-quoted',
        createdAt: '2026-05-10T09:00:00+12:00',
        updatedAt: '2026-05-18T09:00:00+12:00',
        customerName: 'Miro Studio',
        productCategory: 'Boardroom',
        estimatedValue: 12600,
        status: 'quoted',
        priority: 'normal',
        lastInteractionAt: '2026-05-15T09:00:00+12:00',
        nextAction: 'Follow up quote',
        sourceSystem: 'supabase',
      },
    ],
    source: 'supabase',
    syncedAt: now,
  },
  orders: {
    items: [
      {
        id: 1001,
        customer: 'Late Table Co',
        product: 'Table',
        rawMondayItem: 'Table',
        rawMondayStatus: 'In production',
        rawMondayTopPanel: '2nd coat',
        rawMondayLegs: 'Ready',
        value: 6900,
        quantity: 1,
        status: 'In Production',
        stepsKey: 'TABLE_STEPS',
        currentStep: 3,
        stepNote: 'Top coating',
        orderedDate: '2026-05-01',
        shipDate: '2026-05-23',
        xero: null,
        xeroInvoiceNumber: null,
        freightRef: null,
        deliveryLocation: 'Wellington',
        notes: '',
      },
      {
        id: 1002,
        customer: 'Due Soon Cafe',
        product: 'Table',
        rawMondayItem: 'Table + bench',
        rawMondayStatus: 'To Process',
        rawMondayTopPanel: 'Unstarted',
        rawMondayLegs: 'Unstarted',
        value: 7800,
        quantity: 1,
        status: 'Not Started',
        stepsKey: 'TABLE_STEPS',
        currentStep: 0,
        stepNote: 'Waiting to start',
        orderedDate: '2026-05-15',
        shipDate: '2026-05-27',
        xero: 'https://xero.example/invoice',
        xeroInvoiceNumber: 'INV-2001',
        freightRef: 'MF-123',
        deliveryLocation: 'Auckland',
        notes: '',
      },
    ],
    source: 'cache',
    syncedAt: now,
    warnings: [],
  },
  samples: {
    board: {
      boardId: 'samples',
      boardName: 'Sample stock',
      cells: [],
      summary: {
        total: 12,
        outCount: 1,
        lowCount: 2,
        okCount: 9,
        readyFullSets: 2,
        byType: [],
        byFinish: [],
        topUps: [
          { sampleType: 'Customer samples', species: 'Totara', finish: 'Clear', count: 0, level: 'out', mondayItemId: 'sample-1', mondayUrl: 'https://monday.example/sample-1' },
        ],
      },
    },
    source: 'snapshot',
    syncedAt: '2026-05-23T08:00:00+12:00',
  },
  freight: {
    rows: [
      {
        id: 'freight-1',
        timestamp: '2026-05-24T07:00:00+12:00',
        status: 'estimated',
        productHandle: 'crossroads-dining-table',
        variantTitle: '2400 x 1000',
        variantId: 'gid://variant/1',
        tableLengthMm: 2400,
        tableWidthMm: 1000,
        benchCount: 2,
        addressEntered: 'Rural delivery, Nelson',
        suburb: 'Moutere',
        city: 'Nelson',
        postCode: '7005',
        estimateInclGst: 640,
        rawMainfreightInclGst: 640,
        manualCheckOffered: true,
        packageItems: 3,
        totalCubicMetres: 1.8,
        totalWeightKg: 180,
        source: 'shopify-configurator',
        pageUrl: 'https://innate.example/products/crossroads',
        referer: '',
        userAgent: '',
        packageSummary: '3 packages',
      },
    ],
    source: 'supabase',
    syncedAt: now,
  },
  cash: {
    source: 'live',
    label: 'Xero cash signal live',
    detail: '1 overdue receivable, 1 bill due in 30 days.',
    syncedAt: now,
    tenantName: 'Innate Furniture',
    riskStatus: 'red',
    overdueReceivables: {
      count: 1,
      amountDue: 12500,
      invoices: [{ invoiceNumber: 'INV-3001', contact: 'Commercial Fitout Co', dueDate: '2026-05-20', amountDue: 12500, xeroUrl: 'https://xero.example/INV-3001' }],
    },
    payableBuckets: [
      { label: '7 days', count: 1, amountDue: 3200, invoices: [{ invoiceNumber: 'BILL-1', contact: 'Supplier', dueDate: '2026-05-28', amountDue: 3200, xeroUrl: null }] },
      { label: '14 days', count: 1, amountDue: 3200, invoices: [] },
      { label: '30 days', count: 1, amountDue: 3200, invoices: [] },
    ],
  },
});

assert.equal(brief.title, 'Owner Daily Brief');
assert.equal(brief.safeToIgnore, false, 'non-empty risks should not be safe to ignore');
assert.equal(brief.sections.hotLeads.items[0]?.title, 'Ada Ngata');
assert.match(brief.sections.staleFollowUps.items[0]?.detail ?? '', /9 days/i);
assert.equal(brief.sections.production.items[0]?.title, 'Late Table Co');
assert.match(brief.sections.customerPromises.items[0]?.detail ?? '', /ship date passed/i);
assert.match(brief.sections.cash.items[0]?.title ?? '', /Red cash risk/i);
assert.match(brief.sections.cash.items[1]?.detail ?? '', /overdue in Xero/i);
assert.equal(brief.sections.cash.items[1]?.ownerAction?.kind, 'check_invoice', 'overdue receivables should prompt invoice checking only');
assert.ok(brief.sections.cash.items.some((item) => /invoice link missing/i.test(item.title)), 'missing invoice links on active orders should surface in cash section');
assert.equal(brief.sections.staleFollowUps.items[0]?.ownerAction?.kind, 'draft_follow_up', 'stale follow-ups should prompt a draft follow-up');
assert.equal(brief.sections.customerPromises.items[0]?.ownerAction?.kind, 'needs_guido_decision', 'customer promise risks should need Guido judgement');
assert.equal(brief.sections.production.items[0]?.ownerAction?.kind, 'needs_guido_decision', 'late customer-oriented production risks should need Guido judgement');
assert.equal(brief.sections.production.items[1]?.ownerAction?.kind, 'ask_nick', 'due-soon workshop blockers should prompt asking Nick');
assert.equal(brief.sections.freightAndSamples.items.length, 2, 'manual freight check and sample top-up should both surface');
assert.match(brief.mostImportantDecision.prompt, /Late Table Co/i);
assert.deepEqual(
  brief.sourceHealth.map((source) => [source.label, source.state]),
  [
    ['Leads / Supabase', 'live'],
    ['Orders / Monday', 'live'],
    ['Samples / Monday', 'stale'],
    ['Freight quotes', 'live'],
    ['Cash / Xero', 'live'],
  ],
);

const quietBrief = buildDailyBrief({
  now,
  leads: { rows: [], source: 'none', syncedAt: now },
  orders: { items: [], source: 'none', syncedAt: now, warnings: [] },
  samples: { board: null, source: 'none', syncedAt: now },
  freight: { rows: [], source: 'missing', syncedAt: now, error: 'Missing quote log config' },
  cash: { source: 'missing', label: 'Xero not connected in this brief yet' },
});

assert.equal(quietBrief.safeToIgnore, false, 'missing sources should not produce a false all-clear');
assert.match(quietBrief.safeToIgnoreMessage ?? '', /could not be verified/i);
assert.equal(quietBrief.mostImportantDecision.prompt, 'No owner decision needed from the connected sources today.');

console.log('daily-brief tests passed');
