import { after, NextRequest, NextResponse } from "next/server";
import {
  configuredSlackChannelId,
  configuredSlackSigningSecret,
  processSlackReplyEvent,
  slackPostingConfigured,
  verifySlackRequestSignature,
  type SlackEventsRequestBody,
} from "@/lib/sms/slack-bridge";
import { smsSendingAvailable } from "@/lib/sms/twotalk-outbound";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function backgroundSlackReplyProcessing(body: SlackEventsRequestBody) {
  after(async () => {
    const result = await processSlackReplyEvent(body).catch((err) => ({
      ok: false as const,
      action: "send_failed" as const,
      error: err instanceof Error ? err.message : "Slack SMS reply processing failed",
    }));

    if (result.ok === false) {
      console.error(`[sms-slack-events] ${result.action}: ${result.error}`);
    }
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const verification = verifySlackRequestSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret: configuredSlackSigningSecret(),
  });
  if (!verification.ok) return jsonError(verification.error, verification.status);

  let body: SlackEventsRequestBody;
  try {
    body = JSON.parse(rawBody) as SlackEventsRequestBody;
  } catch {
    return jsonError("Invalid Slack event JSON", 400);
  }

  if (body.type === "url_verification") {
    if (typeof body.challenge !== "string") return jsonError("Invalid Slack challenge", 400);
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === "event_callback") {
    backgroundSlackReplyProcessing(body);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Slack SMS reply events",
    configured: {
      signingSecret: Boolean(configuredSlackSigningSecret()),
      channelId: Boolean(configuredSlackChannelId()),
      posting: slackPostingConfigured(),
      outboundSms: smsSendingAvailable(),
    },
  });
}
