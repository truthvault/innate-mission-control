import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../app/production/plan/page.tsx', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

const pageMustHave = [
  ['page accepts searchParams promise', 'searchParams: Promise<{ [key: string]: string | string[] | undefined }>'],
  ['page awaits searchParams', 'const query = await searchParams'],
  ['page derives delight v4 flag', 'delightEnabled={query.delight === "v4"}'],
];

const clientMustHave = [
  ['client prop carries delight flag', 'delightEnabled?: boolean'],
  ['client renders unicorn layer when enabled', 'delightEnabled && <DelightUnicorn />'],
  ['unicorn component exists', 'function DelightUnicorn()'],
  ['unicorn is findable in live bundle', 'Tuesday delight unicorn'],
  ['unicorn emoji is present', '🦄'],
];

const missing = [
  ...pageMustHave.filter(([, needle]) => !pageSource.includes(needle)).map(([label, needle]) => ['page', label, needle]),
  ...clientMustHave.filter(([, needle]) => !clientSource.includes(needle)).map(([label, needle]) => ['client', label, needle]),
];

if (missing.length) {
  console.error('Production Plan delight unicorn requirements missing:');
  for (const [file, label, needle] of missing) console.error(`- ${file}: ${label}: ${needle}`);
  process.exit(1);
}

console.log('OK: production plan delight unicorn requirements present');
