import { NextResponse } from "next/server";
import { listOrderIntakeItems } from "@/lib/production/order-intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Order intake is unavailable";
}

export async function GET() {
  try {
    const items = await listOrderIntakeItems();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json({ ok: false, items: [], error: errorMessage(error) });
  }
}
