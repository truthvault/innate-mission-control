import type { ActionItem, CallIntelligenceResult, ExtractedNugget, NuggetType, SourceCapture } from "./types";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceCaptureFromRow(record: Record<string, unknown>): SourceCapture {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "",
    sourceKey: asString(record.source_key) || "",
    sourceType: asString(record.source_type) || "call",
    sourceDate: asString(record.source_date),
    title: asString(record.title) || "Untitled capture",
    summary: asString(record.summary),
    transcriptPath: asString(record.transcript_path),
    audioPath: asString(record.audio_path),
    sourceUrl: asString(record.source_url),
    capturedBy: asString(record.captured_by) || "Hermes",
    metadata: asRecord(record.metadata),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
  };
}

function nuggetFromRow(record: Record<string, unknown>): ExtractedNugget {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "",
    sourceCaptureId: asString(record.source_capture_id) || "",
    nuggetType: (asString(record.nugget_type) || "update") as NuggetType,
    title: asString(record.title) || "Untitled nugget",
    detail: asString(record.detail),
    personOrOrg: asString(record.person_or_org),
    priority: (asString(record.priority) || "normal") as ExtractedNugget["priority"],
    status: (asString(record.status) || "captured") as ExtractedNugget["status"],
    metadata: asRecord(record.metadata),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
  };
}

function actionFromRow(record: Record<string, unknown>): ActionItem {
  const now = new Date().toISOString();
  return {
    id: asString(record.id) || "",
    sourceCaptureId: asString(record.source_capture_id),
    sourceNuggetId: asString(record.source_nugget_id),
    title: asString(record.title) || "Untitled action",
    detail: asString(record.detail),
    actionType: (asString(record.action_type) || "task") as ActionItem["actionType"],
    owner: asString(record.owner) || "Guido",
    bucket: (asString(record.bucket) || "this_week") as ActionItem["bucket"],
    status: (asString(record.status) || "open") as ActionItem["status"],
    dueDate: asString(record.due_date),
    priority: (asString(record.priority) || "normal") as ActionItem["priority"],
    metadata: asRecord(record.metadata),
    createdAt: asString(record.created_at) || now,
    updatedAt: asString(record.updated_at) || asString(record.created_at) || now,
  };
}

async function supabaseGet<T>(path: string, serviceKey: string, map: (record: Record<string, unknown>) => T, baseUrl: string): Promise<T[]> {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase call intelligence read failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  const rows = (await response.json()) as Record<string, unknown>[];
  return rows.map(map);
}

export async function listCallIntelligence(): Promise<CallIntelligenceResult> {
  const syncedAt = new Date().toISOString();
  const supabase = supabaseConfig();
  if (!supabase) {
    return { captures: [], nuggets: [], actions: [], syncedAt, source: "none", error: "Supabase env not configured for call intelligence yet" };
  }

  try {
    const [captures, actions, nuggets] = await Promise.all([
      supabaseGet(
        "source_captures?select=*&archived_at=is.null&order=source_date.desc.nullslast,created_at.desc&limit=20",
        supabase.serviceKey,
        sourceCaptureFromRow,
        supabase.url,
      ),
      supabaseGet(
        "action_items?select=*&archived_at=is.null&status=not.in.(done,archived)&order=created_at.asc&limit=80",
        supabase.serviceKey,
        actionFromRow,
        supabase.url,
      ),
      supabaseGet(
        "extracted_nuggets?select=*&status=not.eq.archived&order=created_at.asc&limit=120",
        supabase.serviceKey,
        nuggetFromRow,
        supabase.url,
      ),
    ]);
    return { captures, nuggets, actions, syncedAt, source: "supabase" };
  } catch (err) {
    return { captures: [], nuggets: [], actions: [], syncedAt, source: "supabase", error: err instanceof Error ? err.message : String(err) };
  }
}
