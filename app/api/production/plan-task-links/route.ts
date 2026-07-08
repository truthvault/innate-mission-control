import { NextRequest, NextResponse } from "next/server";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import {
  defaultPlanTaskLinksState,
  isMissingBlobToken,
  readPlanTaskLinksState,
  writePlanTaskLinksState,
  type DayKey,
  type PlanTaskLinkValue,
  type PlanTaskEditValue,
  type PlanTaskLinksState,
  type OrderOverrides,
  type PlanRowOrders,
  type PlanTaskPlacement,
  type AdHocScheduleTask,
  type AdHocScheduleTaskCompletions,
} from "@/lib/tuesday/plan-task-links-store";

// Regression-test marker for the API persistence shape: taskEdits: Record<string, PlanTaskEditValue>
function defaultState(): PlanTaskLinksState {
  return defaultPlanTaskLinksState();
}

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function cleanTaskEdit(value: unknown): Omit<PlanTaskEditValue, "updatedAt"> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { text?: unknown; rowName?: unknown; weekId?: unknown; day?: unknown; person?: unknown; estimatedHours?: unknown; sortOrder?: unknown; internal?: unknown; done?: unknown };
  const edit: Omit<PlanTaskEditValue, "updatedAt"> = {};
  const text = cleanText(source.text);
  const rowName = cleanText(source.rowName);
  const weekId = cleanText(source.weekId, 96);
  const estimatedHours = Number(source.estimatedHours);
  const sortOrder = Number(source.sortOrder);
  if (text) edit.text = text;
  if (rowName) edit.rowName = rowName;
  if (weekId) edit.weekId = weekId;
  if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(String(source.day))) edit.day = source.day as DayKey;
  if (source.person === "nick" || source.person === "dylan") edit.person = source.person;
  if (Number.isFinite(estimatedHours)) edit.estimatedHours = Math.max(0, Math.round(estimatedHours * 2) / 2);
  if (Number.isFinite(sortOrder)) edit.sortOrder = Math.round(sortOrder * 1000) / 1000;
  if (typeof source.internal === "boolean") edit.internal = source.internal;
  if (typeof source.done === "boolean") edit.done = source.done;
  return Object.keys(edit).length > 0 ? edit : null;
}

function cleanPlacement(value: unknown): PlanTaskPlacement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as { mode?: unknown; anchorTaskId?: unknown };
  if (source.mode !== "start" && source.mode !== "end" && source.mode !== "before" && source.mode !== "after") return undefined;
  const placement: PlanTaskPlacement = { mode: source.mode };
  if ((source.mode === "before" || source.mode === "after") && typeof source.anchorTaskId === "string" && source.anchorTaskId.trim()) {
    placement.anchorTaskId = source.anchorTaskId.trim();
  }
  if ((source.mode === "before" || source.mode === "after") && !placement.anchorTaskId) return undefined;
  return placement;
}

function cleanOrderRowOrder(value: unknown): { weekKey: string; rowIds: string[] | null } | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { weekKey?: unknown; rowIds?: unknown };
  const weekKey = typeof source.weekKey === "string" ? source.weekKey.trim().slice(0, 96) : "";
  if (!weekKey) return null;
  if (source.rowIds === null) return { weekKey, rowIds: null };
  if (!Array.isArray(source.rowIds)) return null;
  const rowIds = Array.from(new Set(source.rowIds.flatMap((rowId) => {
    const cleanRowId = typeof rowId === "string" ? rowId.trim().slice(0, 160) : "";
    return cleanRowId ? [cleanRowId] : [];
  }))).slice(0, 120);
  return { weekKey, rowIds };
}

function cleanOrderOverride(value: unknown): { orderId: string; status: "completed" | "active"; reason?: string; note?: string } | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { orderId?: unknown; status?: unknown; reason?: unknown; note?: unknown };
  const orderId = typeof source.orderId === "number" && Number.isFinite(source.orderId)
    ? String(source.orderId)
    : typeof source.orderId === "string"
      ? source.orderId.trim().slice(0, 48)
      : "";
  if (!orderId) return null;
  if (source.status !== "completed" && source.status !== "active") return null;
  const reason = typeof source.reason === "string" && source.reason.trim() ? source.reason.trim().slice(0, 80) : undefined;
  const note = typeof source.note === "string" && source.note.trim() ? source.note.trim().slice(0, 240) : undefined;
  return { orderId, status: source.status, reason, note };
}

function cleanAdHocTask(value: unknown): AdHocScheduleTask | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AdHocScheduleTask>;
  const id = typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : `adhoc-${Date.now()}`;
  const title = typeof source.title === "string" && source.title.trim() ? source.title.trim().slice(0, 160) : "";
  const kind = source.kind === "weekly" ? "weekly" : source.kind === "monthly" ? "monthly" : "one_off";
  const day = source.day;
  const person = source.person;
  const date = typeof source.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : undefined;
  if (!title || (day !== "monday" && day !== "tuesday" && day !== "wednesday" && day !== "thursday" && day !== "friday") || (person !== "nick" && person !== "dylan")) return null;
  if ((kind === "one_off" || kind === "monthly") && !date) return null;
  const rawHours = Number(source.estimatedHours);
  const estimatedHours = Number.isFinite(rawHours) ? Math.max(0.25, Math.min(8, Math.round(rawHours * 4) / 4)) : 1;
  const now = new Date().toISOString();
  return {
    id,
    title,
    notes: typeof source.notes === "string" && source.notes.trim() ? source.notes.trim().slice(0, 500) : undefined,
    kind,
    date,
    day,
    person,
    estimatedHours,
    active: source.active !== false,
    createdAt: typeof source.createdAt === "string" && source.createdAt ? source.createdAt : now,
    updatedAt: now,
  };
}

function cleanAdHocTaskCompletion(value: unknown): { key: string; done: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { taskId?: unknown; date?: unknown; done?: unknown };
  const taskId = typeof source.taskId === "string" ? source.taskId.trim().slice(0, 80) : "";
  const date = typeof source.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : "";
  if (!taskId || !date || typeof source.done !== "boolean") return null;
  return { key: `${taskId}:${date}`, done: source.done };
}

function linkValueForOrder(orderId: number, placement?: PlanTaskPlacement): PlanTaskLinkValue {
  return placement ? { orderId, placement } : orderId;
}

async function readState() {
  return readPlanTaskLinksState();
}

export async function GET() {
  try {
    const { state, storage } = await readState();
    return NextResponse.json({ state, storage });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ state: defaultState(), storage: "blob", disabledReason: "Plan task link storage is not connected yet." });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task links unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { taskId?: string; legacyTaskId?: string; orderId?: number | null; placement?: unknown; taskEdit?: unknown; removeTaskEdit?: boolean; orderRowOrder?: unknown; orderOverride?: unknown; adHocTask?: unknown; removeAdHocTaskId?: string; adHocTaskCompletion?: unknown } | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const legacyTaskId = typeof body?.legacyTaskId === "string" ? body.legacyTaskId.trim() : "";
  const hasOrderIdField = Boolean(body && Object.prototype.hasOwnProperty.call(body, "orderId"));
  const orderId = typeof body?.orderId === "number" && Number.isFinite(body.orderId) ? body.orderId : null;
  const placement = cleanPlacement(body?.placement);
  const orderRowOrder = cleanOrderRowOrder(body?.orderRowOrder);
  const orderOverride = cleanOrderOverride(body?.orderOverride);
  const adHocTask = cleanAdHocTask(body?.adHocTask);
  const removeAdHocTaskId = typeof body?.removeAdHocTaskId === "string" ? body.removeAdHocTaskId.trim().slice(0, 80) : "";
  const adHocTaskCompletion = cleanAdHocTaskCompletion(body?.adHocTaskCompletion);
  if (!taskId && !orderRowOrder && !orderOverride && !adHocTask && !removeAdHocTaskId && !adHocTaskCompletion) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    if (orderId) {
      const orders = await getOrdersWithFallback();
      if (!orders.items.some((order) => order.id === orderId)) {
        return NextResponse.json({ error: "Order is not in Tuesday active order data" }, { status: 404 });
      }
    }

    const currentResult = await readState();
    const current = currentResult.state;
    const links = { ...current.links };
    const taskEdits = { ...current.taskEdits };
    const orderRowOrders: PlanRowOrders = { ...current.orderRowOrders };
    const orderOverrides: OrderOverrides = { ...current.orderOverrides };
    let adHocTasks: AdHocScheduleTask[] = [...current.adHocTasks];
    const adHocTaskCompletions: AdHocScheduleTaskCompletions = { ...current.adHocTaskCompletions };
    if (taskId && hasOrderIdField && orderId) {
      links[taskId] = linkValueForOrder(orderId, placement);
      if (legacyTaskId && legacyTaskId !== taskId) delete links[legacyTaskId];
    } else if (taskId && hasOrderIdField) {
      delete links[taskId];
      if (legacyTaskId) delete links[legacyTaskId];
    }
    if (taskId) {
      const taskEdit = cleanTaskEdit(body?.taskEdit);
      if (taskEdit) taskEdits[taskId] = { ...taskEdit, updatedAt: new Date().toISOString() };
      if (body?.removeTaskEdit) delete taskEdits[taskId];
    }
    if (orderRowOrder) {
      if (orderRowOrder.rowIds?.length) orderRowOrders[orderRowOrder.weekKey] = orderRowOrder.rowIds;
      else delete orderRowOrders[orderRowOrder.weekKey];
    }
    if (orderOverride) {
      if (orderOverride.status === "completed") {
        orderOverrides[orderOverride.orderId] = {
          status: "completed",
          reason: orderOverride.reason,
          note: orderOverride.note,
          updatedAt: new Date().toISOString(),
          updatedBy: "Tuesday",
        };
      } else {
        delete orderOverrides[orderOverride.orderId];
      }
    }
    if (adHocTask) {
      const existing = adHocTasks.find((task) => task.id === adHocTask.id);
      adHocTasks = existing
        ? adHocTasks.map((task) => task.id === adHocTask.id ? { ...adHocTask, createdAt: task.createdAt } : task)
        : [adHocTask, ...adHocTasks];
    }
    if (removeAdHocTaskId) {
      adHocTasks = adHocTasks.filter((task) => task.id !== removeAdHocTaskId);
      for (const key of Object.keys(adHocTaskCompletions)) {
        if (key.startsWith(`${removeAdHocTaskId}:`)) delete adHocTaskCompletions[key];
      }
    }
    if (adHocTaskCompletion) {
      adHocTaskCompletions[adHocTaskCompletion.key] = adHocTaskCompletion.done;
    }
    const state = { links, taskEdits, orderRowOrders, orderOverrides, adHocTasks, adHocTaskCompletions, updatedAt: new Date().toISOString() };
    const written = await writePlanTaskLinksState(state);
    return NextResponse.json(written);
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ error: "Plan task link storage is not connected yet." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task link save failed" }, { status: 500 });
  }
}
