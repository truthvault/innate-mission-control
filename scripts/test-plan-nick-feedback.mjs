#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /Plan health/i, 'Nick feedback: remove the Plan health strip/copy from Production Plan');
assert.doesNotMatch(source, /PlanHealthStrip|buildPlanHealthItems|Friday hidden/, 'Nick feedback: remove Plan health implementation details and Friday-hidden warning');
assert.match(source, /const visibleDays = DAYS;/, 'Nick feedback: Friday should always be visible, not hidden behind a toggle');
assert.doesNotMatch(source, /setShowFriday|Show Friday|Hide Friday/, 'Nick feedback: remove manual Friday show/hide controls');
assert.match(source, /current-week-prominent-border/, 'Nick feedback: current week should have a deliberately prominent border marker');
assert.match(source, /#8b1e1e/, 'Nick feedback: Nick/Dylan colours should be more distinct, with a red owner colour');
assert.match(source, /#1f1f1f/, 'Nick feedback: Nick/Dylan colours should be more distinct, with a black owner colour');
assert.match(source, /customer-left-label/, 'Nick feedback: customer/order name should be visually led from the left of plan task cards');
assert.match(source, /Tick the checkbox to mark this task done/, 'Nick question: explain how to tick a task off near job tasks');
assert.match(source, /Add task to job/, 'Nick question: the add-task control should be explicitly labelled, not just an icon');
assert.match(source, /Quick add order task/, 'Nick question: compact order rail should let task edits happen without hiding the week');
assert.match(source, /Full order details/, 'Nick question: full order details should remain available from the compact rail');
assert.match(source, /Save task edits/, 'Nick question: Save task should be clearer about saving card edits');
assert.match(source, /Saves this card in Tuesday only/, 'Nick question: explain what the save button does');
assert.match(source, /3rd coat \(clear final\)/, 'Nick feedback: stage suggestions should include a clear-coat third coat stage');
assert.match(source, /4th coat \(blackwash final\)/, 'Nick feedback: stage suggestions should include a blackwash fourth coat stage');
assert.match(source, /useState<ProductionPlanMode>\("orderRows"\)/, 'Nick feedback: Orders should be the default Production Plan view');
assert.match(source, /Schedule board/, 'Nick feedback: Schedule board should remain available as fallback');
assert.match(source, /data-order-capacity-strip/, 'Nick feedback: Orders view should show weekly capacity');
assert.match(source, /data-order-day-filter/, 'Nick feedback: Orders view should allow day filtering');
assert.match(source, /data-order-row-priority-controls/, 'Nick feedback: Orders can be manually prioritised with reliable row controls');
assert.match(source, /Priority/, 'Nick feedback: Orders priority controls should explain what the arrows do');
assert.match(source, /Move this order earlier/, 'Nick feedback: Orders priority controls include an earlier action');
assert.match(source, /Move this order later/, 'Nick feedback: Orders priority controls include a later action');
assert.match(source, /Reset to due-date order/, 'Nick feedback: manual order priority should be resettable');
assert.match(source, /data-order-row-drop-lane/, 'Nick feedback: Orders view should have task drop lanes');
assert.match(source, /orderJourneyLaneId/, 'Nick feedback: Orders drop lanes should be unique per order row');
assert.match(source, /orderJourneyDayId/, 'Nick feedback: Orders should support broad day-column drop targets');
assert.match(source, /data-order-row-drop-id/, 'Nick feedback: Orders drop targets should expose stable ids for fallback hit testing');
assert.match(source, /pointerWithin/, 'Nick feedback: Orders drag/drop should use pointer-first collision detection for empty lanes');
assert.match(source, /boardCollisionDetection/, 'Nick feedback: Orders drag/drop should fall back safely after pointer collision');
assert.match(source, /boardDropIdFromPoint/, 'Nick feedback: fast drops should resolve the physical target under the pointer');
assert.match(source, /lastBoardPointerRef/, 'Nick feedback: fast drag/drop should remember the final pointer position');
assert.match(source, /data-order-row-sortable-task/, 'Nick feedback: Orders view task cards should be draggable');
assert.match(source, /data-order-row-drag-surface/, 'Nick feedback: the full Orders task card should be a drag surface');
assert.match(source, /data-order-row-empty-drop-target/, 'Nick feedback: empty Orders day cells should expose a real drop target');
assert.match(source, /dragActive=\{Boolean\(activeTaskId\)\}/, 'Nick feedback: empty Orders drop lanes should visibly activate while dragging');
assert.match(source, /toggleOrderJourneyTaskDone/, 'Nick feedback: Orders view should support done\/undo from task cards');
assert.match(source, /activeAppTaskId/, 'Nick feedback: Orders view should include Tuesday job tasks in drag state');

console.log('plan Nick feedback tests passed');
