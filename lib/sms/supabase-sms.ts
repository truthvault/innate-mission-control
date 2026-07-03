import { normalizePhoneNumber } from "./phone";
import type { NormalizedInboundSms } from "./twotalk";

export type SmsRecentContext = {
  id?: string | null;
  direction?: "inbound" | "outbound" | string | null;
  status?: string | null;
  occurred_at?: string | null;
  summary: string;
};

export type StoredSmsMessage = {
  id?: string;
  lead_id?: string | null;
  lead_customer_name?: string | null;
  lead_contact_name?: string | null;
  lead_email?: string | null;
  lead_phone?: string | null;
  lead_source?: string | null;
  lead_status?: string | null;
  lead_priority?: string | null;
  lead_product_category?: string | null;
  lead_owner?: string | null;
  lead_next_follow_up_at?: string | null;
  lead_last_interaction_at?: string | null;
  lead_last_interaction_summary?: string | null;
  lead_next_action?: string | null;
  lead_notes?: string | null;
  lead_source_url?: string | null;
  lead_created_at?: string | null;
  lead_updated_at?: string | null;
  lead_match_confidence?: "high" | "medium" | "low" | null;
  lead_match_source?: string | null;
  recent_sms_context?: SmsRecentContext[];
  enrichment_warning?: string | null;
  direction: "inbound" | "outbound";
  provider: string;
  provider_message_id?: string | null;
  from_number?: string | null;
  from_number_normalized?: string | null;
  to_number?: string | null;
  to_number_normalized?: string | null;
  message_body: string;
  status?: string | null;
  received_at?: string | null;
  sent_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
  error?: string | null;
};

export type LeadPhoneMatch = {
  id: string;
  customer_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  priority?: string | null;
  product_category?: string | null;
  owner?: string | null;
  next_follow_up_at?: string | null;
  last_interaction_at?: string | null;
  last_interaction_summary?: string | null;
  next_action?: string | null;
  notes?: string | null;
  source_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  match_confidence?: "high" | "medium" | "low";
  match_source?: string;
};

const KNOWN_SMS_CONTACTS: Record<
  string,
  {
    contact_name: string;
    customer_name?: string;
    role: string;
    match_source: string;
  }
> = {
  [["+64", "273", "502", "083"].join("")]: {
    contact_name: "Guido Loeffler",
    customer_name: "Innate Furniture",
    role: "Innate owner / primary business contact",
    match_source: "known Innate internal contact number",
  },
  [["+64", "220", "209", "901"].join("")]: {
    contact_name: "Nick Lee",
    customer_name: "Innate Furniture",
    role: "Innate team / call failover contact",
    match_source: "known Innate internal contact number",
  },
  [["+64", "282", "561", "0137"].join("")]: {
    contact_name: "Innate SMS line",
    customer_name: "Innate Furniture",
    role: "public business SMS/mobile number",
    match_source: "2talk SMS service number",
  },
  [["+64", "332", "750", "12"].join("")]: {
    contact_name: "Innate landline",
    customer_name: "Innate Furniture",
    role: "public business landline",
    match_source: "2talk landline service number",
  },
};

export type SmsSlackThread = {
  id?: string;
  inbound_sms_id?: string | null;
  last_outbound_sms_id?: string | null;
  lead_id?: string | null;
  slack_channel_id: string;
  slack_message_ts: string;
  slack_thread_ts: string;
  customer_number?: string | null;
  customer_number_normalized: string;
  service_number?: string | null;
  service_number_normalized?: string | null;
  status?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

export type OutboundSmsStorageInput = {
  leadId?: string | null;
  providerMessageId?: string | null;
  fromNumber?: string | null;
  toNumber: string;
  message: string;
  status: string;
  sentAt?: string | null;
  rawPayload?: Record<string, unknown> | null;
  error?: string | null;
};

type SupabaseConfig = { url: string; serviceKey: string };

type LeadPhoneRow = Record<string, unknown> & {
  id?: string;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
};

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env not configured for SMS storage");

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
    throw new Error(`Supabase SMS request failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function findLeadByPhone(normalizedPhone: string): Promise<LeadPhoneMatch | null> {
  if (!normalizedPhone) return null;

  const params = new URLSearchParams({
    select: "*",
    archived_at: "is.null",
    order: "updated_at.desc",
    limit: "500",
  });
  const leads = await supabaseRequest<LeadPhoneRow[]>(`leads?${params}`, { method: "GET" });
  return findLeadPhoneMatchInRows(leads, normalizedPhone);
}

export async function findLeadIdByPhone(normalizedPhone: string): Promise<string | null> {
  const match = await findLeadByPhone(normalizedPhone);
  return match?.id || null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compactText(value: unknown, max = 220): string | null {
  const text = stringValue(value)?.replace(/\s+/g, " ");
  if (!text) return null;
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function candidatePhoneFields(row: LeadPhoneRow): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  for (const [field, value] of Object.entries(row)) {
    if (!/(phone|mobile|telephone|cell)/i.test(field)) continue;
    const text = stringValue(value);
    if (text) fields.push({ field, value: text });
  }
  return fields;
}

function candidatePhoneTextFields(row: LeadPhoneRow): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];
  for (const [field, value] of Object.entries(row)) {
    if (!/(note|summary|description|message|requirement|context)/i.test(field)) continue;
    const text = stringValue(value);
    if (text) fields.push({ field, value: text });
  }
  return fields;
}

function phoneCandidatesFromText(value: string): string[] {
  const matches = value.match(/(?:\+?64|0)\s*[\d\s().-]{6,}\d/g) || [];
  return matches.map((match) => match.trim());
}

function leadMatchFromRow(row: LeadPhoneRow, matchSource: string, confidence: "high" | "medium" | "low"): LeadPhoneMatch | null {
  const id = stringValue(row.id);
  if (!id) return null;
  return {
    id,
    customer_name: stringValue(row.customer_name),
    contact_name: stringValue(row.contact_name),
    email: stringValue(row.email),
    phone: stringValue(row.phone),
    source: stringValue(row.source),
    status: stringValue(row.status),
    priority: stringValue(row.priority),
    product_category: stringValue(row.product_category),
    owner: stringValue(row.owner),
    next_follow_up_at: stringValue(row.next_follow_up_at),
    last_interaction_at: stringValue(row.last_interaction_at),
    last_interaction_summary: stringValue(row.last_interaction_summary),
    next_action: stringValue(row.next_action),
    notes: stringValue(row.notes),
    source_url: stringValue(row.source_url),
    created_at: stringValue(row.created_at),
    updated_at: stringValue(row.updated_at),
    match_confidence: confidence,
    match_source: matchSource,
  };
}

function findLeadPhoneMatchInRows(leads: LeadPhoneRow[], normalizedPhone: string): LeadPhoneMatch | null {
  for (const lead of leads) {
    for (const candidate of candidatePhoneFields(lead)) {
      if (normalizePhoneNumber(candidate.value) === normalizedPhone) {
        return leadMatchFromRow(lead, `leads.${candidate.field}`, "high");
      }
    }
  }

  for (const lead of leads) {
    for (const field of candidatePhoneTextFields(lead)) {
      for (const candidate of phoneCandidatesFromText(field.value)) {
        if (normalizePhoneNumber(candidate) === normalizedPhone) {
          return leadMatchFromRow(lead, `leads.${field.field} phone text`, "low");
        }
      }
    }
  }
  return null;
}

function applyLeadMatchContext(sms: StoredSmsMessage, leadMatch: LeadPhoneMatch | null): StoredSmsMessage {
  if (!leadMatch) return sms;
  return {
    ...sms,
    lead_id: sms.lead_id || leadMatch.id,
    lead_customer_name: leadMatch.customer_name || null,
    lead_contact_name: leadMatch.contact_name || null,
    lead_email: leadMatch.email || null,
    lead_phone: leadMatch.phone || null,
    lead_source: leadMatch.source || null,
    lead_status: leadMatch.status || null,
    lead_priority: leadMatch.priority || null,
    lead_product_category: leadMatch.product_category || null,
    lead_owner: leadMatch.owner || null,
    lead_next_follow_up_at: leadMatch.next_follow_up_at || null,
    lead_last_interaction_at: leadMatch.last_interaction_at || null,
    lead_last_interaction_summary: leadMatch.last_interaction_summary || null,
    lead_next_action: leadMatch.next_action || null,
    lead_notes: leadMatch.notes || null,
    lead_source_url: leadMatch.source_url || null,
    lead_created_at: leadMatch.created_at || null,
    lead_updated_at: leadMatch.updated_at || null,
    lead_match_confidence: leadMatch.match_confidence || "high",
    lead_match_source: leadMatch.match_source || "leads.phone",
  };
}

function recentSmsSummary(row: Record<string, unknown>): SmsRecentContext | null {
  const id = stringValue(row.id);
  const body = compactText(row.message_body, 110);
  if (!body) return null;
  return {
    id,
    direction: stringValue(row.direction),
    status: stringValue(row.status),
    occurred_at: stringValue(row.received_at) || stringValue(row.sent_at) || stringValue(row.created_at),
    summary: body,
  };
}

export async function findRecentSmsContext(normalizedPhone: string, currentSmsId?: string | null): Promise<SmsRecentContext[]> {
  if (!normalizedPhone) return [];
  const params = new URLSearchParams({
    select: "id,direction,status,created_at,received_at,sent_at,message_body,from_number_normalized,to_number_normalized",
    or: `(from_number_normalized.eq.${normalizedPhone},to_number_normalized.eq.${normalizedPhone})`,
    order: "created_at.desc",
    limit: "6",
  });
  const rows = await supabaseRequest<Record<string, unknown>[]>(`sms_messages?${params}`, { method: "GET" });
  return rows
    .filter((row) => stringValue(row.id) !== currentSmsId)
    .map(recentSmsSummary)
    .filter((row): row is SmsRecentContext => Boolean(row))
    .slice(0, 3);
}

function applyKnownSmsContactContext(sms: StoredSmsMessage, normalizedPhone: string): StoredSmsMessage {
  if (sms.lead_customer_name || sms.lead_contact_name) return sms;
  const known = KNOWN_SMS_CONTACTS[normalizedPhone];
  if (!known) return sms;
  return {
    ...sms,
    lead_customer_name: known.customer_name || null,
    lead_contact_name: known.contact_name,
    lead_match_confidence: "high",
    lead_match_source: known.match_source,
    lead_notes: known.role,
  };
}

export async function enrichInboundSmsContext(sms: StoredSmsMessage): Promise<StoredSmsMessage> {
  if (sms.direction !== "inbound") return sms;

  let enriched = sms;
  const normalizedPhone = sms.from_number_normalized || normalizePhoneNumber(sms.from_number) || "";
  enriched = applyKnownSmsContactContext(enriched, normalizedPhone);
  try {
    if (!enriched.lead_id && !enriched.lead_customer_name && !enriched.lead_contact_name) {
      const leadMatch = await findLeadByPhone(normalizedPhone);
      enriched = applyLeadMatchContext(enriched, leadMatch);
    }
  } catch (err) {
    enriched = {
      ...enriched,
      enrichment_warning: err instanceof Error ? `Lead context lookup failed: ${err.message}` : "Lead context lookup failed",
    };
  }

  try {
    enriched = {
      ...enriched,
      recent_sms_context: await findRecentSmsContext(normalizedPhone, sms.id || null),
    };
  } catch (err) {
    enriched = {
      ...enriched,
      enrichment_warning: enriched.enrichment_warning || (err instanceof Error ? `Recent SMS context lookup failed: ${err.message}` : "Recent SMS context lookup failed"),
    };
  }

  return enriched;
}

export async function storeInboundSms(message: NormalizedInboundSms): Promise<StoredSmsMessage> {
  const leadMatch = await findLeadByPhone(message.fromNumberNormalized).catch(() => null);
  const row: StoredSmsMessage = {
    lead_id: leadMatch?.id || null,
    direction: "inbound",
    provider: message.provider,
    provider_message_id: message.providerMessageId ?? null,
    from_number: message.fromNumber,
    from_number_normalized: message.fromNumberNormalized,
    to_number: message.toNumber ?? null,
    to_number_normalized: message.toNumberNormalized ?? null,
    message_body: message.message,
    status: leadMatch ? "matched" : "unmatched",
    received_at: message.receivedAt,
    raw_payload: message.rawPayload,
  };

  const rows = await supabaseRequest<StoredSmsMessage[]>("sms_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return applyLeadMatchContext(rows[0] || row, leadMatch);
}

export async function storeOutboundSms(input: OutboundSmsStorageInput): Promise<StoredSmsMessage> {
  const toNumberNormalized = normalizePhoneNumber(input.toNumber);
  if (!toNumberNormalized) throw new Error("Outbound SMS recipient number could not be normalized");

  const fromNumberNormalized = normalizePhoneNumber(input.fromNumber);
  const row = compactRecord({
    lead_id: input.leadId ?? null,
    direction: "outbound",
    provider: "2talk",
    provider_message_id: input.providerMessageId ?? null,
    from_number: input.fromNumber ?? null,
    from_number_normalized: fromNumberNormalized,
    to_number: input.toNumber,
    to_number_normalized: toNumberNormalized,
    message_body: input.message,
    status: input.status,
    sent_at: input.sentAt ?? null,
    raw_payload: input.rawPayload ?? null,
    error: input.error ?? null,
  }) as StoredSmsMessage;

  const rows = await supabaseRequest<StoredSmsMessage[]>("sms_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return rows[0] || row;
}

export async function upsertSmsSlackThread(mapping: SmsSlackThread): Promise<SmsSlackThread> {
  const rows = await supabaseRequest<SmsSlackThread[]>("sms_slack_threads?on_conflict=slack_channel_id,slack_thread_ts", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(mapping),
  });
  return rows[0] || mapping;
}

export async function findSmsSlackThread(channelId: string, threadTs: string): Promise<SmsSlackThread | null> {
  const params = new URLSearchParams({
    select: "*",
    slack_channel_id: `eq.${channelId}`,
    slack_thread_ts: `eq.${threadTs}`,
    limit: "1",
  });
  const rows = await supabaseRequest<SmsSlackThread[]>(`sms_slack_threads?${params}`, { method: "GET" });
  return rows[0] || null;
}
