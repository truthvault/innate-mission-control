import type { Lead, LeadPriority, LeadsResult, LeadStatus, SampleStatus } from "./types";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

const VALID_STATUSES = new Set<LeadStatus>(["new", "qualifying", "quoted", "follow_up_due", "waiting_on_customer", "won", "lost", "parked"]);
const VALID_PRIORITIES = new Set<LeadPriority>(["hot", "normal", "low"]);
const VALID_SAMPLE_STATUSES = new Set<SampleStatus>(["requested", "packed", "sent", "delivered", "followed_up", "converted", "parked"]);

function asStatus(value: unknown): LeadStatus {
  const raw = asString(value) as LeadStatus | undefined;
  return raw && VALID_STATUSES.has(raw) ? raw : "new";
}

function asPriority(value: unknown): LeadPriority {
  const raw = asString(value) as LeadPriority | undefined;
  return raw && VALID_PRIORITIES.has(raw) ? raw : "normal";
}

function asSampleStatus(value: unknown): SampleStatus | undefined {
  const raw = asString(value) as SampleStatus | undefined;
  return raw && VALID_SAMPLE_STATUSES.has(raw) ? raw : undefined;
}

function rowFromSupabase(record: Record<string, unknown>): Lead {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || `${asString(record.customer_name) || "lead"}-${asString(record.created_at) || now}`,
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
    customerName: asString(record.customer_name) || "Unnamed lead",
    contactName: asString(record.contact_name),
    email: asString(record.email),
    phone: asString(record.phone),
    source: asString(record.source),
    productCategory: asString(record.product_category),
    estimatedValue: asNumber(record.estimated_value),
    status: asStatus(record.status),
    priority: asPriority(record.priority),
    owner: asString(record.owner),
    nextFollowUpAt: asString(record.next_follow_up_at),
    lastInteractionAt: asString(record.last_interaction_at),
    lastInteractionSummary: asString(record.last_interaction_summary),
    nextAction: asString(record.next_action),
    notes: asString(record.notes),
    sourceUrl: asString(record.source_url),
    sourceSystem: asString(record.source_system) || "supabase",
    mondayItemId: asString(record.monday_item_id),
    sampleSentAt: asString(record.sample_sent_at),
    sampleDeliveredAt: asString(record.sample_delivered_at),
    sampleSpecies: asString(record.sample_species),
    sampleStatus: asSampleStatus(record.sample_status),
    sampleTrackingUrl: asString(record.sample_tracking_url),
    sampleNextAction: asString(record.sample_next_action),
  };
}

export async function listLeads(limit = 200): Promise<LeadsResult> {
  const syncedAt = new Date().toISOString();
  const supabase = supabaseConfig();
  if (!supabase) {
    return { rows: [], syncedAt, source: "none", error: "Supabase env not configured for Leads yet" };
  }

  const params = new URLSearchParams({
    select: "*",
    archived_at: "is.null",
    order: "updated_at.desc",
    limit: String(Math.max(1, Math.min(limit, 500))),
  });

  try {
    const response = await fetch(`${supabase.url}/rest/v1/leads?${params}`, {
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      return { rows: [], syncedAt, source: "supabase", error: `Supabase leads read failed: HTTP ${response.status} ${text.slice(0, 240)}` };
    }
    const body = (await response.json()) as Record<string, unknown>[];
    return { rows: body.map(rowFromSupabase), syncedAt, source: "supabase" };
  } catch (err) {
    return { rows: [], syncedAt, source: "supabase", error: err instanceof Error ? err.message : String(err) };
  }
}
