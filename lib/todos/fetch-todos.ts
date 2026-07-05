// Guido's Innate to-do list, mirrored from the Hermes Mail Desk into the
// action_items table. Read-only server fetch, same pattern as fetch-leads.ts.

export type TodoBucket = "today" | "waiting" | "explore" | "other";

export type Todo = {
  id: string;
  title: string;
  detail?: string;
  bucket: TodoBucket;
  priority: string;
  owner?: string;
  dueDate?: string;
};

export type TodosResult = {
  top: Todo[]; // P1 priorities (urgent) across every bucket — the real focus list
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

export async function listTodos(): Promise<TodosResult> {
  const empty: TodosResult = { top: [], today: [], waiting: [], someday: [], total: 0 };
  const supabase = supabaseConfig();
  if (!supabase) return { ...empty, error: "Supabase not configured" };

  const params = new URLSearchParams({
    select: "id,title,detail,bucket,status,priority,owner,due_date",
    "metadata->>source": "eq.mail_desk",
    status: "neq.archived",
    order: "priority.desc,updated_at.desc",
  });

  try {
    const response = await fetch(`${supabase.url}/rest/v1/action_items?${params}`, {
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return { ...empty, error: `Supabase ${response.status}` };
    const rows = (await response.json()) as Record<string, unknown>[];

    const todos: Todo[] = rows.map((r) => ({
      id: String(r.id),
      title: str(r.title) || "(untitled)",
      detail: str(r.detail),
      bucket: (str(r.bucket) as TodoBucket) || "other",
      priority: str(r.priority) || "normal",
      owner: str(r.owner),
      dueDate: str(r.due_date),
    }));

    const isUrgent = (t: Todo) => t.priority === "urgent";
    return {
      // P1/urgent items lead, regardless of bucket — a blocked $10k job still shows.
      top: todos.filter(isUrgent),
      today: todos.filter((t) => t.bucket === "today" && !isUrgent(t)),
      waiting: todos.filter((t) => t.bucket === "waiting" && !isUrgent(t)),
      someday: todos.filter((t) => t.bucket === "explore" || t.bucket === "other"),
      total: todos.length,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
