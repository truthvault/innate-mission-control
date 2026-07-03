import { normalizePhoneNumber } from "./phone";

export type SmsDirection = "inbound" | "outbound";

export type NormalizedInboundSms = {
  direction: "inbound";
  provider: "2talk";
  providerMessageId?: string;
  fromNumber: string;
  fromNumberNormalized: string;
  toNumber?: string;
  toNumberNormalized?: string;
  message: string;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
};

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = value.trim();
    return text || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function getCaseInsensitive(payload: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, key)) return payload[key];
  const lower = key.toLowerCase();
  const match = Object.keys(payload).find((candidate) => candidate.toLowerCase() === lower);
  return match ? payload[match] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function getPath(payload: Record<string, unknown>, path: string): unknown {
  let current: unknown = payload;
  for (const part of path.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = getCaseInsensitive(record, part);
  }
  return current;
}

function firstString(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = key.includes(".") ? getPath(payload, key) : getCaseInsensitive(payload, key);
    const direct = asString(value);
    if (direct) return direct;
  }
  return undefined;
}

export async function parseSmsWebhookPayload(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
    throw new Error("Invalid JSON webhook payload");
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload: Record<string, unknown> = {};
    form.forEach((value, key) => {
      payload[key] = typeof value === "string" ? value : value.name;
    });
    return payload;
  }

  const text = await request.text();
  if (!text.trim()) throw new Error("Empty webhook payload");

  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Fall through to query-string parsing for providers that POST raw form bodies
    // without a useful content-type.
  }

  const params = new URLSearchParams(text);
  const payload = Object.fromEntries(params.entries());
  if (Object.keys(payload).length) return payload;

  throw new Error("Unsupported webhook payload");
}

export function normalizeInbound2talkSms(payload: Record<string, unknown>): NormalizedInboundSms {
  const fromNumber = firstString(payload, [
    "from",
    "From",
    "sender",
    "Sender",
    "source",
    "Source",
    "mobile",
    "Mobile",
    "msisdn",
    "MSISDN",
    "callerid",
    "caller_id",
    "from_number",
    "fromNumber",
    "source_addr",
    "src",
    "data.payload.from.phone_number",
    "payload.from.phone_number",
  ]);
  const message = firstString(payload, [
    "message",
    "Message",
    "body",
    "Body",
    "text",
    "Text",
    "sms",
    "SMS",
    "content",
    "Content",
    "message_text",
    "messageText",
    "msg",
    "data.payload.text",
    "payload.text",
  ]);

  if (!fromNumber) throw new Error("Inbound SMS payload is missing sender/from number");
  if (!message) throw new Error("Inbound SMS payload is missing message text");

  const fromNumberNormalized = normalizePhoneNumber(fromNumber);
  if (!fromNumberNormalized) throw new Error("Inbound SMS sender number could not be normalized");

  const toNumber = firstString(payload, [
    "to",
    "To",
    "recipient",
    "Recipient",
    "destination",
    "Destination",
    "did",
    "DID",
    "number",
    "Number",
    "to_number",
    "toNumber",
    "destination_addr",
    "dst",
    "data.payload.to.0.phone_number",
    "payload.to.0.phone_number",
    "data.payload.to.phone_number",
    "payload.to.phone_number",
  ]);
  const toNumberNormalized = normalizePhoneNumber(toNumber);
  const providerMessageId = firstString(payload, [
    "id",
    "message_id",
    "messageId",
    "sms_id",
    "smsId",
    "uuid",
    "MessageSid",
    "SmsMessageSid",
    "data.id",
    "data.payload.id",
    "payload.id",
  ]);
  const receivedAt = firstString(payload, [
    "received_at",
    "receivedAt",
    "timestamp",
    "Timestamp",
    "date",
    "Date",
    "data.occurred_at",
    "data.payload.received_at",
    "payload.received_at",
  ]);
  const parsedReceivedAt = receivedAt && !Number.isNaN(Date.parse(receivedAt)) ? new Date(receivedAt).toISOString() : new Date().toISOString();

  return {
    direction: "inbound",
    provider: "2talk",
    providerMessageId,
    fromNumber,
    fromNumberNormalized,
    toNumber,
    toNumberNormalized: toNumberNormalized || undefined,
    message,
    receivedAt: parsedReceivedAt,
    rawPayload: payload,
  };
}
