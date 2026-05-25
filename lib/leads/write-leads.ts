import type { LeadPriority, LeadStatus } from "./types";

const VALID_STATUSES = new Set<LeadStatus>(["new", "qualifying", "quoted", "follow_up_due", "waiting_on_customer", "won", "lost", "parked"]);
const VALID_PRIORITIES = new Set<LeadPriority>(["hot", "normal", "low"]);
const VALID_SAMPLE_STATUSES = new Set(["requested", "packed", "sent", "delivered", "followed_up", "converted", "parked"]);

export type LeadWriteInput = {
  customerName?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  source?: unknown;
  productCategory?: unknown;
  estimatedValue?: unknown;
  status?: unknown;
  priority?: unknown;
  owner?: unknown;
  nextFollowUpAt?: unknown;
  lastInteractionAt?: unknown;
  lastInteractionSummary?: unknown;
  nextAction?: unknown;
  notes?: unknown;
  sourceUrl?: unknown;
  sampleSentAt?: unknown;
  sampleDeliveredAt?: unknown;
  sampleSpecies?: unknown;
  sampleStatus?: unknown;
  sampleTrackingUrl?: unknown;
  sampleNextAction?: unknown;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function assertLeadWritesEnabled() {
  if (process.env.TUESDAY_LEADS_WRITES_ENABLED !== "true") {
    throw new Error("Lead writes disabled; ask Guido to approve enabling Tuesday lead changes");
  }
}

function cleanText(value: unknown, max = 2000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function cleanDate(value: unknown): string | null | undefined {
  const text = cleanText(value, 20);
  if (text === undefined || text === null) return text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("nextFollowUpAt must be YYYY-MM-DD");
  return text;
}

function cleanNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error("estimatedValue must be a non-negative number");
  return Math.round(number * 100) / 100;
}

function cleanStatus(value: unknown): LeadStatus | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !VALID_STATUSES.has(value as LeadStatus)) throw new Error("Invalid lead status");
  return value as LeadStatus;
}

function cleanPriority(value: unknown): LeadPriority | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !VALID_PRIORITIES.has(value as LeadPriority)) throw new Error("Invalid lead priority");
  return value as LeadPriority;
}

function cleanSampleStatus(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !VALID_SAMPLE_STATUSES.has(value)) throw new Error("Invalid sample status");
  return value;
}

export function createLeadRow(input: LeadWriteInput) {
  const customerName = cleanText(input.customerName, 240);
  if (!customerName) throw new Error("Customer name is required");
  return {
    customer_name: customerName,
    contact_name: cleanText(input.contactName, 240) ?? null,
    email: cleanText(input.email, 320) ?? null,
    phone: cleanText(input.phone, 80) ?? null,
    source: cleanText(input.source, 160) ?? null,
    product_category: cleanText(input.productCategory, 180) ?? null,
    estimated_value: cleanNumber(input.estimatedValue) ?? null,
    status: cleanStatus(input.status) ?? "new",
    priority: cleanPriority(input.priority) ?? "normal",
    owner: cleanText(input.owner, 120) ?? null,
    next_follow_up_at: cleanDate(input.nextFollowUpAt) ?? null,
    last_interaction_at: cleanText(input.lastInteractionAt, 40) ?? null,
    last_interaction_summary: cleanText(input.lastInteractionSummary, 1000) ?? null,
    next_action: cleanText(input.nextAction, 1000) ?? null,
    notes: cleanText(input.notes, 4000) ?? null,
    source_url: cleanText(input.sourceUrl, 1000) ?? null,
    sample_sent_at: cleanDate(input.sampleSentAt) ?? null,
    sample_delivered_at: cleanDate(input.sampleDeliveredAt) ?? null,
    sample_species: cleanText(input.sampleSpecies, 240) ?? null,
    sample_status: cleanSampleStatus(input.sampleStatus) ?? null,
    sample_tracking_url: cleanText(input.sampleTrackingUrl, 1000) ?? null,
    sample_next_action: cleanText(input.sampleNextAction, 1000) ?? null,
    source_system: "supabase",
  };
}

export function updateLeadRow(input: LeadWriteInput) {
  const row: Record<string, unknown> = {};
  const mappings: Array<[keyof LeadWriteInput, string, (value: unknown) => unknown]> = [
    ["customerName", "customer_name", (value) => cleanText(value, 240)],
    ["contactName", "contact_name", (value) => cleanText(value, 240)],
    ["email", "email", (value) => cleanText(value, 320)],
    ["phone", "phone", (value) => cleanText(value, 80)],
    ["source", "source", (value) => cleanText(value, 160)],
    ["productCategory", "product_category", (value) => cleanText(value, 180)],
    ["estimatedValue", "estimated_value", cleanNumber],
    ["status", "status", cleanStatus],
    ["priority", "priority", cleanPriority],
    ["owner", "owner", (value) => cleanText(value, 120)],
    ["nextFollowUpAt", "next_follow_up_at", cleanDate],
    ["lastInteractionAt", "last_interaction_at", (value) => cleanText(value, 40)],
    ["lastInteractionSummary", "last_interaction_summary", (value) => cleanText(value, 1000)],
    ["nextAction", "next_action", (value) => cleanText(value, 1000)],
    ["notes", "notes", (value) => cleanText(value, 4000)],
    ["sourceUrl", "source_url", (value) => cleanText(value, 1000)],
    ["sampleSentAt", "sample_sent_at", cleanDate],
    ["sampleDeliveredAt", "sample_delivered_at", cleanDate],
    ["sampleSpecies", "sample_species", (value) => cleanText(value, 240)],
    ["sampleStatus", "sample_status", cleanSampleStatus],
    ["sampleTrackingUrl", "sample_tracking_url", (value) => cleanText(value, 1000)],
    ["sampleNextAction", "sample_next_action", (value) => cleanText(value, 1000)],
  ];

  for (const [inputKey, outputKey, cleaner] of mappings) {
    if (Object.prototype.hasOwnProperty.call(input, inputKey)) row[outputKey] = cleaner(input[inputKey]);
  }
  if (Object.keys(row).length === 0) throw new Error("No supported lead fields supplied");
  return row;
}

async function supabaseRequest(path: string, init: RequestInit) {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env not configured for Leads yet");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase leads write failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return response.json() as Promise<Record<string, unknown>[]>;
}

export async function createLead(input: LeadWriteInput) {
  assertLeadWritesEnabled();
  const rows = await supabaseRequest("leads", { method: "POST", body: JSON.stringify(createLeadRow(input)) });
  return rows[0] || null;
}

export async function updateLead(id: string, input: LeadWriteInput) {
  assertLeadWritesEnabled();
  if (!/^[0-9a-fA-F-]{32,36}$/.test(id)) throw new Error("Invalid lead id");
  const params = new URLSearchParams({ id: `eq.${id}` });
  const rows = await supabaseRequest(`leads?${params}`, { method: "PATCH", body: JSON.stringify(updateLeadRow(input)) });
  return rows[0] || null;
}
