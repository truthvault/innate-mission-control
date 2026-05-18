import type { LeadRecord, LeadsResult, LeadStatusBucket } from "./types";

const VALUE_KEYS = [
  "estimated_value",
  "estimatedValue",
  "value",
  "deal_value",
  "budget",
  "amount",
  "quote_value",
];

const FIELD_KEYS: Record<keyof Omit<LeadRecord, "id" | "estimatedValue" | "bucket" | "raw">, string[]> = {
  name: ["name", "customer", "customer_name", "lead_name", "company", "title"],
  contact: ["contact", "email", "phone", "mobile", "customer_email", "customer_phone"],
  source: ["source", "lead_source", "channel", "origin"],
  product: ["product", "category", "product_category", "item", "interest", "enquiry_type"],
  status: ["status", "stage", "lead_status", "pipeline_status"],
  owner: ["owner", "assignee", "sales_owner", "assigned_to"],
  nextFollowUp: ["next_follow_up", "nextFollowUp", "follow_up_at", "followup_at", "next_action_date", "due_date"],
  lastInteraction: ["last_interaction", "lastInteraction", "last_contacted", "updated_at", "created_at"],
  notes: ["notes", "note", "last_note", "description", "summary"],
  mondayUrl: ["monday_url", "mondayUrl", "monday_link", "url", "link"],
};

function stringValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") {
      const json = JSON.stringify(value);
      if (json && json !== "{}" && json !== "[]") return json;
    }
  }
  return "";
}

function numberValue(row: Record<string, unknown>): number | null {
  for (const key of VALUE_KEYS) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function classifyLead(status: string, nextFollowUp: string, lastInteraction: string, estimatedValue: number | null): LeadStatusBucket {
  const s = status.toLowerCase();
  if (/won|closed won|accepted|paid|deposit/.test(s)) return "won";
  if (/lost|dead|closed lost|cancel/.test(s)) return "lost";
  if (/park|hold|future|later|nurture/.test(s)) return "parked";
  if (/waiting|customer|client|reply|response/.test(s)) return "waiting";
  if (/hot|urgent|quote|proposal|ready|cash|high/.test(s) || (estimatedValue ?? 0) >= 5000) return "hot";

  const now = Date.now();
  const next = parseDate(nextFollowUp);
  const last = parseDate(lastInteraction);
  const staleMs = 1000 * 60 * 60 * 24 * 7;
  if (!next || next <= now || (last !== null && now - last > staleMs)) return "followUp";
  return "active";
}

function firstId(row: Record<string, unknown>, index: number): string {
  const id = row.id ?? row.uuid ?? row.lead_id ?? row.monday_item_id ?? row.mondayId;
  return id === null || id === undefined ? `lead-${index}` : String(id);
}

export function mapSupabaseLead(row: Record<string, unknown>, index: number): LeadRecord {
  const estimatedValue = numberValue(row);
  const status = stringValue(row, FIELD_KEYS.status) || "Active";
  const nextFollowUp = stringValue(row, FIELD_KEYS.nextFollowUp);
  const lastInteraction = stringValue(row, FIELD_KEYS.lastInteraction);
  return {
    id: firstId(row, index),
    name: stringValue(row, FIELD_KEYS.name) || "Unnamed lead",
    contact: stringValue(row, FIELD_KEYS.contact),
    source: stringValue(row, FIELD_KEYS.source),
    product: stringValue(row, FIELD_KEYS.product),
    estimatedValue,
    status,
    bucket: classifyLead(status, nextFollowUp, lastInteraction, estimatedValue),
    owner: stringValue(row, FIELD_KEYS.owner),
    nextFollowUp,
    lastInteraction,
    notes: stringValue(row, FIELD_KEYS.notes),
    mondayUrl: stringValue(row, FIELD_KEYS.mondayUrl),
    raw: row,
  };
}

export async function getLeadsOverview(): Promise<LeadsResult> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const missingEnv = [
    !supabaseUrl ? "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL" : "",
    !serviceKey ? "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY" : "",
  ].filter(Boolean);

  if (missingEnv.length > 0) {
    return {
      leads: [],
      source: "none",
      syncedAt: new Date().toISOString(),
      missingEnv,
      error: `Supabase leads are read-only and disabled until ${missingEnv.join(" and ")} are configured.`,
    };
  }

  const table = process.env.SUPABASE_LEADS_TABLE || "leads";
  try {
    const base = supabaseUrl!.replace(/\/$/, "");
    const response = await fetch(`${base}/rest/v1/${encodeURIComponent(table)}?select=*`, {
      headers: {
        apikey: serviceKey!,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        leads: [],
        source: "supabase",
        syncedAt: new Date().toISOString(),
        table,
        error: `Supabase ${table} read failed (${response.status}): ${text.slice(0, 220)}`,
      };
    }
    const rows = JSON.parse(text) as Array<Record<string, unknown>>;
    return {
      leads: Array.isArray(rows) ? rows.map(mapSupabaseLead) : [],
      source: "supabase",
      syncedAt: new Date().toISOString(),
      table,
    };
  } catch (error) {
    return {
      leads: [],
      source: "supabase",
      syncedAt: new Date().toISOString(),
      table,
      error: error instanceof Error ? error.message : "Unknown Supabase read error",
    };
  }
}
