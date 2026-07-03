import { NextRequest, NextResponse } from "next/server";
import { getOrderCustomerMirrorBundle } from "@/lib/production/order-customer-mirror";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Customer mirror is unavailable";
}

export async function GET(request: NextRequest) {
  try {
    const bundle = await getOrderCustomerMirrorBundle({
      orderId: request.nextUrl.searchParams.get("orderId"),
      mondayOrderId: request.nextUrl.searchParams.get("mondayOrderId"),
      invoiceNumber: request.nextUrl.searchParams.get("invoiceNumber"),
    });
    return NextResponse.json({ ok: true, ...bundle });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error), mirror: null, documents: [] }, { status: 500 });
  }
}
