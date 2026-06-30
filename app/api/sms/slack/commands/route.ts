import { NextRequest, NextResponse } from "next/server";
import {
  configuredSlackSigningSecret,
  processSlackSmsCommand,
  verifySlackRequestSignature,
} from "@/lib/sms/slack-bridge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ response_type: "ephemeral", text: error }, { status });
}

function commandResponse(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
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

  const form = new URLSearchParams(rawBody);
  const result = await processSlackSmsCommand({
    channelId: form.get("channel_id"),
    userId: form.get("user_id"),
    text: form.get("text"),
    command: form.get("command"),
    responseUrl: form.get("response_url"),
  });

  if (!result.ok) {
    return commandResponse(`SMS not sent: ${result.error}`);
  }

  if (result.action === "outbound_disabled") {
    return commandResponse(
      `SMS captured but not sent because outbound SMS is disabled. Audit row: ${result.storedId || "not returned"}`
    );
  }

  return commandResponse(
    `SMS sent and Slack thread created. Audit row: ${result.storedId || "not returned"}`
  );
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "Slack /sms command",
    usage: "/sms 0271234567 message text",
  });
}
