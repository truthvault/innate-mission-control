import type { ReactNode } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT } from "@/components/mission-control-ui";
import { tuesdaySections } from "@/lib/tuesday/sections";

const lanes = [
  { label: "Leads", value: 8, tone: DT.sage, fill: 74 },
  { label: "Quotes", value: 5, tone: DT.gold, fill: 58 },
  { label: "Orders", value: 4, tone: DT.teal, fill: 62 },
  { label: "Production", value: 6, tone: DT.clay, fill: 68 },
  { label: "Freight", value: 2, tone: DT.green, fill: 42 },
];

const rings = [
  { label: "Approvals", value: 3, fill: 62, color: DT.gold },
  { label: "Blockers", value: 2, fill: 28, color: DT.clay },
  { label: "Live", value: tuesdaySections.filter((item) => item.status === "live").length, fill: 46, color: DT.green },
  { label: "Planned", value: tuesdaySections.filter((item) => item.status === "planned").length, fill: 54, color: DT.teal },
];

function VisualCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      style={{
        minHeight: 238,
        borderRadius: 28,
        border: `1px solid ${DT.border}`,
        background: "linear-gradient(145deg, rgba(255,253,249,0.96), rgba(248,241,229,0.72))",
        boxShadow: "0 18px 42px rgba(44,37,32,0.07)",
        padding: 22,
        display: "grid",
        alignContent: "space-between",
        overflow: "hidden",
      }}
    >
      <div style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{label}</div>
      {children}
    </section>
  );
}

function Gauge({ value, color }: { value: number; color: string }) {
  const angle = -118 + value * 2.36;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 150 }}>
      <svg viewBox="0 0 220 142" role="img" aria-label={`${value}%`} style={{ width: "100%", maxWidth: 250 }}>
        <path d="M30 116a80 80 0 0 1 160 0" fill="none" stroke="rgba(44,37,32,0.08)" strokeWidth="22" strokeLinecap="round" />
        <path d="M30 116a80 80 0 0 1 160 0" fill="none" stroke={color} strokeWidth="22" strokeLinecap="round" strokeDasharray={`${value * 2.52} 252`} />
        <line x1="110" y1="116" x2="110" y2="54" stroke={DT.textPrimary} strokeWidth="8" strokeLinecap="round" transform={`rotate(${angle} 110 116)`} />
        <circle cx="110" cy="116" r="12" fill={DT.textPrimary} />
        <text x="110" y="134" textAnchor="middle" style={{ fill: DT.textMuted, fontFamily: DT.sans, fontSize: 12, fontWeight: 800 }}>{value}%</text>
      </svg>
    </div>
  );
}

function FlowBars() {
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
      {lanes.slice(0, 4).map((lane) => (
        <div key={lane.label} style={{ display: "grid", gridTemplateColumns: "64px 1fr 30px", alignItems: "center", gap: 10 }}>
          <span style={{ color: DT.textMuted, fontFamily: DT.sans, fontSize: 11, fontWeight: 800 }}>{lane.label}</span>
          <span style={{ height: 15, borderRadius: 999, background: "rgba(44,37,32,0.07)", overflow: "hidden" }}>
            <span style={{ display: "block", width: `${lane.fill}%`, height: "100%", borderRadius: 999, background: lane.tone }} />
          </span>
          <span style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 20, fontWeight: 800 }}>{lane.value}</span>
        </div>
      ))}
    </div>
  );
}

function RiskRing() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
      <div
        style={{
          width: 158,
          height: 158,
          borderRadius: "50%",
          background: `conic-gradient(${DT.clay} 0 31%, ${DT.gold} 31% 58%, ${DT.green} 58% 100%)`,
          display: "grid",
          placeItems: "center",
          boxShadow: "inset 0 0 0 1px rgba(44,37,32,0.08)",
        }}
      >
        <div style={{ width: 102, height: 102, borderRadius: "50%", background: DT.cardBg, display: "grid", placeItems: "center", boxShadow: "0 8px 22px rgba(44,37,32,0.08)" }}>
          <span style={{ color: DT.green, fontFamily: DT.serif, fontSize: 30, fontWeight: 900 }}>Clear</span>
        </div>
      </div>
    </div>
  );
}

function LaneFlow() {
  return (
    <section
      style={{
        borderRadius: 30,
        border: `1px solid ${DT.border}`,
        background: "rgba(255,253,249,0.78)",
        boxShadow: DT.shadow,
        padding: 24,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(138px, 1fr))", gap: 16, alignItems: "center" }}>
        {lanes.map((lane, index) => (
          <div key={lane.label} style={{ display: "grid", gridTemplateColumns: index === lanes.length - 1 ? "1fr" : "1fr 22px", alignItems: "center", gap: 10 }}>
            <div style={{ display: "grid", justifyItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: "50%",
                  border: `10px solid ${lane.tone}`,
                  background: "linear-gradient(145deg, #fffdf9, #f4eddf)",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 12px 28px rgba(44,37,32,0.08)",
                }}
              >
                <span style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 28, fontWeight: 900 }}>{lane.value}</span>
              </div>
              <div style={{ color: DT.textPrimary, fontFamily: DT.sans, fontSize: 12, fontWeight: 900, letterSpacing: "0.02em" }}>{lane.label}</div>
            </div>
            {index < lanes.length - 1 && <div style={{ height: 2, background: "linear-gradient(90deg, rgba(44,37,32,0.18), rgba(44,37,32,0.04))" }} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function Donut({ label, value, fill, color }: { label: string; value: number; fill: number; color: string }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
      <div style={{ width: 118, height: 118, borderRadius: "50%", background: `conic-gradient(${color} 0 ${fill}%, rgba(44,37,32,0.08) ${fill}% 100%)`, display: "grid", placeItems: "center" }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: DT.cardBg, display: "grid", placeItems: "center" }}>
          <span style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 26, fontWeight: 900 }}>{value}</span>
        </div>
      </div>
      <span style={{ color: DT.textMuted, fontFamily: DT.sans, fontSize: 11, fontWeight: 900 }}>{label}</span>
    </div>
  );
}

export default function TuesdayFoundationPage() {
  return (
    <MissionControlShell
      section="dashboard"
      pageTitle="Tuesday foundation"
      pageSubtitle="Visual demo · no writes"
      syncedAt={new Date().toISOString()}
      source="foundation"
      showRefresh={false}
      navMode="tuesday-master"
    >
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18 }}>
          <VisualCard label="Needs Guido">
            <Gauge value={72} color={DT.clay} />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="3 approvals" tone="amber" />
              <Chip label="2 blocked" tone="red" />
            </div>
          </VisualCard>

          <VisualCard label="Flow">
            <FlowBars />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Draft" tone="teal" />
              <Chip label="Live" tone="green" />
            </div>
          </VisualCard>

          <VisualCard label="Risk">
            <RiskRing />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="PP safe" tone="green" />
              <Chip label="No writes" tone="grey" />
            </div>
          </VisualCard>
        </div>

        <LaneFlow />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
            borderRadius: 30,
            border: `1px solid ${DT.border}`,
            background: "linear-gradient(145deg, rgba(255,253,249,0.82), rgba(244,237,223,0.58))",
            boxShadow: DT.shadow,
            padding: 22,
          }}
        >
          {rings.map((ring) => <Donut key={ring.label} {...ring} />)}
        </section>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <Chip label="Quote blocked" tone="amber" />
          <Chip label="PP safe" tone="green" />
          <Chip label="Freight live" tone="teal" />
          <Chip label="Demo only" tone="grey" />
        </div>
      </div>
    </MissionControlShell>
  );
}
