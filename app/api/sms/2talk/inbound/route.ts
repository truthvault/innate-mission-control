import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
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

export async function POST(request: NextRequest) {
  const auth = verifyWebhookSecret(request);
  if (auth.ok === false) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const payload = await parseSmsWebhookPayload(request);
    const normalized = normalizeInbound2talkSms(payload);
    const stored = await storeInboundSms(normalized);

    return NextResponse.json({
      ok: true,
      id: stored.id,
      leadId: stored.lead_id || null,
      status: stored.status || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "2talk SMS webhook failed";
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
