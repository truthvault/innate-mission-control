#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  isOpenTask,
  nextTaskForProject,
  projectOpenTaskCount,
  sortTasksForToday,
  visibleTodayTasks,
} from "../lib/workboard/prioritisation.mjs";

const now = "2026-05-20T00:00:00.000Z";

function task(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID?.() || Math.random().toString(36),
    projectId: overrides.projectId || "project-1",
    title: overrides.title || "Task",
    status: overrides.status || "next",
    priority: overrides.priority || "normal",
    sortOrder: overrides.sortOrder ?? 0,
    updatedAt: overrides.updatedAt || now,
    dueDate: overrides.dueDate,
    ...overrides,
  };
}

{
  const sorted = sortTasksForToday([
    task({ id: "normal", title: "Normal", priority: "normal" }),
    task({ id: "high", title: "High", priority: "high" }),
    task({ id: "cash", title: "Cash", priority: "cash" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["cash", "high", "normal"]);
}

{
  const sorted = sortTasksForToday([
    task({ id: "next", status: "next", priority: "high" }),
    task({ id: "active", status: "in_progress", priority: "high" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.id), ["active", "next"]);
}

{
  const tasks = Array.from({ length: 9 }, (_, index) => task({ id: `task-${index}`, priority: "high", sortOrder: index }));
  const result = visibleTodayTasks(tasks, 7);
  assert.equal(result.visible.length, 7);
  assert.equal(result.hiddenCount, 2);
}

{
  assert.equal(isOpenTask(task({ status: "done" })), false);
  assert.equal(isOpenTask(task({ status: "cancelled" })), false);
  assert.equal(isOpenTask(task({ status: "parked" })), false);
  assert.equal(isOpenTask(task({ status: "waiting" })), true);
  assert.equal(projectOpenTaskCount("project-1", [task({ status: "done" }), task({ status: "next" }), task({ status: "parked" })]), 1);
}

{
  const next = nextTaskForProject("project-1", [
    task({ id: "done", status: "done", priority: "cash" }),
    task({ id: "parked", status: "parked", priority: "cash" }),
    task({ id: "open", status: "next", priority: "high" }),
  ]);
  assert.equal(next?.id, "open");
}

console.log("workboard prioritisation tests OK");
