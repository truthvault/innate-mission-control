import assert from 'node:assert/strict';
import {
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
    ['friday', 'nick'],
  ],
  'table orders get one suggested step across each weekday lane'
);
assert.equal(suggestions[0].dateLabel, '18 May');
assert.equal(suggestions[0].dateIso, '2026-05-18');
assert.match(suggestions[0].title, /Material/i);
assert.ok(suggestions.every((s) => s.noWriteLabel === 'Suggested plan · no writes yet'));
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
assert.ok(approvedDraft.every((task) => task.noWriteLabel === 'Approved draft · no external writes yet'));

const capacityOk = summarizeLaneCapacity({ existingTaskCount: 1, draftHours: 2 });
assert.equal(capacityOk.status, 'ok');
assert.equal(capacityOk.totalHours, 4);
assert.equal(capacityOk.label, '4h / 7h');
assert.match(capacityOk.detail, /1 existing.*2h draft/i);

const capacityWatch = summarizeLaneCapacity({ existingTaskCount: 2, draftHours: 3 });
assert.equal(capacityWatch.status, 'watch');
assert.equal(capacityWatch.totalHours, 7);
assert.equal(capacityWatch.label, '7h / 7h');

const capacityOver = summarizeLaneCapacity({ existingTaskCount: 2, draftHours: 8 });
assert.equal(capacityOver.status, 'over');
assert.equal(capacityOver.totalHours, 12);
assert.equal(capacityOver.label, '12h / 7h');
assert.match(capacityOver.detail, /Over capacity/i);

console.log('new-order-planning tests passed');
