import { normalizePhoneNumber } from "./phone";
import type { NormalizedInboundSms } from "./twotalk";

export type StoredSmsMessage = {
  id?: string;
  lead_id?: string | null;
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
};

type SupabaseConfig = { url: string; serviceKey: string };

type LeadPhoneRow = {
  id?: string;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
};

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

export async function findLeadIdByPhone(normalizedPhone: string): Promise<string | null> {
  if (!normalizedPhone) return null;

  const params = new URLSearchParams({
    select: "id,customer_name,contact_name,phone",
    archived_at: "is.null",
    phone: "not.is.null",
    limit: "500",
  });
  const leads = await supabaseRequest<LeadPhoneRow[]>(`leads?${params}`, { method: "GET" });
  const match = leads.find((lead) => normalizePhoneNumber(lead.phone) === normalizedPhone);
  return match?.id || null;
}

export async function storeInboundSms(message: NormalizedInboundSms): Promise<StoredSmsMessage> {
  const leadId = await findLeadIdByPhone(message.fromNumberNormalized).catch(() => null);
  const row: StoredSmsMessage = {
    lead_id: leadId,
    direction: "inbound",
    provider: message.provider,
    provider_message_id: message.providerMessageId ?? null,
    from_number: message.fromNumber,
    from_number_normalized: message.fromNumberNormalized,
    to_number: message.toNumber ?? null,
    to_number_normalized: message.toNumberNormalized ?? null,
    message_body: message.message,
    status: leadId ? "matched" : "unmatched",
    received_at: message.receivedAt,
    raw_payload: message.rawPayload,
  };

  const rows = await supabaseRequest<StoredSmsMessage[]>("sms_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return rows[0] || row;
}
