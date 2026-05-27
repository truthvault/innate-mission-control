import { isMissingBlobToken, readEncryptedBlob, writeEncryptedBlob } from "@/lib/tuesday/encrypted-blob-store";

export type PlanTaskPlacement = {
  mode: "start" | "end" | "before" | "after";
  anchorTaskId?: string;
};

export type PlanTaskLinkValue = number | { orderId: number; placement?: PlanTaskPlacement };
export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
export type Person = "nick" | "dylan";
export type PlanTaskEditValue = {
  text?: string;
  rowName?: string;
  weekId?: string;
  day?: DayKey;
  person?: Person;
  estimatedHours?: number;
  sortOrder?: number;
  internal?: boolean;
  done?: boolean;
  updatedAt: string;
};

export type PlanTaskLinksState = {
  links: Record<string, PlanTaskLinkValue>;
  taskEdits: Record<string, PlanTaskEditValue>;
  updatedAt: string;
};

export type PlanTaskLinksStorage = "blob" | "supabase";

const BLOB_PATH = "production-plan-task-links/current.json";
const SUPABASE_TABLE = process.env.TUESDAY_PLAN_TASK_TABLE || "production_order_workflows";
const SUPABASE_SENTINEL_ORDER_ID = 0;

export function defaultPlanTaskLinksState(): PlanTaskLinksState {
  return { links: {}, taskEdits: {}, updatedAt: new Date().toISOString() };
}

export function planTaskLinksStorage(): PlanTaskLinksStorage {
  return process.env.TUESDAY_PLAN_TASK_STORAGE === "supabase" ? "supabase" : "blob";
}

function normalizeState(state: Partial<PlanTaskLinksState> | null | undefined): PlanTaskLinksState {
  return {
    ...defaultPlanTaskLinksState(),
    ...(state ?? {}),
    links: state?.links ?? {},
    taskEdits: state?.taskEdits ?? {},
  };
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest(path: string, init: RequestInit) {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env not configured for plan task links yet");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase plan task links request failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return response;
}

async function readSupabaseState(): Promise<PlanTaskLinksState> {
  const params = new URLSearchParams({
    order_id: `eq.${SUPABASE_SENTINEL_ORDER_ID}`,
    select: "state,updated_at",
    limit: "1",
  });
  const response = await supabaseRequest(`${SUPABASE_TABLE}?${params}`, { method: "GET" });
  const rows = (await response.json()) as Array<{ state?: unknown; updated_at?: unknown }>;
  const row = rows[0];
  if (!row) return defaultPlanTaskLinksState();
  const state = isRecord(row.state) ? row.state as Partial<PlanTaskLinksState> : {};
  return normalizeState({
    ...state,
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : typeof row.updated_at === "string" ? row.updated_at : undefined,
  });
}

async function writeSupabaseState(state: PlanTaskLinksState): Promise<PlanTaskLinksState> {
  const normalized = normalizeState(state);
  const response = await supabaseRequest(SUPABASE_TABLE, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      order_id: SUPABASE_SENTINEL_ORDER_ID,
      xero_invoice_number: null,
      state: normalized,
      updated_at: normalized.updatedAt,
    }),
  });
  const rows = (await response.json()) as Array<{ state?: unknown; updated_at?: unknown }>;
  const row = rows[0];
  if (!row || !isRecord(row.state)) return normalized;
  const saved = row.state as Partial<PlanTaskLinksState>;
  return normalizeState({
    ...saved,
    updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : typeof row.updated_at === "string" ? row.updated_at : normalized.updatedAt,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readBlobState(): Promise<PlanTaskLinksState> {
  const state = await readEncryptedBlob<PlanTaskLinksState>(BLOB_PATH, defaultPlanTaskLinksState());
  return normalizeState(state);
}

async function writeBlobState(state: PlanTaskLinksState): Promise<PlanTaskLinksState> {
  const normalized = normalizeState(state);
  await writeEncryptedBlob(BLOB_PATH, normalized);
  return normalized;
}

export async function readPlanTaskLinksState(): Promise<{ state: PlanTaskLinksState; storage: PlanTaskLinksStorage }> {
  const storage = planTaskLinksStorage();
  const state = storage === "supabase" ? await readSupabaseState() : await readBlobState();
  return { state, storage };
}

export async function writePlanTaskLinksState(state: PlanTaskLinksState): Promise<{ state: PlanTaskLinksState; storage: PlanTaskLinksStorage }> {
  const storage = planTaskLinksStorage();
  const written = storage === "supabase" ? await writeSupabaseState(state) : await writeBlobState(state);
  return { state: written, storage };
}

export { isMissingBlobToken };
