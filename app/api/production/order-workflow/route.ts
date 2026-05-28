import { NextRequest, NextResponse } from "next/server";
import { isMissingBlobToken, readEncryptedBlob, writeEncryptedBlob } from "@/lib/tuesday/encrypted-blob-store";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";

export type Carrier = "" | "Pinpoint" | "Mainfreight" | "Customer";
export type WorkshopPerson = "" | "Nick" | "Dylan" | "Guido" | "Other";

export type WorkflowTask = {
  id: string;
  title: string;
  owner: WorkshopPerson;
  scheduledDate: string;
  done: boolean;
  completedAt: string | null;
  completedBy: WorkshopPerson;
  notes: string;
};

export type OrderWorkflowState = {
  orderId: number;
  xeroInvoiceNumber?: string | null;
  repairNotes?: string | null;
  collection: {
    status: "open" | "booked" | "collected";
    bookedDay: string;
    bookedTime: string;
    by: Carrier;
    collectedAt: string | null;
  };
  qc: Record<string, { done: boolean; completedAt: string | null; completedBy: WorkshopPerson }>;
  tasks: WorkflowTask[];
  updatedAt: string;
};

function cleanOrderId(value: string | null) {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function cleanOrderIds(value: string | null) {
  return (value || "")
    .split(",")
    .map((item) => cleanOrderId(item.trim()))
    .filter((item): item is number => item !== null)
    .slice(0, 80);
}

function pathFor(orderId: number) {
  return `production-order-workflow/${orderId}.json`;
}

function supabaseWorkflowConfig() {
  if (process.env.TUESDAY_WORKFLOW_STORAGE !== "supabase") return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const table = process.env.TUESDAY_WORKFLOW_TABLE || "production_order_workflows";
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey, table };
}

function defaultState(orderId: number): OrderWorkflowState {
  return {
    orderId,
    xeroInvoiceNumber: null,
    repairNotes: null,
    collection: {
      status: "open",
      bookedDay: "",
      bookedTime: "",
      by: "",
      collectedAt: null,
    },
    qc: {},
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanWorkshopPerson(value: unknown): WorkshopPerson {
  return value === "Nick" || value === "Dylan" || value === "Guido" || value === "Other" ? value : "";
}

function cleanCarrier(value: unknown): Carrier {
  return value === "Pinpoint" || value === "Mainfreight" || value === "Customer" ? value : "";
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cleanNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeWorkflowTask(value: unknown, index: number, orderId: number): WorkflowTask | null {
  if (!isRecord(value)) return null;
  const title = cleanString(value.title).trim();
  if (!title) return null;
  const done = typeof value.done === "boolean" ? value.done : false;
  return {
    id: cleanString(value.id).trim() || `task-${orderId}-${index}`,
    title,
    owner: cleanWorkshopPerson(value.owner),
    scheduledDate: cleanString(value.scheduledDate),
    done,
    completedAt: done ? cleanNullableString(value.completedAt) : null,
    completedBy: done ? cleanWorkshopPerson(value.completedBy) : "",
    notes: cleanString(value.notes),
  };
}

function normalizeWorkflowState(orderId: number, value: unknown): OrderWorkflowState {
  const base = defaultState(orderId);
  if (!isRecord(value)) return base;
  const collection = isRecord(value.collection) ? value.collection : {};
  const status = collection.status === "booked" || collection.status === "collected" ? collection.status : "open";
  const qc = isRecord(value.qc) ? value.qc as OrderWorkflowState["qc"] : {};
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map((task, index) => normalizeWorkflowTask(task, index, orderId)).filter((task): task is WorkflowTask => Boolean(task))
    : [];
  return {
    ...base,
    xeroInvoiceNumber: cleanNullableString(value.xeroInvoiceNumber)?.toUpperCase() ?? null,
    repairNotes: cleanNullableString(value.repairNotes),
    collection: {
      status,
      bookedDay: cleanString(collection.bookedDay),
      bookedTime: cleanString(collection.bookedTime),
      by: cleanCarrier(collection.by),
      collectedAt: status === "collected" ? cleanNullableString(collection.collectedAt) : null,
    },
    qc,
    tasks,
    updatedAt: cleanString(value.updatedAt) || base.updatedAt,
  };
}

async function readSupabaseWorkflow(orderId: number) {
  const supabase = supabaseWorkflowConfig();
  if (!supabase) return null;

  const params = new URLSearchParams({
    select: "state",
    order_id: `eq.${orderId}`,
    limit: "1",
  });
  const response = await fetch(`${supabase.url}/rest/v1/${supabase.table}?${params}`, {
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase workflow read failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  const rows = (await response.json()) as Array<{ state?: OrderWorkflowState }>;
  return normalizeWorkflowState(orderId, rows[0]?.state);
}

async function readSupabaseWorkflows(orderIds: number[]) {
  const supabase = supabaseWorkflowConfig();
  if (!supabase) return null;
  if (orderIds.length === 0) return {} as Record<string, OrderWorkflowState>;

  const response = await fetch(`${supabase.url}/rest/v1/${supabase.table}?select=order_id,state&order_id=in.(${orderIds.join(",")})`, {
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase workflow read failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  const states: Record<string, OrderWorkflowState> = Object.fromEntries(orderIds.map((orderId) => [String(orderId), defaultState(orderId)]));
  const rows = (await response.json()) as Array<{ order_id?: number; state?: OrderWorkflowState }>;
  for (const row of rows) {
    if (typeof row.order_id !== "number" || !orderIds.includes(row.order_id)) continue;
    states[String(row.order_id)] = normalizeWorkflowState(row.order_id, row.state);
  }
  return states;
}

async function writeSupabaseWorkflow(state: OrderWorkflowState) {
  const supabase = supabaseWorkflowConfig();
  if (!supabase) return null;

  const response = await fetch(`${supabase.url}/rest/v1/${supabase.table}`, {
    method: "POST",
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      order_id: state.orderId,
      xero_invoice_number: state.xeroInvoiceNumber,
      state,
      updated_at: state.updatedAt,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase workflow save failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  const rows = (await response.json().catch(() => [])) as Array<{ state?: OrderWorkflowState }>;
  return rows[0]?.state ?? state;
}

export async function GET(request: NextRequest) {
  const orderIds = cleanOrderIds(request.nextUrl.searchParams.get("orderIds"));
  if (orderIds.length > 0) {
    try {
      const supabaseStates = await readSupabaseWorkflows(orderIds);
      if (supabaseStates) return NextResponse.json({ states: supabaseStates, storage: "supabase" });
      const entries = await Promise.all(orderIds.map(async (orderId) => [String(orderId), await readEncryptedBlob<OrderWorkflowState>(pathFor(orderId), defaultState(orderId))] as const));
      return NextResponse.json({ states: Object.fromEntries(entries), storage: "blob" });
    } catch (err) {
      if (isMissingBlobToken(err)) {
        return NextResponse.json({ states: Object.fromEntries(orderIds.map((orderId) => [String(orderId), defaultState(orderId)])), disabledReason: "Workflow storage is not connected yet." });
      }
      return NextResponse.json({ error: err instanceof Error ? err.message : "Workflow state unavailable" }, { status: 500 });
    }
  }

  const orderId = cleanOrderId(request.nextUrl.searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  try {
    const supabaseState = await readSupabaseWorkflow(orderId);
    if (supabaseState) return NextResponse.json({ state: supabaseState, storage: "supabase" });
    return NextResponse.json({ state: await readEncryptedBlob<OrderWorkflowState>(pathFor(orderId), defaultState(orderId)), storage: "blob" });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ state: defaultState(orderId), disabledReason: "Workflow storage is not connected yet." });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workflow state unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { state?: OrderWorkflowState } | null;
  const state = body?.state;
  const orderId = typeof state?.orderId === "number" ? state.orderId : null;
  if (!orderId || !state) return NextResponse.json({ error: "Missing workflow state" }, { status: 400 });

  try {
    const orders = await getOrdersWithFallback();
    if (!orders.items.some((order) => order.id === orderId)) {
      return NextResponse.json({ error: "Order is not in Tuesday active order data" }, { status: 404 });
    }

    const next = normalizeWorkflowState(orderId, { ...state, updatedAt: new Date().toISOString() });

    const saved = await writeSupabaseWorkflow(next);
    if (saved) return NextResponse.json({ state: saved, storage: "supabase" });
    await writeEncryptedBlob(pathFor(orderId), next);
    return NextResponse.json({ state: next, storage: "blob" });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ error: "Workflow storage is not connected yet." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Workflow save failed" }, { status: 500 });
  }
}
