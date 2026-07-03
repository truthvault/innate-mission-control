import { NextRequest, NextResponse } from "next/server";
import { createTask, moveTask, setTaskDone } from "@/lib/workshop/store";

// Auth: this route is inside the proxy cookie gate (not in PUBLIC_PREFIXES).

const PEOPLE = new Set(["Nick", "Dylan", "Guido"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const taskId = typeof body.taskId === "string" ? body.taskId : null;
  if (!taskId) return NextResponse.json({ error: "Missing taskId." }, { status: 400 });

  try {
    if (typeof body.done === "boolean") {
      const person = typeof body.person === "string" && PEOPLE.has(body.person) ? body.person : "Nick";
      const task = await setTaskDone(taskId, body.done, person);
      return NextResponse.json({ task });
    }
    if (typeof body.scheduledDate === "string" && ISO_DATE.test(body.scheduledDate)) {
      const owner = typeof body.owner === "string" && PEOPLE.has(body.owner) ? body.owner : undefined;
      const task = await moveTask(taskId, body.scheduledDate, owner);
      return NextResponse.json({ task });
    }
    return NextResponse.json({ error: "Nothing to update — send done:boolean or scheduledDate." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Update failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const owner = typeof body.owner === "string" && (body.owner === "Nick" || body.owner === "Dylan") ? body.owner : null;
  const scheduledDate = typeof body.scheduledDate === "string" && ISO_DATE.test(body.scheduledDate) ? body.scheduledDate : null;
  if (!title || !owner || !scheduledDate) {
    return NextResponse.json({ error: "title, owner (Nick|Dylan) and scheduledDate (YYYY-MM-DD) are required." }, { status: 400 });
  }
  try {
    const task = await createTask({
      title,
      owner,
      scheduledDate,
      orderId: typeof body.orderId === "string" ? body.orderId : null,
      estimatedHours: typeof body.estimatedHours === "number" ? body.estimatedHours : null,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed." }, { status: 500 });
  }
}
