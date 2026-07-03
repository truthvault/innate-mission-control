import "server-only";

/**
 * Tuesday v2 workshop data layer — Supabase ONLY.
 *
 * This module is the read/write spine for the /workshop screens. It must not
 * import anything from lib/monday: the workshop core reads one database.
 */

export type WorkshopPerson = "Nick" | "Dylan";
export type WorkshopTaskStatus = "planned" | "done" | "deleted";

export type WorkshopTask = {
  id: string;
  order_id: string | null;
  source_task_id: string | null;
  title: string;
  detail: string | null;
  owner: string;
  scheduled_date: string;
  day_key: string | null;
  estimated_hours: number | null;
  sort_order: number | null;
  status: WorkshopTaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  order: WorkshopOrderRef | null;
};

export type WorkshopOrderRef = {
  id: string;
  order_code: string | null;
  customer_name: string;
  status: string;
  due_date: string | null;
};

export type WorkshopOrder = {
  id: string;
  order_code: string | null;
  customer_name: string;
  status: string;
  item_category: string | null;
  product_summary: string | null;
  due_date: string | null;
  finished_date: string | null;
  order_date: string | null;
  paid_on_date: string | null;
  total_incl_gst: number | null;
  xero_invoice_number: string | null;
  spec: Record<string, unknown> | null;
  delivery: Record<string, unknown> | string | null;
  priority: string | null;
  tasks: WorkshopTask[];
};

export const ACTIVE_ORDER_STATUSES = [
  "active",
  "in_production",
  "finished",
  "awaiting_dispatch",
  "paused",
] as const;

function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / service key).");
  return { url: url.replace(/\/$/, ""), key };
}

async function rest<T>(pathAndQuery: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

const TASK_SELECT =
  "id,order_id,source_task_id,title,detail,owner,scheduled_date,day_key,estimated_hours,sort_order,status,completed_at,completed_by,notes," +
  "order:orders(id,order_code,customer_name,status,due_date)";

/** NZ-timezone date helpers. The workshop week is Monday–Friday in Pacific/Auckland. */
export function nzToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

export function mondayOfWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function listTasksBetween(fromDate: string, toDate: string): Promise<WorkshopTask[]> {
  return rest<WorkshopTask[]>(
    `production_order_tasks?select=${encodeURIComponent(TASK_SELECT)}` +
      `&scheduled_date=gte.${fromDate}&scheduled_date=lte.${toDate}` +
      `&status=neq.deleted&order=scheduled_date.asc,sort_order.asc,created_at.asc`
  );
}

export async function listActiveOrders(): Promise<WorkshopOrder[]> {
  const select =
    "id,order_code,customer_name,status,item_category,product_summary,due_date,finished_date,order_date,paid_on_date," +
    "total_incl_gst,xero_invoice_number,spec,delivery,priority," +
    "tasks:production_order_tasks(id,title,owner,scheduled_date,day_key,status,completed_at,sort_order)";
  const orders = await rest<WorkshopOrder[]>(
    `orders?select=${encodeURIComponent(select)}` +
      `&status=in.(${ACTIVE_ORDER_STATUSES.join(",")})&archived_at=is.null` +
      `&order=due_date.asc.nullslast,order_date.asc`
  );
  for (const order of orders) {
    order.tasks = (order.tasks || [])
      .filter((t) => t.status !== "deleted")
      .sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || "") || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return orders;
}

export async function setTaskDone(taskId: string, done: boolean, person: string): Promise<WorkshopTask> {
  const patch = done
    ? { status: "done", completed_at: new Date().toISOString(), completed_by: person }
    : { status: "planned", completed_at: null, completed_by: null };
  const rows = await rest<WorkshopTask[]>(`production_order_tasks?id=eq.${encodeURIComponent(taskId)}&select=${encodeURIComponent(TASK_SELECT)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!rows?.[0]) throw new Error("Task not found.");
  return rows[0];
}

export async function moveTask(taskId: string, scheduledDate: string, owner?: string): Promise<WorkshopTask> {
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayKey = dayKeys[new Date(`${scheduledDate}T12:00:00Z`).getUTCDay()];
  const patch: Record<string, unknown> = { scheduled_date: scheduledDate, day_key: dayKey };
  if (owner) patch.owner = owner;
  const rows = await rest<WorkshopTask[]>(`production_order_tasks?id=eq.${encodeURIComponent(taskId)}&select=${encodeURIComponent(TASK_SELECT)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!rows?.[0]) throw new Error("Task not found.");
  return rows[0];
}

export async function createTask(input: {
  title: string;
  owner: WorkshopPerson;
  scheduledDate: string;
  orderId?: string | null;
  estimatedHours?: number | null;
}): Promise<WorkshopTask> {
  const dayKeys = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayKey = dayKeys[new Date(`${input.scheduledDate}T12:00:00Z`).getUTCDay()];
  const rows = await rest<WorkshopTask[]>(`production_order_tasks?select=${encodeURIComponent(TASK_SELECT)}`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 300),
      owner: input.owner,
      scheduled_date: input.scheduledDate,
      day_key: dayKey,
      order_id: input.orderId || null,
      estimated_hours: input.estimatedHours ?? null,
      status: "planned",
      notes: "Created in Tuesday workshop view.",
    }),
  });
  if (!rows?.[0]) throw new Error("Task insert returned no row.");
  return rows[0];
}
