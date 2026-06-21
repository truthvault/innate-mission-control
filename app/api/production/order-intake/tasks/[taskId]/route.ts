import { NextRequest, NextResponse } from "next/server";
import { updateApprovedOrderIntakeTask } from "@/lib/production/order-intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ taskId: string }> };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Approved intake task update failed";
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { taskId } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    const task = await updateApprovedOrderIntakeTask(taskId, body);
    return NextResponse.json({ ok: true, task });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 400 });
  }
}
