import type { SlackInboundBridgeResult } from "./slack-bridge";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type SmsDeepContextTriggerResult =
  | { status: "not_configured" }
  | { status: "skipped"; reason: string }
  | { status: "triggered"; httpStatus: number }
  | { status: "failed"; warning: string };

function trimEnv(value: string | undefined): string | null {
  const text = value?.trim();
  return text || null;
}

function configuredTrigger(): { url: string; secret: string } | null {
  const url = trimEnv(process.env.SMS_CONTEXT_TRIGGER_URL);
  const secret = trimEnv(process.env.SMS_CONTEXT_TRIGGER_SECRET);
  if (!url || !secret) return null;
  return { url, secret };
}

export async function triggerSmsDeepContext(input: {
  smsId?: string | null;
  slack: SlackInboundBridgeResult;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<SmsDeepContextTriggerResult> {
  const config = configuredTrigger();
  if (!config) return { status: "not_configured" };
  if (!input.smsId) return { status: "skipped", reason: "missing_sms_id" };
  if (input.slack.status !== "posted") return { status: "skipped", reason: `slack_${input.slack.status}` };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 1500);
  try {
    const response = await (input.fetchImpl || fetch)(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-innate-sms-context-trigger-secret": config.secret,
      },
      body: JSON.stringify({
        sms_id: input.smsId,
        slack: {
          status: input.slack.status,
          channel_id: input.slack.channelId,
          message_ts: input.slack.messageTs,
          mapping_id: input.slack.mappingId || null,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return { status: "failed", warning: `SMS context trigger HTTP ${response.status}` };
    return { status: "triggered", httpStatus: response.status };
  } catch (err) {
    return { status: "failed", warning: err instanceof Error ? err.message : "SMS context trigger failed" };
  } finally {
    clearTimeout(timeout);
  }
}
