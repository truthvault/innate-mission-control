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
  return rows[0]?.state ?? defaultState(orderId);
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

    const next: OrderWorkflowState = {
      ...defaultState(orderId),
      ...state,
      xeroInvoiceNumber: typeof state.xeroInvoiceNumber === "string" && state.xeroInvoiceNumber.trim() ? state.xeroInvoiceNumber.trim().toUpperCase() : null,
      updatedAt: new Date().toISOString(),
    };

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
