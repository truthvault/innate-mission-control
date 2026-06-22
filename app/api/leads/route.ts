import { NextRequest, NextResponse } from "next/server";
import { createLead } from "@/lib/leads/write-leads";
import { AUTH_COOKIE_NAME, isValidAuthCookie } from "@/lib/tuesday/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isValidAuthCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
  try {
    const lead = await createLead(body);
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lead create failed";
    const status = /disabled/.test(message) ? 403 : /required|Invalid|must be/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
