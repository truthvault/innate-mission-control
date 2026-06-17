#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../lib/tuesday/plan-task-links-store.ts', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(store, /export type PlanRowOrders = Record<string, string\[\]>/, 'plan-task state should type saved order row priorities');
assert.match(store, /orderRowOrders: PlanRowOrders/, 'plan-task state should include orderRowOrders');
assert.match(store, /orderOverrides: OrderOverrides/, 'plan-task state should include Tuesday order overrides');
assert.match(store, /normalizeOrderRowOrders/, 'plan-task state should normalize saved order row priorities');
assert.match(store, /normalizeOrderOverrides/, 'plan-task state should normalize Tuesday order overrides');
assert.match(route, /function cleanOrderRowOrder/, 'plan-task API should clean order priority payloads');
assert.match(route, /function cleanOrderOverride/, 'plan-task API should clean order override payloads');
assert.match(route, /orderRowOrder = cleanOrderRowOrder\(body\?\.orderRowOrder\)/, 'plan-task API should read orderRowOrder payloads');
assert.match(route, /orderOverride = cleanOrderOverride\(body\?\.orderOverride\)/, 'plan-task API should read orderOverride payloads');
assert.match(route, /if \(!taskId && !orderRowOrder && !orderOverride\)/, 'plan-task API should allow order priority and order override saves without a task id');
assert.match(route, /orderRowOrders\[orderRowOrder\.weekKey\] = orderRowOrder\.rowIds/, 'plan-task API should write manual order priorities');
assert.match(route, /delete orderRowOrders\[orderRowOrder\.weekKey\]/, 'plan-task API should support resetting manual order priorities');
assert.match(route, /orderOverrides\[orderOverride\.orderId\]/, 'plan-task API should write completed-order overrides');
assert.match(route, /delete orderOverrides\[orderOverride\.orderId\]/, 'plan-task API should support restoring order overrides');
assert.match(route, /const state = \{ links, taskEdits, orderRowOrders, orderOverrides, updatedAt:/, 'plan-task API should persist priorities and order overrides with the canonical state');
assert.match(plan, /body: JSON\.stringify\(\{ orderRowOrder: \{ weekKey, rowIds \} \}\)/, 'Orders view should post manual priority payloads');
assert.match(plan, /orderOverrides\[String\(order\.id\)\]\?\.status !== "completed"/, 'Tuesday active order views should filter completed order overrides');
assert.match(plan, /Mark complete in Tuesday/, 'Order views should expose a clear mark-complete action');
assert.match(plan, /CompletedTuesdayOrdersCard/, 'completed Tuesday overrides should be visible in a recovery card');
assert.match(plan, /function restoreCompletedTuesdayOrder/, 'completed Tuesday overrides should be restorable');
assert.match(plan, /status: "active"/, 'restore should delete completed-order overrides through the plan-task API');
assert.match(plan, /function activeOrderJourneyRowIds/, 'manual order priority should only reorder active order rows');
assert.match(plan, /function reorderStringList/, 'manual order priority should persist deterministic row order changes');

console.log('plan order priority persistence tests passed');
