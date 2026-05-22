import { readFileSync } from 'node:fs';

const clientSource = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');
const dragSource = readFileSync(new URL('../lib/production/plan-drag.ts', import.meta.url), 'utf8');

const clientMustHave = [
  ['plan task edits can store done state', 'done?: boolean'],
  ['plan task edits apply done state to cards', 'done: edit.done ?? task.done'],
  ['card renders a Done button', 'data-task-card-done-button="task-card-done-button"'],
  ['done card can be undone', 'Undo'],
  ['done card is visually struck through', 'textDecoration: task.done ? "line-through" : "none"'],
  ['card done toggles persist through task edit save path', 'done: nextTask.done'],
  ['done button uses shared save handler', 'onTaskDoneToggle?: (task: DraggablePlanTask, done: boolean) => void'],
  ['order rows accept a done toggle handler', 'onTaskDoneToggle: (task: OrderJourneyTask, done: boolean) => void'],
  ['order rows render a Done button', 'data-order-row-done-button="order-row-done-button"'],
  ['order rows can undo done tasks', 'task.done ? "Undo" : "Done"'],
  ['order rows done button persists through same handler', 'onTaskDoneToggle(task, !task.done)'],
  ['done click triggers delight burst', 'triggerDelightBurst()'],
  ['delight burst is gated by query flag', 'delightEnabled && delightBurst'],
  ['delight burst has visible unicorn marker', 'data-delight-done-burst="delight-done-burst"'],
];

const apiMustHave = [
  ['plan task API accepts done flag', 'done?: unknown'],
  ['plan task API persists boolean done state', 'if (typeof source.done === "boolean") edit.done = source.done'],
];

const dragMustHave = [
  ['draggable task type carries done state', 'done?: boolean'],
];

const missing = [
  ...clientMustHave.filter(([, needle]) => !clientSource.includes(needle)).map(([label, needle]) => ['client', label, needle]),
  ...apiMustHave.filter(([, needle]) => !apiSource.includes(needle)).map(([label, needle]) => ['api', label, needle]),
  ...dragMustHave.filter(([, needle]) => !dragSource.includes(needle)).map(([label, needle]) => ['drag', label, needle]),
];

if (missing.length) {
  console.error('Production Plan task-card done button requirements missing:');
  for (const [file, label, needle] of missing) console.error(`- ${file}: ${label}: ${needle}`);
  process.exit(1);
}

console.log('OK: production plan task-card done button requirements present');
