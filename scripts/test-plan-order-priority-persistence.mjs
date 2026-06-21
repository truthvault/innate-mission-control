#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/production/plan-task-links/route.ts', import.meta.url), 'utf8');
const workflowRoute = readFileSync(new URL('../app/api/production/order-workflow/route.ts', import.meta.url), 'utf8');
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
assert.match(plan, /\^shape\$/, 'order-intake parser should display Shape as a first-class job detail');
assert.match(plan, /\(Shape\|Dimensions\?/, 'order-intake parser should read Shape from keyed invoice details');
assert.match(plan, /return "Colour"/, 'order-intake parser should normalize finish labels to Colour');
assert.match(plan, /return "Base"/, 'order-intake parser should normalize base labels to Base');
assert.match(plan, /const INTAKE_SPEC_LABEL_ORDER = \["Shape", "Dimensions", "Timber", "Colour", "Base"/, 'order-intake parser should render canonical workshop spec order');
assert.match(plan, /\$\{twoDimensional\[1\]\}x\$\{twoDimensional\[2\]\}x760mm/, 'order-intake parser should normalize standard dining height dimensions into full LxWxH');
assert.match(plan, /"danish oval", "Danish oval"/, 'order-intake parser should normalize Danish oval shape values');
assert.match(plan, /"rectangle", "Rectangle"/, 'order-intake parser should normalize rectangle shape values');
assert.match(plan, /"square", "Square"/, 'order-intake parser should normalize square shape values');
assert.match(plan, /"round", "Round"/, 'order-intake parser should normalize round shape values');
assert.match(plan, /"pebble", "Pebble"/, 'order-intake parser should normalize pebble shape values');
assert.match(plan, /"classic oval", "Classic oval"/, 'order-intake parser should normalize classic oval shape values');
assert.match(plan, /"pill", "Pill"/, 'order-intake parser should normalize pill shape values');
assert.match(plan, /setBoardTasks\(previousBoardTasks\)/, 'failed task edits should roll back optimistic board state');
assert.match(plan, /setPlanTaskEdits\(previousPlanTaskEdits\)/, 'failed task edits should roll back optimistic task edits');
assert.match(plan, /setPlanTaskLinks\(previousPlanTaskLinks\)/, 'failed link and unlink saves should restore the previous link state');
assert.match(plan, /pendingWorkflowRef/, 'workflow saves should queue the latest edit while another save is in flight');
assert.match(plan, /Saving latest/, 'workflow save status should distinguish queued latest edits');
assert.match(plan, /workshopOnly/, 'schedulable workflow owner controls should be restricted to workshop lanes');
assert.match(plan, /\(\["Nick", "Dylan", "Guido"\] as OrderIntakeOwner\[\]\)/, 'intake scheduled-task owner choices should include Guido');
assert.match(plan, /function markIntakeOrderCompleteInTuesday/, 'intake orders should be clearable through Tuesday order overrides');
assert.match(plan, /CompletedTuesdayOrdersCard/, 'completed Tuesday overrides should be visible in a recovery card');
assert.match(plan, /function restoreCompletedTuesdayOrder/, 'completed Tuesday overrides should be restorable');
assert.match(plan, /status: "active"/, 'restore should delete completed-order overrides through the plan-task API');
assert.match(plan, /orderOverrides\[item\.orderId\]\?\.status !== "completed"/, 'Tuesday active intake views should filter completed intake overrides');
assert.match(workflowRoute, /if \(supabaseStates && supabaseWorkflowConfig\(\)\) return \{ state: defaultState\(orderId\), storage: "supabase" as const \}/, 'batch workflow reads should default missing Supabase rows without reporting disabled storage');
assert.match(workflowRoute, /const supabaseConfigured = Boolean\(supabaseWorkflowConfig\(\)\)/, 'batch workflow API should report Supabase storage when configured');

console.log('plan order priority persistence tests passed');
