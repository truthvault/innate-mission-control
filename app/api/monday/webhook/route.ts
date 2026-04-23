/**
 * Monday.com webhook receiver.
 *
 * Contract:
 *   - If body contains `{ challenge: "<value>" }`, echo `{ challenge: "<value>" }` back with 200.
 *     This is Monday's one-time URL verification handshake.
 *   - Otherwise verify the HS256 JWT in the `authorization` header against
 *     MONDAY_WEBHOOK_SECRET, log the event, invalidate the Orders cache tag,
 *     and return 200 quickly.
 *
 * No Monday API calls are made from inside this handler (< 100ms target).
 * The next user request triggers the actual refetch via the cached path.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ORDERS_CACHE_TAG } from "@/lib/monday/fetch-orders";
import { PLAN_CACHE_TAG } from "@/lib/monday/fetch-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function base64UrlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  return Buffer.from(pad ? padded + "=".repeat(4 - pad) : padded, "base64");
}

function verifyJwtHS256(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = createHmac("sha256", secret).update(signingInput).digest();
  let received: Buffer;
  try {
    received = base64UrlDecode(signatureB64);
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

type MondayWebhookBody = {
  challenge?: string;
  event?: {
    type?: string;
    boardId?: number;
    pulseId?: number;
    columnId?: string;
    eventId?: string;
  };
};

export async function POST(request: Request) {
  const started = Date.now();

  let body: MondayWebhookBody;
  try {
    body = (await request.json()) as MondayWebhookBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  // 1. Challenge handshake — echo and return immediately. No verification.
  if (typeof body.challenge === "string") {
    console.log(`[monday-webhook] challenge received`);
    return Response.json({ challenge: body.challenge });
  }

  // 2. Verify signature (JWT in authorization header) if secret is configured.
  const secret = process.env.MONDAY_WEBHOOK_SECRET;
  if (secret) {
    const authz = request.headers.get("authorization");
    if (!authz) {
      console.log(`[monday-webhook] reject: no authorization header`);
      return Response.json({ ok: false, error: "Missing authorization" }, { status: 401 });
    }
    if (!verifyJwtHS256(authz, secret)) {
      console.log(`[monday-webhook] reject: signature verification failed`);
      return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.log(
      `[monday-webhook] WARNING: MONDAY_WEBHOOK_SECRET unset, skipping signature verification`
    );
  }

  // 3. Log + invalidate the matching board's cache. No Monday API calls here.
  const event = body.event;
  const boardId = event?.boardId ? String(event.boardId) : null;
  const ordersBoardId = process.env.MONDAY_ORDERS_BOARD_ID ?? null;
  const planBoardId = process.env.MONDAY_PRODUCTION_BOARD_ID ?? null;

  console.log(
    `[monday-webhook] event type=${event?.type} board=${boardId} pulse=${event?.pulseId} column=${event?.columnId} id=${event?.eventId}`
  );

  const invalidated: string[] = [];
  // Match the event's board id. If unknown (no boardId in payload), invalidate both
  // to be safe — cost is trivial and accuracy matters more.
  if (!boardId || boardId === ordersBoardId) {
    revalidateTag(ORDERS_CACHE_TAG, "max");
    revalidatePath("/production");
    invalidated.push(ORDERS_CACHE_TAG, "/production");
  }
  if (!boardId || boardId === planBoardId) {
    revalidateTag(PLAN_CACHE_TAG, "max");
    revalidatePath("/production/plan");
    invalidated.push(PLAN_CACHE_TAG, "/production/plan");
  }

  return Response.json({
    ok: true,
    invalidated,
    elapsedMs: Date.now() - started,
  });
}
