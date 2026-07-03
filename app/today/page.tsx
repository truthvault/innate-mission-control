import Link from "next/link";
import type { ReactNode } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { DT } from "@/components/mission-control-ui";
import { listLeads } from "@/lib/leads/fetch-leads";
import type { Lead } from "@/lib/leads/types";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getPlanWithFallback } from "@/lib/monday/fetch-plan";
import { DAYS, PEOPLE, type PlanRow } from "@/lib/monday/production-plan-mapping";
import type { UiOrder } from "@/lib/monday/mapping";

export const dynamic = "force-dynamic";

type Tone = "green" | "amber" | "red" | "teal" | "grey";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

function money(value?: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function isClosedLead(lead: Lead) {
  return lead.status === "won" || lead.status === "lost" || lead.status === "parked";
}

function leadNeedsToday(lead: Lead) {
  if (isClosedLead(lead)) return false;
  const followUp = lead.nextFollowUpAt?.slice(0, 10);
  if (followUp && followUp <= todayKey()) return true;
  if (lead.status === "follow_up_due") return true;
  if (lead.priority === "hot" && (!lead.nextAction || lead.nextAction === "No Action")) return true;
  if (lead.status === "quoted" && (lead.estimatedValue || 0) >= 10_000) return true;
  return false;
}

function leadReason(lead: Lead) {
  const followUp = lead.nextFollowUpAt?.slice(0, 10);
  if (followUp && followUp <= todayKey()) return `Follow-up due ${dateLabel(followUp)}`;
  if (lead.status === "follow_up_due") return "Marked follow-up needed";
  if (lead.priority === "hot" && (!lead.nextAction || lead.nextAction === "No Action")) return "Hot lead missing next step";
  if (lead.status === "quoted" && (lead.estimatedValue || 0) >= 10_000) return "High-value quote to protect";
  return lead.nextAction || "Review";
}

function activeOrder(order: UiOrder) {
  return order.status !== "Finished" && order.status !== "Collected";
}

function orderRisk(order: UiOrder) {
  const due = order.shipDate?.slice(0, 10);
  if (!due) return { tone: "amber" as Tone, reason: "No due date" };
  if (due < todayKey()) return { tone: "red" as Tone, reason: `Due ${dateLabel(due)}` };
  if (order.rawMondayStatus === "Materials Ordered") return { tone: "amber" as Tone, reason: "Materials ordered" };
  if (order.paymentNextAction) return { tone: "amber" as Tone, reason: order.paymentNextAction };
  return { tone: "green" as Tone, reason: `Due ${dateLabel(due)}` };
}

function currentWeekPlanRows(rows: PlanRow[]) {
  const current = rows.find((row) => /current/i.test(row.weekGroupTitle));
  const week = current?.weekGroupId || rows[0]?.weekGroupId;
  return week ? rows.filter((row) => row.weekGroupId === week) : rows.slice(0, 8);
}

function taskCount(rows: PlanRow[]) {
  let count = 0;
  for (const row of rows) for (const day of DAYS) for (const person of PEOPLE) if (row.dayTasks[day][person]) count += 1;
  return count;
}

function StatusPill({ tone, children }: { tone: Tone; children: string }) {
  const palette: Record<Tone, { color: string; bg: string; border: string }> = {
    green: { color: "#28633c", bg: "rgba(63,111,63,0.10)", border: "rgba(63,111,63,0.22)" },
    amber: { color: "#8a5b1f", bg: "rgba(210,174,109,0.16)", border: "rgba(210,174,109,0.35)" },
    red: { color: "#8f3024", bg: "rgba(180,76,56,0.11)", border: "rgba(180,76,56,0.28)" },
    teal: { color: DT.teal, bg: DT.tealSoft, border: "rgba(12,124,122,0.24)" },
    grey: { color: DT.textMuted, bg: "rgba(0,0,0,0.035)", border: DT.border },
  };
  const p = palette[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${p.border}`, background: p.bg, color: p.color, borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 900 }}>{children}</span>;
}

function Panel({ title, subtitle, actionHref, actionLabel, children }: { title: string; subtitle?: string; actionHref?: string; actionLabel?: string; children: ReactNode }) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22, lineHeight: 1 }}>{title}</h2>
          {subtitle && <p style={{ margin: "4px 0 0", fontFamily: DT.sans, color: DT.textMuted, fontSize: 12, lineHeight: 1.35 }}>{subtitle}</p>}
        </div>
        {actionHref && <Link href={actionHref} style={{ color: DT.teal, fontFamily: DT.sans, fontWeight: 900, fontSize: 11, textDecoration: "none", whiteSpace: "nowrap" }}>{actionLabel || "Open"} ↗</Link>}
      </div>
      {children}
    </section>
  );
}

function Row({ title, meta, tone = "grey", pillLabel }: { title: string; meta: string; tone?: Tone; pillLabel?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "center", borderTop: `1px solid ${DT.border}`, paddingTop: 8 }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: "block", fontFamily: DT.sans, color: DT.textPrimary, fontSize: 13, lineHeight: 1.22, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</strong>
        <span style={{ display: "block", marginTop: 2, fontFamily: DT.sans, color: DT.textMuted, fontSize: 11, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</span>
      </div>
      <StatusPill tone={tone}>{pillLabel || (tone === "red" ? "Risk" : tone === "amber" ? "Watch" : tone === "green" ? "OK" : tone === "teal" ? "Ready" : "Open")}</StatusPill>
    </div>
  );
}

export default async function TodayPage() {
  const [leads, ordersResult, plan] = await Promise.all([
    listLeads(200),
    getOrdersWithFallback(),
    getPlanWithFallback(),
  ]);
  const leadActions = leads.rows.filter(leadNeedsToday).sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0)).slice(0, 2);
  const activeOrders = ordersResult.items.filter(activeOrder);
  const riskyOrders = activeOrders
    .map((order) => ({ order, risk: orderRisk(order) }))
    .filter(({ risk }) => risk.tone !== "green")
    .slice(0, 3);
  const weekRows = currentWeekPlanRows(plan.rows);
  const sourceIssues = [leads.error, ordersResult.mondayError, plan.mondayError].filter(Boolean) as string[];
  const guidoNeeded = leadActions.length + riskyOrders.filter(({ risk }) => risk.tone === "red").length + sourceIssues.length;

  return (
    <MissionControlShell
      section="today"
      pageTitle="Today"
      pageSubtitle="America Mode: what needs Guido, what Nick/Dylan can keep doing, and whether today’s data is trustworthy."
      syncedAt={new Date().toISOString()}
      source={sourceIssues.length ? "snapshot" : "supabase"}
      mondayError={sourceIssues[0]}
      maxWidth={980}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <section style={{ background: `linear-gradient(135deg, ${DT.cardBg}, rgba(231,243,242,0.72))`, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: DT.sans, color: DT.textFaint, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>Daily control</div>
              <h1 style={{ margin: "2px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 30, lineHeight: 1 }}>Guido: {guidoNeeded ? `${guidoNeeded > 3 ? "3+" : guidoNeeded} thing${guidoNeeded === 1 ? "" : "s"} to check` : "no obvious fire"}</h1>
            </div>
            <StatusPill tone={sourceIssues.length ? "amber" : guidoNeeded ? "teal" : "green"}>{sourceIssues.length ? "Source check" : guidoNeeded ? "Action" : "Quiet"}</StatusPill>
          </div>
          <p style={{ margin: 0, fontFamily: DT.sans, color: DT.textSecondary, fontSize: 13, lineHeight: 1.45 }}>
            Source-backed control only. No messages, records, invoices, or customer data are changed here.
          </p>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <Panel title="Leads needing Guido" subtitle={`${leadActions.length} priority lead${leadActions.length === 1 ? "" : "s"}`} actionHref="/leads" actionLabel="Open leads">
            {leadActions.length ? leadActions.map((lead) => <Row key={lead.id} title={lead.customerName} meta={`${leadReason(lead)} · ${money(lead.estimatedValue)}`} tone={lead.priority === "hot" ? "red" : "amber"} />) : <Row title="No urgent lead actions surfaced" meta="Leads board has no overdue/hot/high-value action in the current read." tone="green" />}
          </Panel>

          <Panel title="Orders at risk" subtitle={`${activeOrders.length} active order${activeOrders.length === 1 ? "" : "s"}`} actionHref="/production/plan?delight=off" actionLabel="Open plan">
            {riskyOrders.length ? riskyOrders.map(({ order, risk }) => <Row key={order.id} title={order.customer} meta={`${risk.reason} · ${order.rawMondayStatus || order.status}`} tone={risk.tone} />) : <Row title="No obvious order risk" meta="No overdue/no-date/material/payment action surfaced in the current read." tone="green" />}
          </Panel>

          <Panel title="Nick / Dylan can keep moving" subtitle={`${taskCount(weekRows)} visible workshop task fragment${taskCount(weekRows) === 1 ? "" : "s"}`} actionHref="/production/plan?delight=off" actionLabel="Open schedule">
            {weekRows.slice(0, 2).map((row) => <Row key={row.id} title={row.name} meta={`${row.weekGroupTitle} · ${row.appLinkedOrder?.name || row.linkedOrders[0]?.name || "No linked order"}`} tone={row.hasAppLinkedOrder ? "teal" : "amber"} />)}
            {!weekRows.length && <Row title="No production rows loaded" meta="Production Plan source needs checking before relying on today." tone="amber" />}
          </Panel>
        </div>

        <Panel title="Source trust" subtitle="Accuracy before polish" actionHref="/production/plan?delight=off" actionLabel="Verify">
          {sourceIssues.length ? sourceIssues.slice(0, 3).map((issue) => <Row key={issue} title="Source warning" meta={issue} tone="amber" />) : <Row title="Core reads responded" meta={`Leads: ${leads.source}; orders and production plan returned current read paths.`} tone="green" />}
        </Panel>
      </div>
    </MissionControlShell>
  );
}
