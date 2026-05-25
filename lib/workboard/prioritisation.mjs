const PRIORITY_RANK = { cash: 0, high: 1, normal: 2, later: 3 };
const TODAY_STATUS_RANK = { in_progress: 0, next: 1 };
const OPEN_STATUSES = new Set(["inbox", "next", "in_progress", "waiting"]);
const TODAY_STATUSES = new Set(["next", "in_progress"]);

export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.normal;
}

export function statusRank(status) {
  return TODAY_STATUS_RANK[status] ?? 9;
}

export function isOpenTask(task) {
  return OPEN_STATUSES.has(task?.status);
}

export function isTodayTask(task) {
  return TODAY_STATUSES.has(task?.status);
}

function dateRank(value) {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function stringCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), "en-NZ");
}

export function sortTasksForToday(tasks) {
  return [...tasks]
    .filter(isTodayTask)
    .sort((a, b) => {
      return statusRank(a.status) - statusRank(b.status)
        || priorityRank(a.priority) - priorityRank(b.priority)
        || dateRank(a.dueDate) - dateRank(b.dueDate)
        || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        || dateRank(a.updatedAt) - dateRank(b.updatedAt)
        || stringCompare(a.title, b.title);
    });
}

export function visibleTodayTasks(tasks, limit = 7) {
  const sorted = sortTasksForToday(tasks);
  const safeLimit = Math.max(1, limit);
  return {
    visible: sorted.slice(0, safeLimit),
    hiddenCount: Math.max(0, sorted.length - safeLimit),
  };
}

export function projectOpenTaskCount(projectId, tasks) {
  return tasks.filter((task) => task.projectId === projectId && isOpenTask(task)).length;
}

export function nextTaskForProject(projectId, tasks) {
  const candidates = tasks.filter((task) => task.projectId === projectId && isOpenTask(task));
  return sortTasksForToday(candidates)[0]
    || candidates.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || stringCompare(a.title, b.title))[0];
}
