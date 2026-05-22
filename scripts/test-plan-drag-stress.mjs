#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dropTargetFromOverId,
  parsePlanLaneId,
  planLaneId,
  planLayoutsEqual,
  reorderPlanTask,
} from '../lib/production/plan-drag.ts';

const planClientSource = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const people = ['nick', 'dylan'];

function makeTask(index) {
  return {
    id: `task-${index}`,
    rowId: `row-${index}`,
    rowName: `Customer ${index}`,
    rowNotes: null,
    day: days[index % days.length],
    person: people[index % people.length],
    text: `Task ${index}`,
    linkedOrderIds: [],
    linkedOrders: [],
  };
}

function assertUniqueSameIds(before, after) {
  assert.equal(after.length, before.length, 'dragging never creates or deletes tasks');
  assert.deepEqual(
    [...after.map((task) => task.id)].sort(),
    [...before.map((task) => task.id)].sort(),
    'dragging preserves the same task ids'
  );
}

function laneTasks(tasks, day, person) {
  return tasks.filter((task) => task.day === day && task.person === person);
}

function assertRelativeOrder(tasks, movingId, overId, insertAfter) {
  const moving = tasks.findIndex((task) => task.id === movingId);
  const over = tasks.findIndex((task) => task.id === overId);
  assert.notEqual(moving, -1, `${movingId} should exist`);
  assert.notEqual(over, -1, `${overId} should exist`);
  if (insertAfter) assert.equal(moving, over + 1, `${movingId} should sit after ${overId}`);
  else assert.equal(moving, over - 1, `${movingId} should sit before ${overId}`);
}

let tasks = Array.from({ length: 28 }, (_, index) => makeTask(index));
const original = tasks;
assert.ok(planLayoutsEqual(tasks, original));
assert.deepEqual(parsePlanLaneId(planLaneId('wednesday', 'dylan')), { day: 'wednesday', person: 'dylan' });
assert.deepEqual(dropTargetFromOverId(tasks, 'task-3'), { day: 'thursday', person: 'dylan', overTaskId: 'task-3' });
assert.deepEqual(dropTargetFromOverId(tasks, planLaneId('friday', 'nick')), { day: 'friday', person: 'nick' });
assert.match(planClientSource, /setActivatorNodeRef/, 'task cards should use a dedicated drag activator so action buttons stay clickable');
assert.match(planClientSource, /useSensor\(PointerSensor/, 'task dragging should use the stable dnd-kit PointerSensor');
assert.doesNotMatch(planClientSource, /useSensor\(WorkshopPointerSensor/, 'custom pointer sensor must not disable normal card dragging');

const firstMove = reorderPlanTask(tasks, 'task-9', 'monday', 'nick', 'task-0', false);
assertUniqueSameIds(tasks, firstMove);
assertRelativeOrder(firstMove, 'task-9', 'task-0', false);
assert.equal(firstMove.find((task) => task.id === 'task-9').day, 'monday');
assert.equal(firstMove.find((task) => task.id === 'task-9').person, 'nick');
tasks = firstMove;

const secondMove = reorderPlanTask(tasks, 'task-9', 'monday', 'nick', 'task-0', true);
assertUniqueSameIds(tasks, secondMove);
assertRelativeOrder(secondMove, 'task-9', 'task-0', true);
tasks = secondMove;

for (let step = 0; step < 240; step += 1) {
  const moving = tasks[(step * 7) % tasks.length];
  const targetDay = days[(step * 3 + 2) % days.length];
  const targetPerson = people[(step + 1) % people.length];
  const targetLane = laneTasks(tasks, targetDay, targetPerson).filter((task) => task.id !== moving.id);
  const overTask = targetLane.length ? targetLane[(step * 5) % targetLane.length] : null;
  const insertAfter = step % 2 === 0;
  const before = tasks;
  tasks = reorderPlanTask(tasks, moving.id, targetDay, targetPerson, overTask?.id, insertAfter);
  assertUniqueSameIds(before, tasks);
  const moved = tasks.find((task) => task.id === moving.id);
  assert.equal(moved.day, targetDay, 'moved task should adopt target day');
  assert.equal(moved.person, targetPerson, 'moved task should adopt target person');
  if (overTask) assertRelativeOrder(tasks, moving.id, overTask.id, insertAfter);
}

for (const day of days) {
  for (const person of people) {
    const lane = laneTasks(tasks, day, person);
    assert.ok(lane.every((task) => task.day === day && task.person === person));
  }
}

console.log('plan drag stress tests passed');
