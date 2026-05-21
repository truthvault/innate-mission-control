import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');

const mustHave = [
  ['editor uses same yellow review glow as highlighted tasks', 'data-workshop-task-editor-glow="review-glow"'],
  ['editor modal uses review glow border', 'border: `1px solid ${REVIEW_GLOW.borderStrong}`'],
  ['editor modal uses review glow shadow', 'boxShadow: REVIEW_GLOW.modalShadow'],
  ['editor copy mentions hours can be corrected', 'task wording, or hours'],
  ['hours field label', 'Hours allocated'],
  ['hours field aria label', 'aria-label="Hours allocated"'],
  ['task card hour display comes from edited task hours', 'formatTaskHours(task.estimatedHours)'],
  ['task edit type can persist estimated hours', 'estimatedHours?: number'],
  ['task edit save posts estimated hours', 'estimatedHours: nextTask.estimatedHours'],
  ['editor can open full order details', 'Open full order details'],
  ['editor receives order open handler', 'onOpenOrder: (orderId: number) => void'],
  ['editor order-open action invokes handler', 'onOpenOrder(Number(orderId))'],
  ['editor closes before opening full order overlay', 'onClose();\n    onOpenOrder(Number(orderId));'],
];

const apiMustHave = [
  ['api task edit accepts estimated hours', 'estimatedHours?: unknown'],
  ['api task edit persists non-negative estimated hours', 'edit.estimatedHours = Math.max(0, Math.round(estimatedHours * 2) / 2)'],
];

const missing = mustHave.filter(([, needle]) => !source.includes(needle));
const apiMissing = apiMustHave.filter(([, needle]) => !apiSource.includes(needle));

if (missing.length || apiMissing.length) {
  if (missing.length) {
    console.error('Workshop task editor upgrade requirements missing:');
    for (const [label, needle] of missing) console.error(`- ${label}: ${needle}`);
  }
  if (apiMissing.length) {
    console.error('Workshop task editor API requirements missing:');
    for (const [label, needle] of apiMissing) console.error(`- ${label}: ${needle}`);
  }
  process.exit(1);
}

console.log('OK: workshop task editor glow, order details, and hours editing requirements present');
