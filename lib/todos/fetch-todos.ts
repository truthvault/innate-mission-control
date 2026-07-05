// Guido's Innate to-do list, mirrored from the Hermes Mail Desk into the
// action_items table. Read-only server fetch, same pattern as fetch-leads.ts.

export type TodoBucket = "today" | "waiting" | "explore" | "other";

export type Todo = {
  id: string;
  action: string; // plain-english next step (what to DO)
  context?: string; // background
  owner?: string;
  urgency: "now" | "today" | "soon" | "waiting" | "approve" | "call";
  timeEstimate: string; // "2 min" | "~15 min" | "Project"
  size: "quick" | "medium" | "big";
  isP1: boolean;
};

export type TodosResult = {
  top: Todo[]; // P1 priorities across every bucket — the real focus list
  today: Todo[];
  waiting: Todo[];
  someday: Todo[];
  total: number;
  error?: string;
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function timeFor(size: string): string {
  return size === "quick" ? "2 min" : size === "big" ? "Project" : "~15 min";
}

export async function listTodos(): Promise<TodosResult> {
  const empty: TodosResult = { top: [], today: [], waiting: [], someday: [], total: 0 };
  const supabase = supabaseConfig();
  if (!supabase) return { ...empty, error: "Supabase not configured" };

  const params = new URLSearchParams({
    select: "id,title,detail,bucket,status,priority,owner,metadata",
    "metadata->>source": "eq.mail_desk",
    status: "neq.archived",
    order: "priority.desc,updated_at.desc",
  });

  try {
    const response = await fetch(`${supabase.url}/rest/v1/action_items?${params}`, {
      headers: { apikey: supabase.serviceKey, Authorization: `Bearer ${supabase.serviceKey}` },
      cache: "no-store",
    });
    if (!response.ok) return { ...empty, error: `Supabase ${response.status}` };
    const rows = (await response.json()) as Record<string, unknown>[];

    const todos: Todo[] = rows.map((r) => {
      const meta = (r.metadata as Record<string, unknown>) || {};
      const bucket = (str(r.bucket) as TodoBucket) || "other";
      const state = str(meta.mail_desk_state) || "";
      const size = (str(meta.size) as Todo["size"]) || "medium";
      const isP1 = str(r.priority) === "urgent";
      let urgency: Todo["urgency"];
      if (state === "drafted") urgency = "approve";
      else if (state === "call_not_email") urgency = "call";
      else if (isP1) urgency = "now";
      else if (bucket === "waiting") urgency = "waiting";
      else if (bucket === "today") urgency = "today";
      else urgency = "soon";
      return {
        id: String(r.id),
        action: str(r.title) || "(no action)",
        context: str(r.detail),
        owner: str(r.owner),
        urgency,
        timeEstimate: timeFor(size),
        size,
        isP1,
      };
    });

    return {
      top: todos.filter((t) => t.isP1),
      today: todos.filter((t) => !t.isP1 && (t.urgency === "today" || t.urgency === "approve" || t.urgency === "call")),
      waiting: todos.filter((t) => !t.isP1 && t.urgency === "waiting"),
      someday: todos.filter((t) => t.urgency === "soon"),
      total: todos.length,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
