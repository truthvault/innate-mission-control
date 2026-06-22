import { NextResponse } from "next/server";
import { renderReconciliationMarkdown, runSourceOfTruthReconciliation } from "@/lib/tuesday/source-of-truth-reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Source-of-truth reconciliation failed")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [REDACTED]")
    .replace(/apikey[=:]\s*[^\s,]+/gi, "apikey=[REDACTED]")
    .replace(/service_role[^\s,]+/gi, "service_role[REDACTED]");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "markdown" ? "markdown" : "json";
  try {
    const result = await runSourceOfTruthReconciliation();
    if (format === "markdown") {
      return new NextResponse(renderReconciliationMarkdown(result), {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ ok: true, mode: "read_only_report", result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "read_only_report", error: safeError(error) }, { status: 500 });
  }
}
