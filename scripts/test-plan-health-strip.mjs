#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(source, /Plan health/, 'Production Plan should show a small Plan health strip above the week board');
assert.match(source, /Dylan full today/, 'Plan health should raise Dylan full today as an exception');
assert.match(source, /Nick has 0h today/, 'Plan health should raise Nick empty today as an exception');
assert.match(source, /blocked orders/, 'Plan health should include blocked-order count context');
assert.match(source, /Tasks needing order/, 'Plan health should flag tasks that cannot start without an order link');
assert.match(source, /Friday hidden/, 'Plan health should make hidden Friday explicit');
assert.match(source, /Order linked/, 'Production Plan should use clearer Order linked copy instead of Connected');
assert.match(source, /tasks today/, 'Today filter chips should say tasks today instead of ambiguous today');
assert.doesNotMatch(source, /\bConnected\b/, 'Production Plan UI should not use ambiguous Connected copy');
