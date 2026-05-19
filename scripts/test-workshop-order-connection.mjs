import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');

const mustHave = [
  ['order connection label helper', 'function orderConnectionLabel('],
  ['connected badge copy', 'Connected'],
  ['needs order badge copy', 'Needs order'],
  ['possible match badge copy', 'Possible match'],
  ['task editor component', 'function WorkshopTaskEditor('],
  ['edit task action copy', 'Edit task'],
  ['save task action copy', 'Save task'],
  ['connect order action copy', 'Connect order'],
  ['internal work action copy', 'No customer / internal'],
  ['editable board task handler', 'function updateBoardTaskFromEditor('],
  ['stable task key for edited task links', 'function stablePlanTaskKey('],
  ['server-backed task edit save', 'taskEdit: {'],
  ['server-backed task edit load', 'taskEdits?: PlanTaskEdits'],
];

const apiMustHave = [
  ['task edit state in Tuesday storage', 'taskEdits: Record<string, PlanTaskEditValue>'],
  ['task edit cleaner', 'function cleanTaskEdit('],
  ['save task edits without requiring an order link', 'hasOrderIdField'],
];

const mustNotHave = [
  ['ambiguous assign badge', 'const taskBadge = isUnlinkedTask ? "Assign"'],
  ['Monday badge on task card', 'assignedOrderId ? "Tuesday" : task.linkedOrderIds.length > 0 ? "Monday"'],
  ['visible Monday source language', '>Linked in Monday<'],
];

const missing = mustHave.filter(([, needle]) => !source.includes(needle));
const apiMissing = apiMustHave.filter(([, needle]) => !apiSource.includes(needle));
const forbidden = mustNotHave.filter(([, needle]) => source.includes(needle));

if (missing.length || apiMissing.length || forbidden.length) {
  if (missing.length) {
    console.error('Workshop order-connection requirements missing:');
    for (const [label, needle] of missing) console.error(`- ${label}: ${needle}`);
  }
  if (apiMissing.length) {
    console.error('Workshop task persistence requirements missing:');
    for (const [label, needle] of apiMissing) console.error(`- ${label}: ${needle}`);
  }
  if (forbidden.length) {
    console.error('Workshop order-connection forbidden patterns present:');
    for (const [label, needle] of forbidden) console.error(`- ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log('OK: Workshop board order-connection, edit, and persistence requirements present');
