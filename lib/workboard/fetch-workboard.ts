import type { WorkArea, WorkboardResult, WorkPriority, WorkProject, WorkProjectStatus, WorkSource, WorkSourceType, WorkTask, WorkTaskStatus } from "./types";

const VALID_SOURCE_TYPES = new Set<WorkSourceType>(["meeting", "voice_note", "email_thread", "manual_note", "import", "other"]);
const VALID_AREAS = new Set<WorkArea>(["leads", "website", "marketing", "commercial", "customer_journey", "production", "materials", "systems", "admin"]);
const VALID_PRIORITIES = new Set<WorkPriority>(["cash", "high", "normal", "later"]);
const VALID_PROJECT_STATUSES = new Set<WorkProjectStatus>(["active", "waiting", "parked", "done", "cancelled"]);
const VALID_TASK_STATUSES = new Set<WorkTaskStatus>(["inbox", "next", "in_progress", "waiting", "done", "parked", "cancelled"]);

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return [];
}

function asSourceType(value: unknown): WorkSourceType {
  const raw = asString(value) as WorkSourceType | undefined;
  return raw && VALID_SOURCE_TYPES.has(raw) ? raw : "other";
}

function asArea(value: unknown): WorkArea {
  const raw = asString(value) as WorkArea | undefined;
  return raw && VALID_AREAS.has(raw) ? raw : "admin";
}

function asPriority(value: unknown): WorkPriority {
  const raw = asString(value) as WorkPriority | undefined;
  return raw && VALID_PRIORITIES.has(raw) ? raw : "normal";
}

function asProjectStatus(value: unknown): WorkProjectStatus {
  const raw = asString(value) as WorkProjectStatus | undefined;
  return raw && VALID_PROJECT_STATUSES.has(raw) ? raw : "active";
}

function asTaskStatus(value: unknown): WorkTaskStatus {
  const raw = asString(value) as WorkTaskStatus | undefined;
  return raw && VALID_TASK_STATUSES.has(raw) ? raw : "inbox";
}

export function rowFromWorkSource(record: Record<string, unknown>): WorkSource {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "source",
    sourceType: asSourceType(record.source_type),
    title: asString(record.title) || "Untitled source",
    sourceDate: asString(record.source_date),
    people: asStringArray(record.people),
    summary: asString(record.summary),
    filePath: asString(record.file_path),
    transcriptPath: asString(record.transcript_path),
    externalUrl: asString(record.external_url),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
  };
}

export function rowFromWorkProject(record: Record<string, unknown>): WorkProject {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "project",
    name: asString(record.name) || "Untitled project",
    area: asArea(record.area),
    status: asProjectStatus(record.status),
    priority: asPriority(record.priority),
    owner: asString(record.owner),
    description: asString(record.description),
    sourceId: asString(record.source_id),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
    completedAt: asString(record.completed_at),
  };
}

export function rowFromWorkTask(record: Record<string, unknown>): WorkTask {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "task",
    projectId: asString(record.project_id),
    sourceId: asString(record.source_id),
    title: asString(record.title) || "Untitled task",
    description: asString(record.description),
    area: asArea(record.area),
    status: asTaskStatus(record.status),
    priority: asPriority(record.priority),
    owner: asString(record.owner),
    dueDate: asString(record.due_date),
    relatedLeadId: asString(record.related_lead_id),
    relatedOrderId: asString(record.related_order_id),
    relatedUrl: asString(record.related_url),
    notes: asString(record.notes),
    sortOrder: asNumber(record.sort_order),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
    completedAt: asString(record.completed_at),
  };
}

async function getRows(supabase: { url: string; serviceKey: string }, path: string) {
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404 || /Could not find|schema cache|relation/i.test(text)) {
      throw new Error("Workboard schema has not been applied to Supabase yet");
    }
    throw new Error(`Supabase Workboard read failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return (await response.json()) as Record<string, unknown>[];
}

export async function listWorkboard(): Promise<WorkboardResult> {
  const syncedAt = new Date().toISOString();
  const supabase = supabaseConfig();
  if (!supabase) {
    return { sources: [], projects: [], tasks: [], syncedAt, source: "none", error: "Supabase env not configured for Workboard yet" };
  }

  try {
    const sourceParams = new URLSearchParams({ select: "*", order: "source_date.desc.nullslast,created_at.desc" });
    const projectParams = new URLSearchParams({ select: "*", order: "priority.asc,created_at.asc" });
    const taskParams = new URLSearchParams({ select: "*", order: "status.asc,priority.asc,due_date.asc.nullslast,sort_order.asc,updated_at.desc" });
    const [sources, projects, tasks] = await Promise.all([
      getRows(supabase, `work_sources?${sourceParams}`),
      getRows(supabase, `work_projects?${projectParams}`),
      getRows(supabase, `work_tasks?${taskParams}`),
    ]);
    return {
      sources: sources.map(rowFromWorkSource),
      projects: projects.map(rowFromWorkProject),
      tasks: tasks.map(rowFromWorkTask),
      syncedAt,
      source: "supabase",
    };
  } catch (err) {
    return { sources: [], projects: [], tasks: [], syncedAt, source: "none", error: err instanceof Error ? err.message : String(err) };
  }
}
