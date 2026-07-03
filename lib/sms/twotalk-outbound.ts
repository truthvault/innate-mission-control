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
  const defaultFrom = process.env.TWOTALK_SMS_FROM_NUMBER || "642825610137";
  if (!gatewayUrl || !apiToken) return null;
  return { gatewayUrl, apiToken, defaultFrom };
}

export function smsSendingAvailable(): boolean {
  return Boolean(twotalkSendConfig());
}

function formatTwoTalkCountryNumber(value: string): string {
  return value.replace(/^\+/, "");
}

export async function sendApprovedTwoTalkSms(input: TwoTalkOutboundSms) {
  const config = twotalkSendConfig();
  if (!config) throw new Error("2talk SMS sending is disabled or not configured");

  const to = normalizePhoneNumber(input.to);
  if (!to) throw new Error("SMS recipient number is invalid");

  const from = normalizePhoneNumber(input.from || config.defaultFrom);
  if (!from) throw new Error("SMS sender number is invalid");

  const message = input.message.trim();
  if (!message) throw new Error("SMS message is required");
  if (message.length > 918) throw new Error("SMS message is too long for safe multi-part sending");

  // 2talk Business Messaging / 3CX examples use NZ country format without a leading
  // plus, e.g. 642825600000. Store normalized E.164 internally, but send country
  // digits to 2talk to avoid provider-side blocking on sender/recipient format.
  const response = await fetch(config.gatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: formatTwoTalkCountryNumber(from),
      to: formatTwoTalkCountryNumber(to),
      text: message,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`2talk SMS send failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  return { ok: true, status: response.status, body: text.slice(0, 1000) };
}
