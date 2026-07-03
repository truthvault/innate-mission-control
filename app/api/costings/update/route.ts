import { NextRequest, NextResponse } from "next/server";
import { updateCosting } from "@/lib/costings/update-costings";

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing costing edit payload." }, { status: 400 });

  try {
    const result = await updateCosting(body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Costing edit save failed." }, { status: 500 });
  }
}
