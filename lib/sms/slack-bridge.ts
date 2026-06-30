import { createHmac, timingSafeEqual } from "node:crypto";
import {
  enrichInboundSmsContext,
  findSmsSlackThread,
  storeOutboundSms,
  type SmsSlackThread,
  type StoredSmsMessage,
  upsertSmsSlackThread,
} from "./supabase-sms";
import { sendApprovedTwoTalkSms, smsSendingAvailable } from "./twotalk-outbound";
import { normalizePhoneNumber } from "./phone";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type SlackPostingConfig = {
  token: string;
  channelId: string;
};

export type SlackInboundBridgeResult =
  | { status: "not_configured"; warning: string; missing: string[] }
  | { status: "posted"; channelId: string; messageTs: string; mappingId?: string | null }
  | { status: "mapping_failed"; channelId: string; messageTs: string; warning: string }
  | { status: "post_failed"; warning: string };

export type SlackSignatureVerification =
  | { ok: true }
  | { ok: false; status: number; error: string };

type SlackMessageEvent = {
  type?: string;
  subtype?: string;
  bot_id?: string;
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

export type SlackEventsRequestBody = {
  type?: string;
  token?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event_time?: number;
  event?: SlackMessageEvent;
};

export type SlackReplyDecision =
  | {
      shouldProcess: true;
      channelId: string;
      threadTs: string;
      messageTs: string;
      userId: string;
      text: string;
    }
  | { shouldProcess: false; reason: string };

export type SlackReplyProcessingResult =
  | { ok: true; action: "ignored"; reason: string }
  | { ok: true; action: "outbound_disabled"; storedId?: string | null }
  | { ok: true; action: "sent"; storedId?: string | null }
  | { ok: false; action: "mapping_lookup_failed" | "send_failed" | "store_failed"; error: string };

export type SlackSmsCommandInput = {
  channelId?: string | null;
  userId?: string | null;
  text?: string | null;
  command?: string | null;
  responseUrl?: string | null;
};

export type SlackSmsCommandResult =
  | { ok: true; action: "sent"; storedId?: string | null; threadTs?: string | null; toNumber: string }
  | { ok: true; action: "outbound_disabled"; storedId?: string | null; toNumber: string }
  | {
      ok: false;
      action: "invalid_command" | "wrong_channel" | "unauthorized_user" | "send_failed" | "store_failed" | "slack_post_failed";
      error: string;
    };

function trimEnv(value: string | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function configuredSlackPosting(): SlackPostingConfig | null {
  const token = trimEnv(process.env.SMS_SLACK_BOT_TOKEN) || trimEnv(process.env.SLACK_BOT_TOKEN);
  const channelId = trimEnv(process.env.SMS_SLACK_CHANNEL_ID);
  if (!token || !channelId) return null;
  return { token, channelId };
}

export function configuredSlackSigningSecret(): string | null {
  return trimEnv(process.env.SMS_SLACK_SIGNING_SECRET) || trimEnv(process.env.SLACK_SIGNING_SECRET);
}

export function configuredSlackChannelId(): string | null {
  return trimEnv(process.env.SMS_SLACK_CHANNEL_ID);
}

function configuredAllowedSmsUsers(): Set<string> | null {
  const raw = trimEnv(process.env.SMS_SLACK_ALLOWED_USER_IDS);
  if (!raw) return null;
  const values = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? new Set(values) : null;
}

export function slackPostingConfigured(): boolean {
  return Boolean(configuredSlackPosting());
}

function slackEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slackQuote(value: string): string {
  return slackEscape(value)
    .split("\n")
    .map((line) => `>${line || " "}`)
    .join("\n");
}

function formatSmsDisplayNumber(value: string): string {
  return value.replace(/^\+64/, "0");
}

function parseSlackSmsCommandText(text: string | null | undefined): { toNumber: string; message: string } | null {
  const raw = text?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/^(new|send|sms|test)\s+/i, "").trim();
  const match = cleaned.match(/^(\+?\d[\d\s().-]{6,}\d)\s+([\s\S]+)$/);
  if (!match) return null;
  const toNumber = normalizePhoneNumber(match[1]);
  const message = match[2].trim();
  if (!toNumber || !message) return null;
  if (message.length > 918) return null;
  return { toNumber, message };
}

function smsLeadLabel(sms: StoredSmsMessage): string | null {
  const names = [sms.lead_contact_name, sms.lead_customer_name].filter(Boolean).join(" / ");
  if (names) return names;
  return sms.lead_id ? `Lead ${sms.lead_id}` : null;
}

function shortSlackText(value: string | null | undefined, max = 220): string | null {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function compactDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function leadContextLines(sms: StoredSmsMessage): string[] {
  const lines: string[] = [];
  if (sms.lead_status) lines.push(`Status: ${sms.lead_status}${sms.lead_priority ? ` / ${sms.lead_priority}` : ""}`);
  if (sms.lead_product_category) lines.push(`Interest: ${sms.lead_product_category}`);
  if (sms.lead_source) lines.push(`Source: ${sms.lead_source}`);
  if (sms.lead_owner) lines.push(`Owner: ${sms.lead_owner}`);
  if (sms.lead_next_follow_up_at) lines.push(`Next follow-up: ${compactDate(sms.lead_next_follow_up_at)}`);
  const last = shortSlackText(sms.lead_last_interaction_summary, 180);
  if (last) lines.push(`Last interaction: ${last}${sms.lead_last_interaction_at ? ` (${compactDate(sms.lead_last_interaction_at)})` : ""}`);
  const action = shortSlackText(sms.lead_next_action, 180);
  if (action) lines.push(`Next action: ${action}`);
  const notes = shortSlackText(sms.lead_notes, 180);
  if (notes) lines.push(`Notes: ${notes}`);
  if (sms.lead_id) lines.push(`Lead ID: ${sms.lead_id}`);
  return lines.slice(0, 8);
}

function recentSmsLines(sms: StoredSmsMessage): string[] {
  return (sms.recent_sms_context || []).slice(0, 3).map((item) => {
    const when = compactDate(item.occurred_at) || "recent";
    const direction = item.direction || "sms";
    return `${when} ${direction}: ${item.summary}`;
  });
}

function buildMatchLine(sms: StoredSmsMessage): string {
  const leadLabel = smsLeadLabel(sms);
  if (leadLabel) {
    const confidence = sms.lead_match_confidence || "high";
    const source = sms.lead_match_source || "Supabase lead phone";
    return `*Likely person:* ${slackEscape(leadLabel)} (${slackEscape(confidence)} confidence via ${slackEscape(source)})`;
  }
  return "*:warning: Unmatched sender:* no Supabase lead/customer phone match yet. Check the number, ask for their name/project, then create or update the lead record.";
}

export function buildInboundSmsSlackPayload(sms: StoredSmsMessage, channelId: string) {
  const from = sms.from_number || sms.from_number_normalized || "unknown sender";
  const to = sms.to_number || sms.to_number_normalized || "Innate SMS";
  const idLabel = sms.id || "not returned";
  const shortMessage = sms.message_body.length > 140 ? `${sms.message_body.slice(0, 137)}...` : sms.message_body;
  const contextLines = leadContextLines(sms);
  const recentLines = recentSmsLines(sms);
  const contextText = contextLines.length ? contextLines.map((line) => `• ${slackEscape(line)}`).join("\n") : "• No lead context found in Supabase yet.";
  const recentText = recentLines.length ? recentLines.map((line) => `• ${slackEscape(line)}`).join("\n") : "• No earlier SMS history found for this number.";
  const warningText = sms.enrichment_warning ? `\n*Lookup warning:* ${slackEscape(shortSlackText(sms.enrichment_warning, 220) || sms.enrichment_warning)}` : "";

  return {
    channel: channelId,
    text: `New SMS from ${smsLeadLabel(sms) || from}: ${shortMessage}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*New SMS from ${slackEscape(smsLeadLabel(sms) || from)}*\n*Phone:* ${slackEscape(from)}\n*To:* ${slackEscape(to)}\n${buildMatchLine(sms)}${warningText}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Supabase context:*\n${contextText}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Recent SMS context:*\n${recentText}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message:*\n${slackQuote(sms.message_body)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Reply in this thread to send an SMS back through 2talk. SMS ID: \`${slackEscape(idLabel)}\``,
          },
        ],
      },
    ],
    unfurl_links: false,
    unfurl_media: false,
  };
}

type SlackPostMessageResponse = {
  ok?: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

async function postSlackMessage(config: SlackPostingConfig, sms: StoredSmsMessage, fetchImpl: FetchLike): Promise<{ channelId: string; messageTs: string }> {
  const payload = buildInboundSmsSlackPayload(sms, config.channelId);
  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as SlackPostMessageResponse;
  if (!response.ok || data.ok !== true || !data.ts) {
    const reason = data.error || `HTTP ${response.status}`;
    throw new Error(`Slack chat.postMessage failed: ${reason}`);
  }

  return { channelId: data.channel || config.channelId, messageTs: data.ts };
}

async function postStartedSmsToSlackThread(input: {
  channelId: string;
  toNumber: string;
  fromNumber: string | null;
  message: string;
  storedId?: string | null;
  userId?: string | null;
  fetchImpl?: FetchLike;
}): Promise<{ channelId: string; messageTs: string }> {
  const config = configuredSlackPosting();
  if (!config) throw new Error("Slack SMS inbox not configured");
  if (config.channelId !== input.channelId) throw new Error("Slack SMS command used outside configured SMS channel");
  const fetchImpl = input.fetchImpl || fetch;
  const toLabel = formatSmsDisplayNumber(input.toNumber);
  const fromLabel = input.fromNumber ? formatSmsDisplayNumber(input.fromNumber) : "Innate SMS";
  const payload = {
    channel: input.channelId,
    text: `SMS sent to ${toLabel}: ${input.message.length > 120 ? `${input.message.slice(0, 117)}...` : input.message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*SMS sent to ${slackEscape(toLabel)}*\n*From:* ${slackEscape(fromLabel)}${input.userId ? `\n*Sent by:* <@${slackEscape(input.userId)}>` : ""}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message:*\n${slackQuote(input.message)}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Reply in this thread to continue texting this number through 2talk. SMS ID: \`${slackEscape(input.storedId || "not returned")}\``,
          },
        ],
      },
    ],
    unfurl_links: false,
    unfurl_media: false,
  };

  const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as SlackPostMessageResponse;
  if (!response.ok || data.ok !== true || !data.ts) {
    const reason = data.error || `HTTP ${response.status}`;
    throw new Error(`Slack chat.postMessage failed: ${reason}`);
  }
  return { channelId: data.channel || input.channelId, messageTs: data.ts };
}

export async function postInboundSmsToSlackThread(
  sms: StoredSmsMessage,
  options: { fetchImpl?: FetchLike } = {}
): Promise<SlackInboundBridgeResult> {
  const config = configuredSlackPosting();
  const missing = [
    trimEnv(process.env.SMS_SLACK_BOT_TOKEN) || trimEnv(process.env.SLACK_BOT_TOKEN) ? null : "SMS_SLACK_BOT_TOKEN or SLACK_BOT_TOKEN",
    trimEnv(process.env.SMS_SLACK_CHANNEL_ID) ? null : "SMS_SLACK_CHANNEL_ID",
  ].filter(Boolean) as string[];

  if (!config) {
    return {
      status: "not_configured",
      warning: `Slack SMS inbox not configured (${missing.join(", ")})`,
      missing,
    };
  }

  let enrichedSms = sms;
  try {
    enrichedSms = await enrichInboundSmsContext(sms);
  } catch (err) {
    enrichedSms = {
      ...sms,
      enrichment_warning: err instanceof Error ? err.message : "SMS context enrichment failed",
    };
  }

  let posted: { channelId: string; messageTs: string };
  try {
    posted = await postSlackMessage(config, enrichedSms, options.fetchImpl || fetch);
  } catch (err) {
    return {
      status: "post_failed",
      warning: err instanceof Error ? err.message : "Slack post failed after SMS storage",
    };
  }

  try {
    const mapping = await upsertSmsSlackThread({
      inbound_sms_id: enrichedSms.id || null,
      lead_id: enrichedSms.lead_id || null,
      slack_channel_id: posted.channelId,
      slack_message_ts: posted.messageTs,
      slack_thread_ts: posted.messageTs,
      customer_number: enrichedSms.from_number || null,
      customer_number_normalized: enrichedSms.from_number_normalized || "",
      service_number: enrichedSms.to_number || null,
      service_number_normalized: enrichedSms.to_number_normalized || null,
      status: "active",
      raw_payload: {
        provider: sms.provider,
        provider_message_id: sms.provider_message_id || null,
      },
    });
    return { status: "posted", channelId: posted.channelId, messageTs: posted.messageTs, mappingId: mapping.id || null };
  } catch (err) {
    return {
      status: "mapping_failed",
      channelId: posted.channelId,
      messageTs: posted.messageTs,
      warning: err instanceof Error ? err.message : "Slack SMS thread mapping failed",
    };
  }
}

function safeEqualHex(leftHex: string, rightHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(leftHex) || !/^[a-f0-9]+$/i.test(rightHex)) return false;
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySlackRequestSignature(input: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret?: string | null;
  nowMs?: number;
}): SlackSignatureVerification {
  const signingSecret = trimEnv(input.signingSecret || undefined);
  if (!signingSecret) {
    return { ok: false, status: 503, error: "Slack signing secret is not configured" };
  }

  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, status: 401, error: "Invalid Slack request timestamp" };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > 60 * 5) {
    return { ok: false, status: 401, error: "Stale Slack request timestamp" };
  }

  const received = input.signature || "";
  if (!received.startsWith("v0=")) {
    return { ok: false, status: 401, error: "Invalid Slack signature version" };
  }

  const base = `v0:${input.timestamp}:${input.rawBody}`;
  const expected = createHmac("sha256", signingSecret).update(base).digest("hex");
  if (!safeEqualHex(received.slice(3), expected)) {
    return { ok: false, status: 401, error: "Invalid Slack signature" };
  }

  return { ok: true };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function classifySlackReplyEvent(event: unknown, expectedChannelId: string | null | undefined): SlackReplyDecision {
  if (!expectedChannelId) return { shouldProcess: false, reason: "sms_slack_channel_not_configured" };
  if (!event || typeof event !== "object") return { shouldProcess: false, reason: "missing_event" };

  const message = event as SlackMessageEvent;
  if (message.type !== "message") return { shouldProcess: false, reason: "not_message_event" };
  if (message.channel !== expectedChannelId) return { shouldProcess: false, reason: "wrong_channel" };
  if (message.bot_id || message.subtype) return { shouldProcess: false, reason: "bot_or_message_subtype" };

  const threadTs = stringValue(message.thread_ts);
  const messageTs = stringValue(message.ts);
  if (!threadTs || !messageTs || threadTs === messageTs) {
    return { shouldProcess: false, reason: "not_thread_reply" };
  }

  const userId = stringValue(message.user);
  if (!userId) return { shouldProcess: false, reason: "missing_user" };

  const text = stringValue(message.text);
  if (!text) return { shouldProcess: false, reason: "empty_message" };

  return { shouldProcess: true, channelId: message.channel, threadTs, messageTs, userId, text };
}

export function slackTextToSmsBody(text: string): string {
  return text
    .replace(/<mailto:([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:\/\/[^>|]+)>/g, "$1")
    .replace(/<@[A-Z0-9]+>/g, "")
    .replace(/<!channel>|<!here>|<!everyone>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .trim();
}

function slackRawPayload(body: SlackEventsRequestBody, reply: Extract<SlackReplyDecision, { shouldProcess: true }>) {
  return {
    slack_event_id: body.event_id || null,
    slack_team_id: body.team_id || null,
    slack_event_time: body.event_time || null,
    slack_channel_id: reply.channelId,
    slack_thread_ts: reply.threadTs,
    slack_message_ts: reply.messageTs,
    slack_user_id: reply.userId,
  };
}

function outboundFromNumber(mapping: SmsSlackThread): string | null {
  return mapping.service_number_normalized || mapping.service_number || trimEnv(process.env.TWOTALK_SMS_FROM_NUMBER);
}

export async function processSlackReplyEvent(body: SlackEventsRequestBody): Promise<SlackReplyProcessingResult> {
  const decision = classifySlackReplyEvent(body.event, configuredSlackChannelId());
  if (!decision.shouldProcess) return { ok: true, action: "ignored", reason: decision.reason };

  let mapping: SmsSlackThread | null;
  try {
    mapping = await findSmsSlackThread(decision.channelId, decision.threadTs);
  } catch (err) {
    return {
      ok: false,
      action: "mapping_lookup_failed",
      error: err instanceof Error ? err.message : "Slack thread mapping lookup failed",
    };
  }

  if (!mapping) return { ok: true, action: "ignored", reason: "no_sms_thread_mapping" };

  const message = slackTextToSmsBody(decision.text);
  if (!message) return { ok: true, action: "ignored", reason: "empty_sms_body_after_slack_cleanup" };

  const baseRawPayload = slackRawPayload(body, decision);
  const fromNumber = outboundFromNumber(mapping);
  const toNumber = mapping.customer_number_normalized || mapping.customer_number;
  if (!toNumber) return { ok: true, action: "ignored", reason: "mapping_missing_customer_number" };

  if (!smsSendingAvailable()) {
    const stored = await storeOutboundSms({
      leadId: mapping.lead_id || null,
      fromNumber,
      toNumber,
      message,
      status: "not_sent_outbound_disabled",
      rawPayload: baseRawPayload,
      error: "2talk SMS sending is disabled or not configured",
    }).catch(() => null);
    return { ok: true, action: "outbound_disabled", storedId: stored?.id || null };
  }

  try {
    const sendResult = await sendApprovedTwoTalkSms({
      to: toNumber,
      from: fromNumber || undefined,
      message,
    });
    const stored = await storeOutboundSms({
      leadId: mapping.lead_id || null,
      fromNumber,
      toNumber,
      message,
      status: "sent",
      sentAt: new Date().toISOString(),
      rawPayload: {
        ...baseRawPayload,
        twotalk_http_status: sendResult.status,
      },
    });
    if (stored.id) {
      await upsertSmsSlackThread({ ...mapping, last_outbound_sms_id: stored.id, status: "active" }).catch(() => null);
    }
    return { ok: true, action: "sent", storedId: stored.id || null };
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "2talk SMS send failed";
    await storeOutboundSms({
      leadId: mapping.lead_id || null,
      fromNumber,
      toNumber,
      message,
      status: "failed",
      rawPayload: baseRawPayload,
      error: messageText,
    }).catch(() => null);
    return { ok: false, action: "send_failed", error: messageText };
  }
}
export async function processSlackSmsCommand(
  input: SlackSmsCommandInput,
  options: { fetchImpl?: FetchLike } = {}
): Promise<SlackSmsCommandResult> {
  const expectedChannelId = configuredSlackChannelId();
  if (!expectedChannelId || input.channelId !== expectedChannelId) {
    return { ok: false, action: "wrong_channel", error: "Use /sms only in the configured SMS Slack channel." };
  }

  const allowedUsers = configuredAllowedSmsUsers();
  if (allowedUsers && (!input.userId || !allowedUsers.has(input.userId))) {
    return { ok: false, action: "unauthorized_user", error: "This Slack user is not approved to send SMS." };
  }

  const parsed = parseSlackSmsCommandText(input.text);
  if (!parsed) {
    return {
      ok: false,
      action: "invalid_command",
      error: "Use: /sms 0271234567 message text",
    };
  }

  const fromNumber = trimEnv(process.env.TWOTALK_SMS_FROM_NUMBER) || "642825610137";
  const rawPayload = {
    slack_command: input.command || "/sms",
    slack_channel_id: input.channelId,
    slack_user_id: input.userId || null,
    slack_response_url_present: Boolean(input.responseUrl),
    started_from_slack_command: true,
  };

  if (!smsSendingAvailable()) {
    const stored = await storeOutboundSms({
      fromNumber,
      toNumber: parsed.toNumber,
      message: parsed.message,
      status: "not_sent_outbound_disabled",
      rawPayload,
      error: "2talk SMS sending is disabled or not configured",
    }).catch(() => null);
    return { ok: true, action: "outbound_disabled", storedId: stored?.id || null, toNumber: parsed.toNumber };
  }

  let sendResult: { status: number };
  try {
    sendResult = await sendApprovedTwoTalkSms({
      to: parsed.toNumber,
      from: fromNumber,
      message: parsed.message,
    });
  } catch (err) {
    const messageText = err instanceof Error ? err.message : "2talk SMS send failed";
    await storeOutboundSms({
      fromNumber,
      toNumber: parsed.toNumber,
      message: parsed.message,
      status: "failed",
      rawPayload,
      error: messageText,
    }).catch(() => null);
    return { ok: false, action: "send_failed", error: messageText };
  }

  let stored: StoredSmsMessage;
  try {
    stored = await storeOutboundSms({
      fromNumber,
      toNumber: parsed.toNumber,
      message: parsed.message,
      status: "sent",
      sentAt: new Date().toISOString(),
      rawPayload: { ...rawPayload, twotalk_http_status: sendResult.status },
    });
  } catch (err) {
    return { ok: false, action: "store_failed", error: err instanceof Error ? err.message : "Outbound SMS store failed" };
  }

  let posted: { channelId: string; messageTs: string };
  try {
    posted = await postStartedSmsToSlackThread({
      channelId: expectedChannelId,
      toNumber: parsed.toNumber,
      fromNumber,
      message: parsed.message,
      storedId: stored.id || null,
      userId: input.userId || null,
      fetchImpl: options.fetchImpl,
    });
  } catch (err) {
    return { ok: false, action: "slack_post_failed", error: err instanceof Error ? err.message : "Slack thread post failed after SMS send" };
  }

  await upsertSmsSlackThread({
    last_outbound_sms_id: stored.id || null,
    lead_id: stored.lead_id || null,
    slack_channel_id: posted.channelId,
    slack_message_ts: posted.messageTs,
    slack_thread_ts: posted.messageTs,
    customer_number: parsed.toNumber,
    customer_number_normalized: parsed.toNumber,
    service_number: fromNumber,
    service_number_normalized: normalizePhoneNumber(fromNumber),
    status: "active",
    raw_payload: rawPayload,
  }).catch(() => null);

  return { ok: true, action: "sent", storedId: stored.id || null, threadTs: posted.messageTs, toNumber: parsed.toNumber };
}

