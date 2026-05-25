#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(source, /TABLE_TASK_STAGE_SUGGESTIONS/, 'Production Plan should define standard table-stage suggestions for task editing');
assert.match(source, /Stage suggestion/, 'Task editor should label the recommended stage dropdown clearly');
assert.match(source, /Choose standard table stage/, 'Task editor should prompt Nick to choose a standard table stage first');
assert.match(source, /STAGE_CUSTOM_VALUE/, 'Task editor should keep Custom as an explicit secondary option');
assert.match(source, /setDraft\(\(current\) => \(\{ \.\.\.current, text: event\.target\.value \}\)\)/, 'Picking a suggested stage should update the task text');
assert.match(source, /value=\{TABLE_TASK_STAGE_SUGGESTIONS\.includes\(draft\.text as \(typeof TABLE_TASK_STAGE_SUGGESTIONS\)\[number\]\) \? draft\.text : STAGE_CUSTOM_VALUE\}/, 'Custom should only be selected when task text is not one of the standard table stages');
