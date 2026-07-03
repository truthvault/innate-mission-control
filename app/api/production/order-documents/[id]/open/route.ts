import { NextRequest, NextResponse } from "next/server";
import { signedOrderDocumentUrl } from "@/lib/production/order-customer-mirror";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
  try {
    const signed = await signedOrderDocumentUrl(id);
    if (!signed) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.redirect(signed.url, 302);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Document unavailable" }, { status: 500 });
  }
}
