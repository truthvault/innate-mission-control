import { NextRequest, NextResponse } from "next/server";
import { isMissingBlobToken, readEncryptedBlob, writeEncryptedBlob } from "@/lib/tuesday/encrypted-blob-store";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";

type PlanTaskLinksState = {
  links: Record<string, number>;
  updatedAt: string;
};

const PATH = "production-plan-task-links/current.json";

function defaultState(): PlanTaskLinksState {
  return { links: {}, updatedAt: new Date().toISOString() };
}

async function readState() {
  const state = await readEncryptedBlob<PlanTaskLinksState>(PATH, defaultState());
  return { ...defaultState(), ...state, links: state.links ?? {} };
}

export async function GET() {
  try {
    const state = await readState();
    return NextResponse.json({ state });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ state: defaultState(), disabledReason: "Plan task link storage is not connected yet." });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task links unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { taskId?: string; legacyTaskId?: string; orderId?: number | null } | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  const legacyTaskId = typeof body?.legacyTaskId === "string" ? body.legacyTaskId.trim() : "";
  const orderId = typeof body?.orderId === "number" && Number.isFinite(body.orderId) ? body.orderId : null;
  if (!taskId) return NextResponse.json({ error: "Missing taskId" }, { status: 400 });

  try {
    if (orderId) {
      const orders = await getOrdersWithFallback();
      if (!orders.items.some((order) => order.id === orderId)) {
        return NextResponse.json({ error: "Order is not in Tuesday active order data" }, { status: 404 });
      }
    }

    const current = await readState();
    const links = { ...current.links };
    if (orderId) {
      links[taskId] = orderId;
      if (legacyTaskId && legacyTaskId !== taskId) delete links[legacyTaskId];
    } else {
      delete links[taskId];
      if (legacyTaskId) delete links[legacyTaskId];
    }
    const state = { links, updatedAt: new Date().toISOString() };
    await writeEncryptedBlob(PATH, state);
    return NextResponse.json({ state });
  } catch (err) {
    if (isMissingBlobToken(err)) {
      return NextResponse.json({ error: "Plan task link storage is not connected yet." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Plan task link save failed" }, { status: 500 });
  }
}
