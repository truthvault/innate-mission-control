import { NextRequest, NextResponse } from "next/server";
import { updateWorkTask } from "@/lib/workboard/write-workboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid work task payload" }, { status: 400 });
  try {
    const task = await updateWorkTask(id, body as Record<string, unknown>);
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Work task update failed";
    const status = /disabled/.test(message) ? 403 : /required|Invalid|must be|unsupported/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
