#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/production/plan/page.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(page, /readPlanTaskLinksState/, 'Production Plan page should read Tuesday state on the server');
assert.match(page, /initialPlanTaskLinkState=\{planTaskLinks\.state\}/, 'PlanClient should receive seeded task-link state');
assert.match(client, /initialPlanTaskLinkState\?: PlanTaskLinkStatePayload/, 'PlanClient should accept initial task-link state');
assert.match(client, /useState<PlanTaskEdits>\(\(\) => initialPlanTaskLinkState\?\.taskEdits \?\? \{\}\)/, 'Task edits should be seeded before first render');
assert.match(client, /useState<PlanTaskLinks>\(\(\) => initialPlanTaskLinkState\?\.links \?\? \{\}\)/, 'Task links should be seeded before first render');
assert.match(client, /useState<OrderOverrides>\(\(\) => initialPlanTaskLinkState\?\.orderOverrides \?\? \{\}\)/, 'Order overrides should be seeded before active-order counts render');
assert.match(client, /useState\(Boolean\(initialPlanTaskLinkState\) \|\| qaFixtureMode\)/, 'Plan state should start loaded when server state is present');
assert.match(client, /data-tuesday-state-loading="orders"/, 'Fallback loading shell should replace raw order counts while Tuesday state is missing');
assert.match(client, /if \(!planTaskLinksLoaded\) \{[\s\S]*TuesdayPlanStateLoading/, 'Board should not render raw orders before Tuesday state has loaded');

console.log('plan initial state tests passed');
