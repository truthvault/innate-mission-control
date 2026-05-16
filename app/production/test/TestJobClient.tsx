'use client';

import { useMemo, useState } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT } from "@/components/mission-control-ui";

type ReplayStep = {
  title: string;
  state: string;
  evidence: string;
  action: string;
  proof: string;
};

const ORDER = {
  customer: "Bruce Perry",
  invoice: "INV-0986",
  invoiceDate: "1 Jul 2025",
  paidDate: "3 Jul 2025",
  value: "$5,020",
  product: "Steel Crossroads dining table",
  spec: "2800 × 1000 clear timber top · black steel Crossroads base",
  finish: "Clear natural finish",
  delivery: "Hutt Valley · delivered 26 Aug 2025",
  source: "Historical replay from 2025 completed order",
};

const STEPS: ReplayStep[] = [
  {
    title: "Invoice detected",
    state: "Awaiting payment",
    evidence: "Xero invoice email found: INV-0986 for $5,020.",
    action: "Hold in Order Inbox. Do not create production tasks yet.",
    proof: "Tuesday can see the order exists, but knows payment is the gate.",
  },
  {
    title: "Payment confirmed",
    state: "Paid, needs process confirmation",
    evidence: "Guido reply: “Thanks for your payment. We’ll get your order underway.”",
    action: "Create a Customer Order review task with source proof attached.",
    proof: "Tuesday moves forward only after payment evidence exists.",
  },
  {
    title: "Production process confirmed",
    state: "Process steps approved",
    evidence: "Reviewer checks the required workshop steps: material check, machining/prep, finish, QC/photos, freight, and customer update.",
    action: "Click green Confirm production steps once the process is complete enough to become the Week Plan.",
    proof: "Human approval stays between paid order and workshop schedule, but the approval is about the production process, not re-confirming the customer details.",
  },
  {
    title: "Plan created",
    state: "In production",
    evidence: "Approved steel Crossroads production process becomes dated workshop steps.",
    action: "Create material, machining, finish, QC/photo, freight, and customer-update tasks.",
    proof: "The Week Plan is generated from the confirmed process steps, not from loose notes.",
  },
  {
    title: "Delivery closed",
    state: "Complete",
    evidence: "Mainfreight delivery proof: delivered 26 Aug 2025.",
    action: "Close the order and preserve the source trail for audit/replay.",
    proof: "Tuesday can show the whole lifecycle from invoice to completed order.",
  },
];

type PlanTask = {
  title: string;
  detail: string;
  owner: "Workshop" | "Admin";
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";
  date: string;
  capacityBefore: string;
  capacityAfter: string;
  capacityTone: "green" | "amber" | "red";
};

const PLAN: PlanTask[] = [
  {
    title: "Material check",
    detail: "Confirm top stock, steel base, fixings, and clear finish materials are physically ready.",
    owner: "Workshop",
    day: "Monday",
    date: "7 Jul",
    capacityBefore: "3/6 workshop slots used",
    capacityAfter: "4/6 after adding",
    capacityTone: "green",
  },
  {
    title: "Machine / prep",
    detail: "Cut, shape, sand top; prepare Crossroads base fixing points.",
    owner: "Workshop",
    day: "Tuesday",
    date: "8 Jul",
    capacityBefore: "5/6 workshop slots used",
    capacityAfter: "6/6 after adding",
    capacityTone: "amber",
  },
  {
    title: "Finish coat 1",
    detail: "First clear coat, drying rack booked, photo proof before curing.",
    owner: "Workshop",
    day: "Wednesday",
    date: "9 Jul",
    capacityBefore: "4/6 workshop slots used",
    capacityAfter: "5/6 after adding",
    capacityTone: "green",
  },
  {
    title: "Finish coat 2 + cure",
    detail: "Second coat and curing buffer; do not stack another finish-heavy job on this day.",
    owner: "Workshop",
    day: "Thursday",
    date: "10 Jul",
    capacityBefore: "6/6 workshop slots used",
    capacityAfter: "Over capacity unless one task moves",
    capacityTone: "red",
  },
  {
    title: "QC + freight booking",
    detail: "Final assembled photos, underside/base proof, then book Hutt Valley freight.",
    owner: "Admin",
    day: "Friday",
    date: "11 Jul",
    capacityBefore: "2/4 admin/proof slots used",
    capacityAfter: "3/4 after adding",
    capacityTone: "green",
  },
];

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 16, ...style }}>{children}</section>;
}

function TinyLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: DT.textFaint, fontFamily: DT.sans }}>{children}</div>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, border: `1px solid ${DT.border}`, borderRadius: 12, background: "rgba(255,255,255,0.62)", minHeight: 58 }}>
      <TinyLabel>{label}</TinyLabel>
      <div style={{ marginTop: 5, color: DT.textPrimary, fontSize: 13, lineHeight: 1.35, fontWeight: 750 }}>{value}</div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 0,
        borderRadius: 14,
        background: disabled ? DT.greenBg : DT.green,
        color: disabled ? DT.green : "white",
        padding: "13px 16px",
        fontWeight: 900,
        fontSize: 13,
        boxShadow: disabled ? "none" : "0 10px 24px rgba(79,127,89,0.22)",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
void PrimaryButton;

function capacityStyle(tone: PlanTask["capacityTone"]) {
  if (tone === "red") return { bg: "rgba(190,18,60,0.08)", border: "rgba(190,18,60,0.18)", text: "#be123c" };
  if (tone === "amber") return { bg: "rgba(217,119,6,0.09)", border: "rgba(217,119,6,0.18)", text: "#b45309" };
  return { bg: DT.greenBg, border: "rgba(79,127,89,0.18)", text: DT.green };
}

function SuggestedPlan() {
  return (
    <Card style={{ borderLeft: `4px solid ${DT.green}` }}>
      <details>
        <summary style={{ listStyle: "none", cursor: "pointer" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <TinyLabel>Production confirmation</TinyLabel>
              <h3 style={{ margin: "5px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22, letterSpacing: "-0.04em" }}>Confirm production steps</h3>
              <p style={{ margin: "7px 0 0", color: DT.textSecondary, lineHeight: 1.45, fontSize: 12 }}>
                Confirming means: show the proposed Week Plan, where each step should land, and whether that day has capacity.
              </p>
            </div>
            <span style={{ justifySelf: "start", border: 0, borderRadius: 14, background: DT.green, color: "white", padding: "13px 16px", fontWeight: 900, fontSize: 13, boxShadow: "0 10px 24px rgba(79,127,89,0.22)", userSelect: "none" }}>✓ Confirm production steps</span>
          </div>
        </summary>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${DT.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <TinyLabel>Suggested Week Plan</TinyLabel>
              <h3 style={{ margin: "5px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22, letterSpacing: "-0.04em" }}>Steps, days, and capacity</h3>
            </div>
            <Chip label="Read-only replay" tone="grey" />
          </div>
          <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
            {PLAN.map((task, index) => {
              const cap = capacityStyle(task.capacityTone);
              return (
                <div key={task.title} style={{ display: "grid", gridTemplateColumns: "34px minmax(0, 1fr)", gap: 10, padding: 11, borderRadius: 13, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.66)" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, display: "grid", placeItems: "center", background: DT.greenBg, color: DT.green, fontSize: 12, fontWeight: 900 }}>{index + 1}</div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ color: DT.textPrimary, fontSize: 13 }}>{task.title}</strong>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Chip label={task.owner} tone="teal" />
                        <span style={{ border: `1px solid ${DT.border}`, background: "rgba(0,0,0,0.025)", borderRadius: 999, padding: "2px 7px", color: DT.textSecondary, fontSize: 10, fontWeight: 850 }}>{task.day} {task.date}</span>
                      </div>
                    </div>
                    <div style={{ color: DT.textSecondary, fontSize: 12, lineHeight: 1.4, marginTop: 5 }}>{task.detail}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 8 }}>
                      <div style={{ padding: "7px 8px", borderRadius: 10, border: `1px solid ${DT.border}`, background: "rgba(0,0,0,0.018)" }}>
                        <TinyLabel>Current capacity</TinyLabel>
                        <div style={{ marginTop: 3, color: DT.textSecondary, fontSize: 12, fontWeight: 750 }}>{task.capacityBefore}</div>
                      </div>
                      <div style={{ padding: "7px 8px", borderRadius: 10, border: `1px solid ${cap.border}`, background: cap.bg }}>
                        <TinyLabel>After adding this step</TinyLabel>
                        <div style={{ marginTop: 3, color: cap.text, fontSize: 12, fontWeight: 850 }}>{task.capacityAfter}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </details>
    </Card>
  );
}

export default function TestJobClient({ syncedAt }: { syncedAt: string }) {
  const [checked, setChecked] = useState<boolean[]>([true, true, false, false, false]);
  const doneCount = useMemo(() => checked.filter(Boolean).length, [checked]);
  const activeIndex = Math.min(doneCount, STEPS.length - 1);
  const processConfirmed = checked[2];
  const currentState = processConfirmed ? STEPS[activeIndex].state : "Paid, needs process confirmation";
  const confirmProductionSteps = () => {
    setChecked((prev) => prev.map((value, index) => index === 2 ? true : value));
  };
  void confirmProductionSteps;

  return (
    <MissionControlShell
      section="test"
      pageTitle="Test Run"
      pageSubtitle="Replay one completed 2025 dining-table order: invoice → payment → confirm production steps → Week Plan → complete."
      syncedAt={syncedAt}
      source="fresh"
      maxWidth={1280}
    >
      <Card style={{ marginBottom: 14, background: `linear-gradient(135deg, ${DT.cardBg} 0%, rgba(210,174,109,0.16) 100%)` }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.65fr)", gap: 18, alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Chip label="Local replay" tone="amber" />
              <Chip label="Read-only" tone="grey" />
              <Chip label="Completed 2025 replay" tone="green" />
            </div>
            <h2 style={{ margin: "10px 0 0", fontSize: 30, lineHeight: 1.02, letterSpacing: "-0.05em", color: DT.textPrimary, fontFamily: DT.serif }}>
              Steel Crossroads order intake proof
            </h2>
            <p style={{ margin: "10px 0 0", color: DT.textSecondary, fontSize: 14, lineHeight: 1.5, maxWidth: 760 }}>
              This is the screen I think Nick/admin should see before a paid order becomes workshop truth: one source-backed customer order, the production process steps it requires, one green process confirmation gate, then a suggested Week Plan.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <Fact label="Current state" value={currentState} />
            <Fact label="Replay progress" value={`${doneCount}/${STEPS.length} checks`} />
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.08fr) minmax(360px, 0.92fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <Card style={{ borderLeft: `4px solid ${DT.gold}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <TinyLabel>Customer order + production process</TinyLabel>
                <h3 style={{ margin: "4px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 24, letterSpacing: "-0.04em" }}>{ORDER.customer}</h3>
              </div>
              <Chip label="Needs process confirmation" tone="amber" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <Fact label="Invoice" value={`${ORDER.invoice} · ${ORDER.invoiceDate}`} />
              <Fact label="Payment" value={`${ORDER.paidDate} · ${ORDER.value}`} />
              <Fact label="Source" value={ORDER.source} />
              <Fact label="Product" value={ORDER.product} />
              <Fact label="Spec" value={ORDER.spec} />
              <Fact label="Finish" value={ORDER.finish} />
              <Fact label="Delivery proof" value={ORDER.delivery} />
              <Fact label="Next action" value="Reviewer confirms the production steps, then Tuesday creates the Week Plan." />
              <Fact label="Risk if wrong" value="Nothing hits the workshop schedule until the process is confirmed." />
            </div>
          </Card>

          <Card>
            <TinyLabel>Replay checkpoints</TinyLabel>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {STEPS.map((step, index) => {
                const done = checked[index];
                const active = index === activeIndex;
                return (
                  <div key={step.title} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", gap: 10, padding: 12, borderRadius: 14, border: `1px solid ${active ? "rgba(210,174,109,0.5)" : DT.border}`, background: done ? DT.greenBg : active ? DT.goldSoft : "rgba(255,255,255,0.58)" }}>
                    <input aria-label={step.title} type="checkbox" checked={done} onChange={() => setChecked((prev) => prev.map((v, i) => i === index ? !v : v))} style={{ width: 22, height: 22, accentColor: DT.green, marginTop: 2 }} />
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <h4 style={{ margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: 18, letterSpacing: "-0.03em" }}>{step.title}</h4>
                        <Chip label={step.state} tone={done ? "green" : active ? "amber" : "grey"} />
                      </div>
                      <p style={{ margin: "7px 0 0", color: DT.textSecondary, fontSize: 12, lineHeight: 1.45 }}><strong>Evidence:</strong> {step.evidence}</p>
                      <p style={{ margin: "5px 0 0", color: DT.textSecondary, fontSize: 12, lineHeight: 1.45 }}><strong>Action:</strong> {step.action}</p>
                      <p style={{ margin: "5px 0 0", color: DT.green, fontSize: 12, lineHeight: 1.45 }}><strong>Proof:</strong> {step.proof}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div style={{ display: "grid", gap: 14, position: "sticky", top: 92 }}>
          <Card style={{ borderLeft: `4px solid ${DT.teal}` }}>
            <TinyLabel>Order Inbox states</TinyLabel>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {["Awaiting payment", "Paid, needs process confirmation", "Process steps approved", "In production", "Complete"].map((state, index) => (
                <div key={state} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, background: index <= activeIndex ? DT.greenBg : "rgba(0,0,0,0.025)", border: `1px solid ${index === activeIndex ? "rgba(79,95,168,0.24)" : DT.border}` }}>
                  <span style={{ color: DT.textPrimary, fontWeight: 850, fontSize: 12 }}>{state}</span>
                  <Chip label={index < activeIndex ? "done" : index === activeIndex ? "now" : "later"} tone={index < activeIndex ? "green" : index === activeIndex ? "teal" : "grey"} />
                </div>
              ))}
            </div>
          </Card>

          <SuggestedPlan />

          <Card style={{ background: `linear-gradient(135deg, ${DT.cardBg} 0%, rgba(79,127,89,0.1) 100%)` }}>
            <TinyLabel>Decision</TinyLabel>
            <p style={{ margin: "8px 0 0", color: DT.textSecondary, lineHeight: 1.5, fontSize: 13 }}>
              If this reads right locally, the next build is a static replay route first. Then we wire Gmail/Xero reads behind the same states, still with no production plan creation until the green production-process confirmation gate.
            </p>
          </Card>
        </div>
      </div>
    </MissionControlShell>
  );
}
