#!/usr/bin/env node
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  runSourceOfTruthReconciliation,
  renderReconciliationMarkdown,
} from '../lib/tuesday/source-of-truth-reconciliation.ts';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const format = argValue('--format') || 'markdown';
const out = argValue('--out');
const writeSafeEvents = process.argv.includes('--write-safe-events');

if (writeSafeEvents) {
  console.error('Refusing --write-safe-events: this first-pass runner is report-only. No Supabase/Monday/Xero/Akahu writes are implemented.');
  process.exit(2);
}

const result = await runSourceOfTruthReconciliation();
const body = format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : `${renderReconciliationMarkdown(result)}\n`;

if (out) {
  const outputPath = path.resolve(out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, body, 'utf8');
  console.log(`Wrote read-only reconciliation ${format} report to ${outputPath}`);
} else {
  process.stdout.write(body);
}
