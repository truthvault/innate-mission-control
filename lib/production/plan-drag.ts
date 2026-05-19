export type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
export type Person = 'nick' | 'dylan';

const DAYS: readonly DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const PEOPLE: readonly Person[] = ['nick', 'dylan'];

export type DraggablePlanTask = {
  id: string;
  taskKey?: string;
  rowId: string;
  rowName: string;
  rowNotes: string | null;
  day: DayKey;
  person: Person;
  text: string;
  linkedOrderIds: number[];
  linkedOrders: Array<{ mondayItemId: string; name: string; boardId: string; boardName: string }>;
};

export type PlanDropTarget = { day: DayKey; person: Person; overTaskId?: string };

export function planLaneId(day: DayKey, person: Person) {
  return `${day}:${person}`;
}

export function parsePlanLaneId(value: string): { day: DayKey; person: Person } | null {
  const [day, person] = value.split(':');
  if ((DAYS as readonly string[]).includes(day) && (PEOPLE as readonly string[]).includes(person)) {
    return { day: day as DayKey, person: person as Person };
  }
  return null;
}

export function planLayoutsEqual(left: DraggablePlanTask[], right: DraggablePlanTask[]) {
  if (left.length !== right.length) return false;
  return left.every((task, index) => {
    const other = right[index];
    return other?.id === task.id && other.day === task.day && other.person === task.person;
  });
}

export function reorderPlanTask(
  current: DraggablePlanTask[],
  taskId: string,
  day: DayKey,
  person: Person,
  overTaskId?: string,
  insertAfter = false
) {
  const moving = current.find((task) => task.id === taskId);
  if (!moving) return current;

  const withoutMoving = current.filter((task) => task.id !== taskId);
  const nextTask = { ...moving, day, person };
  let insertAt = withoutMoving.length;
  if (overTaskId && overTaskId !== taskId) {
    const overIndex = withoutMoving.findIndex((task) => task.id === overTaskId);
    if (overIndex >= 0) insertAt = overIndex + (insertAfter ? 1 : 0);
  } else if (!overTaskId) {
    const laneIndexes = withoutMoving
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => task.day === day && task.person === person);
    insertAt = laneIndexes.length > 0 ? laneIndexes[laneIndexes.length - 1].index + 1 : withoutMoving.length;
  }

  const next = [...withoutMoving];
  next.splice(insertAt, 0, nextTask);
  return planLayoutsEqual(current, next) ? current : next;
}

export function dropTargetFromOverId(current: DraggablePlanTask[], overId: string): PlanDropTarget | null {
  const lane = parsePlanLaneId(overId);
  if (lane) return lane;
  const overTask = current.find((task) => task.id === overId);
  return overTask ? { day: overTask.day, person: overTask.person, overTaskId: overTask.id } : null;
}
