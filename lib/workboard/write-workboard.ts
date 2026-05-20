import type { WorkPriority, WorkTask, WorkTaskStatus } from "./types";
import { rowFromWorkTask, supabaseConfig } from "./fetch-workboard";

const VALID_TASK_STATUSES = new Set<WorkTaskStatus>(["inbox", "next", "in_progress", "waiting", "done", "parked", "cancelled"]);
const VALID_PRIORITIES = new Set<WorkPriority>(["cash", "high", "normal", "later"]);
const ALLOWED_FIELDS = new Set(["status", "priority", "owner", "project_id", "notes", "sort_order"]);

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function updateWorkTask(id: string, payload: Record<string, unknown>): Promise<WorkTask> {
  const supabase = supabaseConfig();
  if (!supabase) throw new Error("Supabase env not configured for Workboard writes");
  if (!id || typeof id !== "string") throw new Error("Work task id is required");

  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!ALLOWED_FIELDS.has(key)) throw new Error(`Unsupported Workboard task field: ${key}`);
    if (key === "status") {
      if (!VALID_TASK_STATUSES.has(value as WorkTaskStatus)) throw new Error("Invalid Workboard task status");
      update.status = value;
      update.completed_at = value === "done" ? new Date().toISOString() : null;
    } else if (key === "priority") {
      if (!VALID_PRIORITIES.has(value as WorkPriority)) throw new Error("Invalid Workboard task priority");
      update.priority = value;
    } else if (key === "sort_order") {
      const sortOrder = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(sortOrder)) throw new Error("Invalid Workboard task sort order");
      update.sort_order = sortOrder;
    } else if (key === "project_id") {
      update.project_id = cleanString(value);
    } else if (key === "owner" || key === "notes") {
      update[key] = cleanString(value);
    }
  }

  if (!Object.keys(update).length) throw new Error("No supported Workboard task fields provided");
  update.updated_at = new Date().toISOString();

  const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
  const response = await fetch(`${supabase.url}/rest/v1/work_tasks?${params}`, {
    method: "PATCH",
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(update),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 || /Could not find|schema cache|relation/i.test(text)) {
      throw new Error("Workboard schema has not been applied to Supabase yet");
    }
    throw new Error(`Supabase Workboard update failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }

  const rows = (await response.json()) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) throw new Error("Work task not found");
  return rowFromWorkTask(row);
}
