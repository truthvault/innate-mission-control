import { NextRequest, NextResponse } from "next/server";
import { getXeroOrganisation, getXeroReadiness, listXeroInvoiceSummaries } from "@/lib/xero/read-only";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: string | null, max = 80) {
  return value && value.trim() ? value.trim().slice(0, max) : null;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Xero proof failed";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [REDACTED]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[REDACTED]");
}

export async function GET(request: NextRequest) {
  const invoiceNumber = clean(request.nextUrl.searchParams.get("invoiceNumber"));
  const search = clean(request.nextUrl.searchParams.get("search"));
  const includeLineItems = request.nextUrl.searchParams.get("includeLineItems") === "1";

  try {
    const readiness = await getXeroReadiness();
    if (!readiness.configured) return NextResponse.json({ ok: false, mode: "read-only", readiness }, { status: 503 });
    const organisation = await getXeroOrganisation();
    const invoiceResult = invoiceNumber || search ? await listXeroInvoiceSummaries({ invoiceNumber, search, includeLineItems }) : null;
    return NextResponse.json({
      ok: true,
      mode: "read-only",
      readiness,
      organisation,
      query: { invoiceNumber, search, includeLineItems },
      invoiceCount: invoiceResult?.invoices.length ?? null,
      invoices: invoiceResult?.invoices ?? [],
    });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "read-only", error: safeError(error) }, { status: 500 });
  }
}
