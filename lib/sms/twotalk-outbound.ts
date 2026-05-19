import { normalizePhoneNumber } from "./phone";

export type TwoTalkOutboundSms = {
  to: string;
  message: string;
  from?: string;
};

function twotalkSendConfig() {
  if (process.env.TWOTALK_SMS_SEND_ENABLED !== "1") return null;
  const gatewayUrl = process.env.TWOTALK_SMS_GATEWAY_URL;
  const apiToken = process.env.TWOTALK_SMS_API_TOKEN;
  const defaultFrom = process.env.TWOTALK_SMS_FROM_NUMBER || "6433275012";
  if (!gatewayUrl || !apiToken) return null;
  return { gatewayUrl, apiToken, defaultFrom };
}

export function smsSendingAvailable(): boolean {
  return Boolean(twotalkSendConfig());
}

export async function sendApprovedTwoTalkSms(input: TwoTalkOutboundSms) {
  const config = twotalkSendConfig();
  if (!config) throw new Error("2talk SMS sending is disabled or not configured");

  const to = normalizePhoneNumber(input.to);
  if (!to) throw new Error("SMS recipient number is invalid");

  const message = input.message.trim();
  if (!message) throw new Error("SMS message is required");
  if (message.length > 918) throw new Error("SMS message is too long for safe multi-part sending");

  // Intentionally generic: 2talk's portal exposes the final gateway URL/token after
  // Business Messaging approval. Keep this utility env-gated and do not expose it
  // through UI until Guido explicitly approves outbound sending.
  const response = await fetch(config.gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      from: input.from || config.defaultFrom,
      message,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`2talk SMS send failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  return { ok: true, status: response.status, body: text.slice(0, 1000) };
}
