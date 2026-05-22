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
assert.doesNotMatch(source, /WorkshopPriorityStrip|Today \/ This week \/ Needs Guido/, 'Nick flow refinement: do not add a new summary strip/section before the email review');
assert.match(source, /Current week/, 'Nick feedback: current week should be obvious inside the existing week header');
assert.match(source, /customer-left-label/, 'Nick feedback: customer/order name should be visually led from the left of plan task cards');
assert.match(source, /taskCustomerDisplayName/, 'Nick refinement: customer/order display should be deliberately prominent on cards');
assert.match(source, /friendlyWorkshopTaskText/, 'Nick refinement: rough Monday task wording should be cleaned up for display only');
assert.doesNotMatch(source, /Needs Guido/i, 'Nick refinement: task cards should not mention Guido by name');
assert.match(source, /Needs order link/, 'Nick refinement: unlinked customer tasks should ask for an order link without blaming Guido');
assert.match(source, /Tick when this task is finished/, 'Nick question: explain how to tick a task off near job tasks in low-pressure wording');
assert.match(source, /Use this if the day, person, customer, task wording, or hours are wrong/, 'Nick refinement: edit modal should explain when to use it, including hours');
assert.match(source, /Add task to job/, 'Nick question: the add-task control should be explicitly labelled, not just an icon');
assert.match(source, /Save changes/, 'Nick question: save button should use the plain existing edit-flow wording');
assert.match(source, /Saves this card in Tuesday only/, 'Nick question: explain what the save button does');
assert.match(source, /3rd coat \(clear final\)/, 'Nick feedback: stage suggestions should include a clear-coat third coat stage');
assert.match(source, /4th coat \(blackwash final\)/, 'Nick feedback: stage suggestions should include a blackwash fourth coat stage');

console.log('plan Nick feedback tests passed');
