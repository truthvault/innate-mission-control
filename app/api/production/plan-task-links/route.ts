import { NextRequest, NextResponse } from "next/server";
import { isMissingBlobToken, readEncryptedBlob, writeEncryptedBlob } from "@/lib/tuesday/encrypted-blob-store";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";

type PlanTaskPlacement = {
  mode: "start" | "end" | "before" | "after";
  anchorTaskId?: string;
};

type PlanTaskLinkValue = number | { orderId: number; placement?: PlanTaskPlacement };
type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
type Person = "nick" | "dylan";
type PlanTaskEditValue = {
  text?: string;
  rowName?: string;
  day?: DayKey;
  person?: Person;
  estimatedHours?: number;
  internal?: boolean;
  done?: boolean;
  updatedAt: string;
};

type PlanTaskLinksState = {
  links: Record<string, PlanTaskLinkValue>;
  taskEdits: Record<string, PlanTaskEditValue>;
  updatedAt: string;
};

const PATH = "production-plan-task-links/current.json";

function defaultState(): PlanTaskLinksState {
  return { links: {}, taskEdits: {}, updatedAt: new Date().toISOString() };
}

function cleanText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : undefined;
}

function cleanTaskEdit(value: unknown): Omit<PlanTaskEditValue, "updatedAt"> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as { text?: unknown; rowName?: unknown; day?: unknown; person?: unknown; estimatedHours?: unknown; internal?: unknown; done?: unknown };
  const edit: Omit<PlanTaskEditValue, "updatedAt"> = {};
  const text = cleanText(source.text);
  const rowName = cleanText(source.rowName);
  const estimatedHours = Number(source.estimatedHours);
  if (text) edit.text = text;
  if (rowName) edit.rowName = rowName;
  if (["monday", "tuesday", "wednesday", "thursday", "friday"].includes(String(source.day))) edit.day = source.day as DayKey;
  if (source.person === "nick" || source.person === "dylan") edit.person = source.person;
  if (Number.isFinite(estimatedHours)) edit.estimatedHours = Math.max(0, Math.round(estimatedHours * 2) / 2);
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

function linkValueForOrder(orderId: number, placement?: PlanTaskPlacement): PlanTaskLinkValue {
  return placement ? { orderId, placement } : orderId;
}

async function readState() {
  const state = await readEncryptedBlob<PlanTaskLinksState>(PATH, defaultState());
  return { ...defaultState(), ...state, links: state.links ?? {}, taskEdits: state.taskEdits ?? {} };
}

export async function GET() {
  try {
    const state = await readState();
    return NextResponse.json({ state });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ state: defaultState(), disabledReason: "Plan task link storage is not connected yet." });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task links unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { taskId?: string; legacyTaskId?: string; orderId?: number | null; placement?: unknown; taskEdit?: unknown; removeTaskEdit?: boolean } | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const legacyTaskId = typeof body?.legacyTaskId === "string" ? body.legacyTaskId.trim() : "";
  const hasOrderIdField = Boolean(body && Object.prototype.hasOwnProperty.call(body, "orderId"));
  const orderId = typeof body?.orderId === "number" && Number.isFinite(body.orderId) ? body.orderId : null;
  const placement = cleanPlacement(body?.placement);
  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    if (orderId) {
      const orders = await getOrdersWithFallback();
      if (!orders.items.some((order) => order.id === orderId)) {
        return NextResponse.json({ error: "Order is not in Tuesday active order data" }, { status: 404 });
      }
    }

    const current = await readState();
    const links = { ...current.links };
    const taskEdits = { ...current.taskEdits };
    if (hasOrderIdField && orderId) {
      links[taskId] = linkValueForOrder(orderId, placement);
      if (legacyTaskId && legacyTaskId !== taskId) delete links[legacyTaskId];
    } else if (hasOrderIdField) {
      delete links[taskId];
      if (legacyTaskId) delete links[legacyTaskId];
    }
    const taskEdit = cleanTaskEdit(body?.taskEdit);
    if (taskEdit) taskEdits[taskId] = { ...taskEdit, updatedAt: new Date().toISOString() };
    if (body?.removeTaskEdit) delete taskEdits[taskId];
    const state = { links, taskEdits, updatedAt: new Date().toISOString() };
    await writeEncryptedBlob(PATH, state);
    return NextResponse.json({ state });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ error: "Plan task link storage is not connected yet." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task link save failed" }, { status: 500 });
  }
}
