'use client';

import type { UiOrder } from "@/lib/monday/mapping";
import { MissionControlShell } from "@/components/mission-control-shell";
import { DT } from "@/components/mission-control-ui";
import { daysUntil, fmtDate, isComplete, sortByShipDate, toDisplayOrder, type DisplayOrder } from "@/lib/production/order-display";

type Props = {
  orders: UiOrder[];
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

type ChecklistItem = { label: string; state: "needed" | "check" | "done" };

function checklistFor(order: DisplayOrder): ChecklistItem[] {
  if (order.rawMondayItem === "Sample") {
    return [
      { label: "Correct species", state: "check" },
      { label: "Correct finish", state: "check" },
      { label: "Engraving / label matches", state: "check" },
      { label: "Clean customer-ready sample", state: "check" },
      { label: "Species card + business card included", state: "check" },
      { label: "Photo before packaging", state: "needed" },
      { label: "Photo after packaging", state: "needed" },
      { label: "Follow-up date set", state: order.shipDate ? "check" : "needed" },
    ];
  }
  return [
    { label: "Final QC complete", state: order.currentStep >= Math.max(0, order.steps.length - 3) ? "check" : "needed" },
    { label: "Final photos uploaded", state: "needed" },
    { label: "Balance paid", state: order.paymentStage === "balance_paid" ? "done" : order.paymentStage === "awaiting_balance_payment" || order.paymentStage === "balance_authorised" ? "needed" : "check" },
    { label: "Freight / collection confirmed", state: order.rawMondayStatus === "Booked" || order.status === "Finished" ? "check" : "needed" },
    { label: "Customer update needed?", state: daysUntil(order.shipDate) !== null && (daysUntil(order.shipDate) ?? 99) <= 7 ? "check" : "needed" },
    { label: "Xero link present", state: order.xero ? "done" : "needed" },
  ];
}

function stateStyle(state: ChecklistItem["state"]) {
  if (state === "done") return { bg: DT.tealSoft, color: DT.teal, marker: "Done" };
  if (state === "check") return { bg: "rgba(200,169,110,0.10)", color: "#9a6b12", marker: "Check" };
  return { bg: "rgba(217,119,6,0.10)", color: "#b45309", marker: "Needs" };
}

function DispatchCard({ order }: { order: DisplayOrder }) {
  const diff = daysUntil(order.shipDate);
  const checklist = checklistFor(order);
  const priority = order.rawMondayItem === "Sample" || diff === null || diff <= 7;
  const paymentLabel = order.paymentStageLabel
    ? order.paymentStage === "awaiting_balance_payment" && order.balanceAmountDue != null
      ? `${order.paymentStageLabel} · $${Math.round(order.balanceAmountDue).toLocaleString("en-NZ")}`
      : order.paymentStageLabel
    : null;
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${priority ? "rgba(217,119,6,0.16)" : DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 20 }}>{order.customer}</h2>
            <div style={{ marginTop: 4, fontSize: 12, color: DT.textSecondary, fontFamily: DT.sans }}>{order.rawMondayItem ?? order.product} · {order.displayStatus} · {order.shipDate ? fmtDate(order.shipDate) : "No due date"}</div>
            {paymentLabel && <div style={{ marginTop: 5, fontSize: 11, color: order.paymentStage === "awaiting_balance_payment" ? "#9a6b12" : DT.teal, fontFamily: DT.sans, fontWeight: 850 }}>{paymentLabel}</div>}
          </div>
          <span style={{ fontSize: 10, color: priority ? "#b45309" : DT.teal, background: priority ? "rgba(217,119,6,0.10)" : DT.tealSoft, borderRadius: 20, padding: "3px 9px", fontWeight: 800, fontFamily: DT.sans, whiteSpace: "nowrap" }}>{priority ? "Needs proof" : "Watch"}</span>
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 7 }}>
          {checklist.map((item) => {
            const s = stateStyle(item.state);
            return <div key={item.label} style={{ background: s.bg, color: s.color, borderRadius: 9, padding: "7px 10px", fontSize: 12, fontWeight: 700, fontFamily: DT.sans, lineHeight: 1.25, display: "flex", alignItems: "center", gap: 8 }}><span style={{ flex: "0 0 auto", minWidth: 44, textAlign: "center", border: "1px solid currentColor", borderRadius: 999, padding: "2px 6px", fontSize: 9, lineHeight: 1.1 }}>{s.marker}</span><span>{item.label}</span></div>;
          })}
        </div>
        <div style={{ marginTop: 12, color: DT.textSecondary, fontSize: 12, fontFamily: DT.sans }}>Next: {order.nextAction}</div>
      </section>
  );
}

export default function DispatchClient({ orders, syncedAt, source, mondayError }: Props) {
  const display = orders.map(toDisplayOrder).filter((o) => !isComplete(o)).sort(sortByShipDate);
  const samples = display.filter((o) => o.rawMondayItem === "Sample");
  const dueSoon = display.filter((o) => o.rawMondayItem !== "Sample" && daysUntil(o.shipDate) !== null && (daysUntil(o.shipDate) ?? 99) <= 14);
  const noDates = display.filter((o) => o.rawMondayItem !== "Sample" && !o.shipDate);
  const rows = [...samples, ...dueSoon, ...noDates];

  return (
    <MissionControlShell
      section="dispatch"
      pageTitle="Hidden Dispatch / QC fallback"
      pageSubtitle="Final checks before samples, panels, and orders leave the workshop"
      syncedAt={syncedAt}
      source={source}
      mondayError={mondayError}
    >
      <div style={{ background: `linear-gradient(135deg, ${DT.cardBg} 0%, rgba(210,174,109,0.14) 100%)`, color: DT.textPrimary, border: `1px solid ${DT.border}`, borderRadius: DT.radius, padding: "16px 18px", boxShadow: DT.shadow, marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: "#8a5b1f", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, fontFamily: DT.sans }}>Read-only proof control</div>
        <p style={{ margin: "7px 0 0", color: DT.textSecondary, fontSize: 13, fontFamily: DT.sans }}>Read-only checklist for final proof. Nothing is written from this page yet.</p>
      </div>
      {rows.length === 0 ? <div style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, padding: 20, color: DT.teal, fontFamily: DT.sans }}>No active dispatch/QC candidates found.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{rows.map((order) => <DispatchCard key={order.id} order={order} />)}</div>}
    </MissionControlShell>
  );
}
