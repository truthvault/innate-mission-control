import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { triggerSmsDeepContext } from "@/lib/sms/deep-context-trigger";
import { postInboundSmsToSlackThread } from "@/lib/sms/slack-bridge";
import { storeInboundSms } from "@/lib/sms/supabase-sms";
import { normalizeInbound2talkSms, parseSmsWebhookPayload } from "@/lib/sms/twotalk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function configuredWebhookSecret(): string | null {
  const secret = process.env.TWOTALK_SMS_WEBHOOK_SECRET || process.env.SMS_WEBHOOK_SECRET;
  return secret && secret.trim() ? secret.trim() : null;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestSecret(request: NextRequest): string | null {
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    request.headers.get("x-innate-sms-webhook-secret") ||
    request.headers.get("x-2talk-webhook-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    request.nextUrl.searchParams.get("token")
  );
}

function verifyWebhookSecret(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = configuredWebhookSecret();
  if (!expected) {
    return { ok: false, status: 503, error: "2talk SMS webhook secret is not configured" };
  }

  const supplied = requestSecret(request);
  if (!supplied || !safeEqual(supplied, expected)) {
    return { ok: false, status: 401, error: "Invalid 2talk SMS webhook secret" };
  }

  return { ok: true };
}

function payloadShape(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  const topLevelKeys = Object.keys(payload).sort();
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? (payload.data as Record<string, unknown>) : null;
  const dataPayload = data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload) ? (data.payload as Record<string, unknown>) : null;
  return {
    topLevelKeys,
    dataKeys: data ? Object.keys(data).sort() : undefined,
    dataPayloadKeys: dataPayload ? Object.keys(dataPayload).sort() : undefined,
  };
}

export async function POST(request: NextRequest) {
  const auth = verifyWebhookSecret(request);
  if (auth.ok === false) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await parseSmsWebhookPayload(request);
    const normalized = normalizeInbound2talkSms(payload);
    const stored = await storeInboundSms(normalized);
    const slack = await postInboundSmsToSlackThread(stored);
    const deepContext = await triggerSmsDeepContext({ smsId: stored.id || null, slack });
    if (deepContext.status === "failed") {
      console.warn("[sms-2talk-inbound] deep context trigger failed", { warning: deepContext.warning });
    }

    return NextResponse.json({
      ok: true,
      id: stored.id,
      leadId: stored.lead_id || null,
      status: stored.status || null,
      slack,
      deepContext,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "2talk SMS webhook failed";
    console.warn("[sms-2talk-inbound] rejected", {
      error: message,
      contentType: request.headers.get("content-type") || null,
      shape: payloadShape(payload),
    });
    const status = /missing|Invalid|Unsupported|Empty|normalized/.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "2talk inbound SMS webhook",
    configured: Boolean(configuredWebhookSecret()),
  });
}
