import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

const mustHave = [
  ['production plan mode type exists', 'type ProductionPlanMode = "schedule" | "orderRows"'],
  ['view mode state defaults to schedule', 'useState<ProductionPlanMode>("schedule")'],
  ['schedule toggle label exists', 'Schedule'],
  ['order rows toggle label exists', 'Order rows'],
  ['mode toggle component exists', 'function ProductionPlanModeToggle'],
  ['order journey row type exists', 'type OrderJourneyRow'],
  ['order journey task type exists', 'type OrderJourneyTask'],
  ['order journey builder exists', 'function buildOrderJourneyRows'],
  ['order journey renderer exists', 'function OrderJourneyView'],
  ['order rows explain straight-line journey', 'Customer / order journey'],
  ['order rows can open full order', 'Open order'],
  ['order rows can edit task', 'Edit task'],
  ['unlinked/internal section exists', 'Needs order / internal'],
  ['conditional render switches by mode', 'planViewMode === "schedule"'],
];

const missing = mustHave.filter(([, needle]) => !source.includes(needle));

if (missing.length) {
  console.error('Production Plan order journey view requirements missing:');
  for (const [label, needle] of missing) console.error(`- ${label}: ${needle}`);
  process.exit(1);
}

console.log('OK: production plan order journey toggle requirements present');
