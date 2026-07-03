#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(source, /hasTasksThisWeek: boolean/, 'Orders rows should track whether an active order has tasks in the selected week');
assert.match(source, /for \(const order of orders\.filter\(\(order\) => !isCompleteOrder\(order\)\)\)/, 'Orders view should add every active order, even when it has no tasks this week');
assert.match(source, /if \(rows\.has\(id\)\) continue;/, 'Orders view should not duplicate orders that already have tasks this week');
assert.match(source, /row\.order && row\.health !== "internal" && row\.health !== "unlinked" && !isCompleteOrder\(row\.order\)/, 'Orders active sections should match the active-order count and not include orphan/internal rows');
assert.match(source, /activeRowsWithTasks/, 'Orders view should group active orders with tasks separately');
assert.match(source, /activeRowsWithoutTasks/, 'Orders view should group active orders without tasks separately');
assert.match(source, /tasks this week/i, 'Orders view should label orders relative to scheduled work this week');
assert.match(source, /No tasks this week/, 'Orders view should label active orders with no scheduled work this week');
assert.match(source, /appTasks = \[\]/, 'Precision change must preserve Codex workflow/intake app task support');
assert.match(source, /sourceKind\?: "plan" \| "workflow" \| "intake"/, 'Precision change must preserve Codex source kind typing');

console.log('plan orders all-active tests passed');
