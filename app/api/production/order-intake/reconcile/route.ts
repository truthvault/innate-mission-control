import { NextResponse } from "next/server";
import { reconcileOrderIntake } from "@/lib/production/order-intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Order intake reconciliation failed";
}

export async function POST() {
  try {
    return NextResponse.json(await reconcileOrderIntake());
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
