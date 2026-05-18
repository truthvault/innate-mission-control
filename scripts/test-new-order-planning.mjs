import assert from 'node:assert/strict';
import {
  buildStandardDiningTablePlanForOrder,
  selectNewOrderForPlanning,
  buildSuggestedPlanForOrder,
  approveSuggestedPlanSteps,
  summarizeLaneCapacity,
} from '../lib/production/new-order-planning.ts';

const orders = [
  {
    id: 1,
    customer: 'Older Started',
    rawMondayItem: 'Table',
    rawMondayStatus: 'Materials Ready',
    status: 'In Production',
    orderedDate: '2026-05-01',
    product: 'Table',
    rawMondayTopPanel: null,
    rawMondayLegs: null,
    value: null,
    stepsKey: 'TABLE_STEPS',
    currentStep: 0,
    stepNote: '',
    shipDate: null,
    xero: null,
    notes: '',
  },
  {
    id: 2,
    customer: 'Older New',
    rawMondayItem: 'Panel',
    rawMondayStatus: 'To Process',
    status: 'Not Started',
    orderedDate: '2026-05-02',
    product: 'Panel',
    rawMondayTopPanel: null,
    rawMondayLegs: null,
    value: null,
    stepsKey: 'PANEL_STEPS',
    currentStep: 0,
    stepNote: '',
    shipDate: null,
    xero: null,
    notes: '',
  },
  {
    id: 3,
    customer: 'Newest New',
    rawMondayItem: 'Table + bench',
    rawMondayStatus: 'To Process',
    status: 'Not Started',
    orderedDate: '2026-05-11',
    product: 'Table',
    rawMondayTopPanel: 'Tōtara',
    rawMondayLegs: 'Black steel',
    value: 7000,
    stepsKey: 'TABLE_STEPS',
    currentStep: 0,
    stepNote: '',
    shipDate: '2026-06-01',
    xero: null,
    notes: '',
  },
];

const plannedOrderIds = new Set([2]);
const selected = selectNewOrderForPlanning(orders, plannedOrderIds, new Set(['Talia Bloodworth']));
assert.equal(selected?.id, 3, 'selects the newest unplanned To Process order');
assert.equal(selected?.customer, 'Newest New');

const suggestions = buildSuggestedPlanForOrder(selected, new Date('2026-05-15T12:00:00+12:00'));
assert.deepEqual(
  suggestions.map((s) => [s.day, s.person]),
  [
    ['monday', 'nick'],
    ['tuesday', 'nick'],
    ['wednesday', 'dylan'],
    ['thursday', 'dylan'],
    ['monday', 'nick'],
  ],
  'table orders avoid Friday by default and roll extra steps to the next workshop week'
);
assert.equal(suggestions[0].dateLabel, '18 May');
assert.equal(suggestions[0].dateIso, '2026-05-18');
assert.equal(suggestions[4].dateIso, '2026-05-25');
assert.match(suggestions[0].title, /Material/i);
assert.ok(suggestions.every((s) => s.noWriteLabel === 'Suggested plan'));
assert.deepEqual(
  suggestions.map((s) => s.estimatedHours),
  [1, 1, 1, 1, 1],
  'table suggestions default each suggested task to one workshop hour'
);
assert.equal(
  suggestions.reduce((sum, step) => sum + step.estimatedHours, 0),
  5,
  'table suggestions start with a light total estimated workshop-hours budget'
);

const approvedDraft = approveSuggestedPlanSteps(selected, suggestions);
assert.equal(approvedDraft.length, 5, 'approve creates one draft task per suggested step');
assert.deepEqual(
  approvedDraft.map((task) => [task.day, task.person, task.text, task.estimatedHours]),
  suggestions.map((step) => [step.day, step.person, step.title, step.estimatedHours]),
  'approved draft keeps edited day/person/title/hour values for placement into the plan grid'
);
assert.ok(approvedDraft.every((task) => task.rowName === 'Newest New'));
assert.ok(approvedDraft.every((task) => task.noWriteLabel === 'Approved plan'));

const steelTableOrder = {
  id: 4,
  customer: 'Steel Table New',
  rawMondayItem: 'Table',
  rawMondayStatus: 'To Process',
  status: 'Not Started',
  orderedDate: '2026-05-11',
  product: 'Table',
  rawMondayTopPanel: 'Unstarted',
  rawMondayLegs: 'Unstarted',
  value: 7000,
  stepsKey: 'TABLE_STEPS',
  currentStep: 0,
  stepNote: '',
  shipDate: '2026-06-15',
  xero: null,
  notes: '',
  deliveryLocation: '81 Te Kopia Rd, Rotorua',
};
const standardTableSuggestions = buildStandardDiningTablePlanForOrder(steelTableOrder, new Date('2026-05-15T12:00:00+12:00'));
assert.deepEqual(
  standardTableSuggestions.map((s) => [s.title, s.person, s.estimatedHours]),
  [
    ['Pull timber', 'dylan', 1],
    ['Send POs', 'nick', 1],
    ['Bottom: stress cuts + inserts', 'dylan', 1],
    ['Top: sand + 1st coat', 'dylan', 1],
    ['Top: 2nd coat', 'dylan', 0.5],
    ['Top: 3rd coat', 'dylan', 0.5],
    ['QC + photos + box/wrap', 'dylan', 2],
    ['Book freight', 'nick', 0.5],
  ],
  'steel dining table template uses the standard owners and durations'
);
assert.equal(standardTableSuggestions[0].dateIso, '2026-05-18');
assert.equal(standardTableSuggestions[2].dateIso, '2026-06-02', 'steel table template leaves about two workshop weeks after POs before bottom prep');
assert.equal(standardTableSuggestions[6].dateIso, '2026-06-15', 'steel table template leaves curing time before QC/pack');
assert.match(standardTableSuggestions.at(-1)?.detail ?? '', /Guido approval/i, 'book freight is clearly marked for Guido approval');

const genericTableSuggestions = buildStandardDiningTablePlanForOrder({
  ...steelTableOrder,
  id: 44,
  rawMondayItem: 'Coffee table',
}, new Date('2026-05-15T12:00:00+12:00'));
assert.equal(genericTableSuggestions.length, 0, 'non-standard table text does not get the standard dining-table template');

const materialsReadySteel = buildStandardDiningTablePlanForOrder({
  ...steelTableOrder,
  id: 5,
  rawMondayStatus: 'Materials Ordered',
  orderedDate: '2026-04-29',
}, new Date('2026-05-15T12:00:00+12:00'));
assert.equal(materialsReadySteel[0]?.title, 'Bottom: stress cuts + inserts', 'materials-ordered steel tables skip timber/PO setup');

const coatingSteel = buildStandardDiningTablePlanForOrder({
  ...steelTableOrder,
  id: 6,
  rawMondayStatus: 'In production',
  orderedDate: '2026-05-14',
  rawMondayTopPanel: '1st coat',
  deliveryLocation: '20 Aberdeen Street, Christchurch',
}, new Date('2026-05-15T12:00:00+12:00'));
assert.equal(coatingSteel[0]?.title, 'Top: 2nd coat', '1st-coat steel tables pick up from the next coating task');
assert.equal(coatingSteel[0]?.dateIso, '2026-05-18', 'in-production coating tasks start next workshop day, not after the material wait');
assert.equal(coatingSteel.find((step) => step.title.includes('QC'))?.title, 'QC + photos + assemble', 'Christchurch delivery defaults to assemble instead of box/wrap');
assert.equal(coatingSteel.find((step) => step.title.includes('QC'))?.estimatedHours, 1);

const thirdCoatSteel = buildStandardDiningTablePlanForOrder({
  ...steelTableOrder,
  id: 7,
  rawMondayStatus: 'In production',
  orderedDate: '2026-05-14',
  rawMondayTopPanel: '3rd coat',
}, new Date('2026-05-15T12:00:00+12:00'));
assert.equal(thirdCoatSteel[0]?.title, 'QC + photos + box/wrap', '3rd-coat steel tables move to QC/dispatch instead of restarting setup');
assert.equal(thirdCoatSteel[0]?.dateIso, '2026-05-25', '3rd-coat steel tables keep curing buffer before QC');

const capacityOk = summarizeLaneCapacity({ existingTaskCount: 1, draftHours: 2 });
assert.equal(capacityOk.status, 'ok');
assert.equal(capacityOk.totalHours, 3);
assert.equal(capacityOk.label, '3h / 7h');
assert.match(capacityOk.detail, /1 existing.*~1h.*2h draft/i);

const fiveExistingPlaceholders = summarizeLaneCapacity({ existingTaskCount: 5, draftHours: 0 });
assert.equal(fiveExistingPlaceholders.status, 'ok');
assert.equal(fiveExistingPlaceholders.totalHours, 5);
assert.equal(fiveExistingPlaceholders.label, '5h / 7h');

const capacityWatch = summarizeLaneCapacity({ existingTaskCount: 4, draftHours: 3 });
assert.equal(capacityWatch.status, 'watch');
assert.equal(capacityWatch.totalHours, 7);
assert.equal(capacityWatch.label, '7h / 7h');

const capacityOver = summarizeLaneCapacity({ existingTaskCount: 4, draftHours: 4 });
assert.equal(capacityOver.status, 'over');
assert.equal(capacityOver.totalHours, 8);
assert.equal(capacityOver.label, '8h / 7h');
assert.match(capacityOver.detail, /Over capacity/i);

console.log('new-order-planning tests passed');
