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
  if (!value) return [];
  return Array.from(new Set(value.split(/[,\s]+/).flatMap((part) => {
    const id = cleanOrderId(part);
    return id ? [id] : [];
  }))).slice(0, 100);
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
  if (!supabase || orderIds.length === 0) return new Map<number, OrderWorkflowState>();

  const params = new URLSearchParams({
    select: "order_id,state",
    order_id: `in.(${orderIds.join(",")})`,
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
  const rows = (await response.json()) as Array<{ order_id?: number | string; state?: OrderWorkflowState }>;
  return new Map(rows.flatMap((row) => {
    const orderId = typeof row.order_id === "number" ? row.order_id : cleanOrderId(String(row.order_id ?? ""));
    return orderId ? [[orderId, normalizeWorkflowState(orderId, row.state)] as const] : [];
  }));
}

async function readWorkflowState(orderId: number, supabaseStates?: Map<number, OrderWorkflowState>) {
  const supabaseState = supabaseStates ? supabaseStates.get(orderId) ?? null : await readSupabaseWorkflow(orderId);
  if (supabaseState) return { state: supabaseState, storage: "supabase" as const };
  if (supabaseStates && supabaseWorkflowConfig()) return { state: defaultState(orderId), storage: "supabase" as const };

  try {
    const blobState = await readEncryptedBlob<OrderWorkflowState>(pathFor(orderId), defaultState(orderId));
    return { state: normalizeWorkflowState(orderId, blobState), storage: "blob" as const };
  } catch (err) {
    if (isMissingBlobToken(err)) return { state: defaultState(orderId), storage: "disabled" as const };
    throw err;
  }
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
      const results = await Promise.all(orderIds.map((orderId) => readWorkflowState(orderId, supabaseStates)));
      const states = Object.fromEntries(results.map((result, index) => [String(orderIds[index]), result.state]));
      const storageDisabled = results.some((result) => result.storage === "disabled");
      const supabaseConfigured = Boolean(supabaseWorkflowConfig());
      return NextResponse.json({
        states,
        storage: storageDisabled ? "disabled" : supabaseConfigured ? "supabase" : supabaseStates.size > 0 ? "supabase" : "blob",
        disabledReason: storageDisabled ? "Workflow storage is not connected yet." : undefined,
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Workflow state unavailable" }, { status: 500 });
    }
  }

  const orderId = cleanOrderId(request.nextUrl.searchParams.get("orderId"));
  if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });

  try {
    const result = await readWorkflowState(orderId);
    if (result.storage === "disabled") {
      return NextResponse.json({ state: result.state, disabledReason: "Workflow storage is not connected yet." });
    }
    return NextResponse.json({ state: result.state, storage: result.storage });
  } catch (err) {
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
