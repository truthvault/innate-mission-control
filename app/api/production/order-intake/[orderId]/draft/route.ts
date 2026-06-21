import { NextRequest, NextResponse } from "next/server";
import { saveOrderIntakeDraft } from "@/lib/production/order-intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Order intake draft save failed";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { orderId } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const review = await saveOrderIntakeDraft(orderId, body.tasks);
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}
