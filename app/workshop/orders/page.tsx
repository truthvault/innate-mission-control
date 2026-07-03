import { Chip, type ChipTone } from "@/components/mission-control-ui";
import { DT } from "@/components/mission-control-tokens";
import { listActiveOrders, nzToday, type WorkshopOrder } from "@/lib/workshop/store";
import { WorkshopShell } from "../workshop-shell";
import { TaskRow } from "../workshop-ui";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; tone: ChipTone }> = {
  in_production: { label: "In production", tone: "teal" },
  active: { label: "Active", tone: "amber" },
  finished: { label: "Finished", tone: "green" },
  awaiting_dispatch: { label: "Awaiting dispatch", tone: "green" },
  paused: { label: "Paused", tone: "grey" },
};
const STATUS_ORDER = ["in_production", "active", "finished", "awaiting_dispatch", "paused"];

function formatDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString("en-NZ", { month: "short", timeZone: "UTC" })}`;
}

function progressChips(order: WorkshopOrder) {
  const spec = order.spec || {};
  const chips: Array<{ label: string; tone: ChipTone }> = [];
  const top = spec["monday_top_panel_stage"];
  const legs = spec["monday_legs_stage"];
  if (typeof top === "string" && top !== "Done / NA") chips.push({ label: `Top: ${top}`, tone: top === "Unstarted" ? "grey" : "teal" });
  if (typeof legs === "string" && legs !== "Done / NA") chips.push({ label: `Legs: ${legs}`, tone: legs === "Unstarted" ? "grey" : "teal" });
  return chips;
}

export default async function WorkshopOrdersPage() {
  const today = nzToday();
  let orders: WorkshopOrder[] = [];
  let sourceError: string | null = null;
  try {
    orders = await listActiveOrders();
  } catch (err) {
    sourceError = err instanceof Error ? err.message : "Supabase unavailable";
  }

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    orders: orders.filter((o) => o.status === status),
  })).filter((g) => g.orders.length > 0);

  return (
    <WorkshopShell active="orders" title="Active orders" subtitle={`${orders.length} live · soonest due first · Supabase`}>
      <style>{`
        .ord-card{background:${DT.cardBg};border:1px solid rgba(0,0,0,0.08);border-radius:${DT.radius}px;padding:12px 14px;box-shadow:${DT.shadow}}
        .ord-list{display:flex;flex-direction:column;gap:10px}
        .ord-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
        .ord-tasks{display:flex;flex-direction:column;gap:6px;margin-top:10px}
        details.ord-details>summary{cursor:pointer;font-size:12px;font-weight:800;color:${DT.teal};min-height:40px;display:flex;align-items:center;list-style:none}
        details.ord-details>summary::-webkit-details-marker{display:none}
      `}</style>

      {sourceError ? (
        <div style={{ background: "rgba(154,59,47,0.08)", border: "1px solid rgba(154,59,47,0.25)", borderRadius: DT.radiusSm, padding: 14, fontWeight: 700, color: DT.clay }}>
          Supabase is unavailable — orders cannot be shown right now. {sourceError}
        </div>
      ) : orders.length === 0 ? (
        <div style={{ color: DT.textMuted, fontWeight: 700 }}>Supabase responded — there are genuinely no active orders.</div>
      ) : (
        grouped.map((group) => (
          <section key={group.status} style={{ marginBottom: 22 }}>
            <h2 style={{ fontSize: 13, fontWeight: 900, color: DT.textSecondary, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>
              {STATUS_LABELS[group.status]?.label || group.status} · {group.orders.length}
            </h2>
            <div className="ord-list">
              {group.orders.map((order) => {
                const overdue = order.due_date && order.due_date < today && !["finished", "awaiting_dispatch"].includes(order.status);
                const openTasks = order.tasks.filter((t) => t.status !== "done");
                return (
                  <article key={order.id} className="ord-card">
                    <div className="ord-head">
                      <span style={{ fontFamily: DT.serif, fontSize: 18, fontWeight: 600 }}>{order.customer_name}</span>
                      {order.order_code ? <span style={{ fontSize: 12, color: DT.textMuted, fontWeight: 800 }}>{order.order_code}</span> : null}
                      {order.item_category ? <Chip label={order.item_category} tone="grey" /> : null}
                      <Chip label={STATUS_LABELS[order.status]?.label || order.status} tone={STATUS_LABELS[order.status]?.tone || "neutral"} />
                      {progressChips(order).map((chip) => (
                        <Chip key={chip.label} label={chip.label} tone={chip.tone} />
                      ))}
                      <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, color: overdue ? DT.clay : DT.textSecondary }}>
                        {order.due_date ? `Due ${formatDate(order.due_date)}${overdue ? " — overdue" : ""}` : "No due date"}
                      </span>
                    </div>
                    {order.tasks.length > 0 ? (
                      <details className="ord-details" open={openTasks.length > 0 && openTasks.length <= 4}>
                        <summary>
                          {openTasks.length > 0
                            ? `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} · show checklist`
                            : `All ${order.tasks.length} tasks done · show checklist`}
                        </summary>
                        <div className="ord-tasks">
                          {order.tasks.map((task) => (
                            <TaskRow key={task.id} task={{ ...task, order: null }} person={task.owner || "Nick"} showOrder={false} />
                          ))}
                        </div>
                      </details>
                    ) : (
                      <div style={{ fontSize: 12, color: DT.textFaint, fontWeight: 700, marginTop: 8 }}>No workshop tasks yet — add them from the Week board.</div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </WorkshopShell>
  );
}
