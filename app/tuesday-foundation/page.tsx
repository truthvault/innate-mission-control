import type { ReactNode } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT } from "@/components/mission-control-ui";
import { tuesdaySections } from "@/lib/tuesday/sections";

const lanes = [
  { label: "Leads", value: 8, tone: DT.sage, fill: 74, dots: 5 },
  { label: "Quotes", value: 5, tone: DT.gold, fill: 58, dots: 4 },
  { label: "Orders", value: 4, tone: DT.teal, fill: 62, dots: 3 },
  { label: "Production", value: 6, tone: DT.clay, fill: 68, dots: 4 },
  { label: "Freight", value: 2, tone: DT.green, fill: 42, dots: 2 },
];

const rings = [
  { label: "Blocked", value: 2, fill: 28, color: DT.clay },
  { label: "Draft", value: 5, fill: 58, color: DT.gold },
  { label: "Live", value: tuesdaySections.filter((item) => item.status === "live").length, fill: 46, color: DT.green },
  { label: "Planned", value: tuesdaySections.filter((item) => item.status === "planned").length, fill: 54, color: DT.teal },
];

const todayDots = [
  { label: "Leads", tone: DT.sage, fill: 82 },
  { label: "Quotes", tone: DT.gold, fill: 58 },
  { label: "Orders", tone: DT.teal, fill: 66 },
  { label: "Production", tone: DT.clay, fill: 74 },
  { label: "Freight", tone: DT.green, fill: 44 },
];

function VisualCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      style={{
        position: "relative",
        minHeight: 278,
        borderRadius: 30,
        border: `1px solid ${DT.border}`,
        background: [
          "radial-gradient(circle at 18% 10%, rgba(194,122,72,0.14), transparent 28%)",
          "radial-gradient(circle at 90% 12%, rgba(77,124,102,0.12), transparent 28%)",
          "repeating-linear-gradient(100deg, rgba(97,72,48,0.055) 0 1px, transparent 1px 22px)",
          "linear-gradient(145deg, rgba(255,253,249,0.98), rgba(248,241,229,0.78))",
        ].join(", "),
        boxShadow: "0 20px 48px rgba(44,37,32,0.08)",
        padding: 24,
        display: "grid",
        alignContent: "space-between",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 12,
          borderRadius: 24,
          backgroundImage: "radial-gradient(rgba(44,37,32,0.10) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", color: DT.textPrimary, fontFamily: DT.serif, fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{label}</div>
      <div style={{ position: "relative", display: "grid", gap: 14 }}>{children}</div>
    </section>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 180 46" role="img" aria-label="Needs Guido" style={{ width: "100%", maxWidth: 220, justifySelf: "center" }}>
      <defs>
        <linearGradient id="sparkGlow" x1="0" x2="1">
          <stop offset="0" stopColor={DT.gold} />
          <stop offset="1" stopColor={DT.clay} />
        </linearGradient>
      </defs>
      {[18, 54, 90, 126, 162].map((x) => <line key={x} x1={x} y1="8" x2={x} y2="40" stroke="rgba(44,37,32,0.08)" strokeWidth="1" />)}
      <path d="M10 35 C28 20 42 26 56 18 S84 34 98 22 S124 8 140 16 S158 32 172 12" fill="none" stroke="url(#sparkGlow)" strokeWidth="5" strokeLinecap="round" />
      {[10, 56, 98, 140, 172].map((x, index) => (
        <circle key={x} cx={x} cy={[35, 18, 22, 16, 12][index]} r="4.5" fill={index > 2 ? DT.clay : DT.gold} stroke={DT.cardBg} strokeWidth="2" />
      ))}
    </svg>
  );
}

function Gauge({ value, color }: { value: number; color: string }) {
  const angle = -118 + value * 2.36;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 132 }}>
      <svg viewBox="0 0 220 150" role="img" aria-label={`${value}%`} style={{ width: "100%", maxWidth: 250 }}>
        <path d="M30 116a80 80 0 0 1 160 0" fill="none" stroke="rgba(44,37,32,0.08)" strokeWidth="22" strokeLinecap="round" />
        {[0, 20, 40, 60, 80, 100].map((tick) => {
          const tickAngle = -120 + tick * 2.4;
          return <line key={tick} x1="110" y1="34" x2="110" y2="45" stroke="rgba(44,37,32,0.30)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${tickAngle} 110 116)`} />;
        })}
        <path d="M30 116a80 80 0 0 1 160 0" fill="none" stroke={color} strokeWidth="22" strokeLinecap="round" strokeDasharray={`${value * 2.52} 252`} />
        <line x1="110" y1="116" x2="110" y2="54" stroke={DT.textPrimary} strokeWidth="8" strokeLinecap="round" transform={`rotate(${angle} 110 116)`} />
        <circle cx="110" cy="116" r="12" fill={DT.textPrimary} />
        <circle cx="110" cy="116" r="5" fill={DT.gold} />
        <text x="110" y="139" textAnchor="middle" style={{ fill: DT.textMuted, fontFamily: DT.sans, fontSize: 12, fontWeight: 800 }}>{value}%</text>
      </svg>
    </div>
  );
}

function FlowBars() {
  return (
    <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
      {lanes.map((lane, index) => (
        <div key={lane.label} style={{ display: "grid", gridTemplateColumns: "72px 1fr 30px", alignItems: "center", gap: 10 }}>
          <span style={{ color: DT.textMuted, fontFamily: DT.sans, fontSize: 11, fontWeight: 900 }}>{lane.label}</span>
          <span style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4 }}>
            <span style={{ height: 14, borderRadius: 999, background: "rgba(44,37,32,0.07)", overflow: "hidden" }}>
              <span style={{ display: "block", width: `${lane.fill}%`, height: "100%", borderRadius: 999, background: lane.tone }} />
            </span>
            <span style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 3 }}>
              {Array.from({ length: 8 }).map((_, dotIndex) => (
                <span key={dotIndex} style={{ height: 5, borderRadius: 999, background: dotIndex <= index + 2 ? lane.tone : "rgba(44,37,32,0.08)", opacity: dotIndex <= index + 2 ? 0.9 : 1 }} />
              ))}
            </span>
          </span>
          <span style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 20, fontWeight: 800 }}>{lane.value}</span>
        </div>
      ))}
    </div>
  );
}

function RiskRing() {
  const blips = [
    { x: 76, y: 38, color: DT.green },
    { x: 116, y: 58, color: DT.gold },
    { x: 96, y: 112, color: DT.teal },
    { x: 50, y: 88, color: DT.clay },
  ];

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: 172 }}>
      <svg viewBox="0 0 166 166" role="img" aria-label="Risk" style={{ width: 176, maxWidth: "100%" }}>
        <circle cx="83" cy="83" r="74" fill="rgba(255,253,249,0.64)" stroke="rgba(44,37,32,0.10)" strokeWidth="1" />
        {[26, 48, 70].map((radius) => <circle key={radius} cx="83" cy="83" r={radius} fill="none" stroke="rgba(44,37,32,0.10)" strokeWidth="1" />)}
        <line x1="83" y1="9" x2="83" y2="157" stroke="rgba(44,37,32,0.08)" />
        <line x1="9" y1="83" x2="157" y2="83" stroke="rgba(44,37,32,0.08)" />
        {blips.map((blip) => <circle key={`${blip.x}-${blip.y}`} cx={blip.x} cy={blip.y} r="7" fill={blip.color} stroke={DT.cardBg} strokeWidth="3" />)}
        <text x="83" y="89" textAnchor="middle" style={{ fill: DT.green, fontFamily: DT.serif, fontSize: 25, fontWeight: 900 }}>Clear</text>
      </svg>
    </div>
  );
}

function LaneFlow() {
  return (
    <section
      style={{
        borderRadius: 32,
        border: `1px solid ${DT.border}`,
        background: [
          "linear-gradient(90deg, rgba(194,122,72,0.10), transparent 28%, rgba(77,124,102,0.10))",
          "repeating-linear-gradient(0deg, rgba(44,37,32,0.035) 0 1px, transparent 1px 20px)",
          "rgba(255,253,249,0.82)",
        ].join(", "),
        boxShadow: DT.shadow,
        padding: 24,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(142px, 1fr))", gap: 14, alignItems: "center" }}>
        {lanes.map((lane, index) => (
          <div key={lane.label} style={{ display: "grid", gridTemplateColumns: index === lanes.length - 1 ? "1fr" : "1fr 20px", alignItems: "center", gap: 8 }}>
            <div style={{ display: "grid", justifyItems: "center", gap: 9 }}>
              <div
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: "50%",
                  background: `conic-gradient(${lane.tone} 0 ${lane.fill}%, rgba(44,37,32,0.08) ${lane.fill}% 100%)`,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 14px 30px rgba(44,37,32,0.10)",
                }}
              >
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(145deg, #fffdf9, #f4eddf)", display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1px rgba(44,37,32,0.07)" }}>
                  <span style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 28, fontWeight: 900 }}>{lane.value}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, minHeight: 8 }}>
                {Array.from({ length: lane.dots }).map((_, dotIndex) => <span key={dotIndex} style={{ width: 7, height: 7, borderRadius: "50%", background: lane.tone, opacity: 0.72 }} />)}
              </div>
              <div style={{ color: DT.textPrimary, fontFamily: DT.sans, fontSize: 12, fontWeight: 900, letterSpacing: "0.02em" }}>{lane.label}</div>
            </div>
            {index < lanes.length - 1 && <div style={{ color: "rgba(44,37,32,0.30)", fontFamily: DT.sans, fontSize: 18, fontWeight: 900 }}>→</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function TodayStrip() {
  return (
    <section
      style={{
        borderRadius: 26,
        border: `1px solid ${DT.border}`,
        background: "linear-gradient(90deg, rgba(255,253,249,0.92), rgba(244,237,223,0.70))",
        boxShadow: "0 14px 34px rgba(44,37,32,0.06)",
        padding: "16px 18px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 24, fontWeight: 900 }}>Today</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 10 }}>
        {todayDots.map((item) => (
          <div key={item.label} style={{ display: "grid", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} style={{ width: 9, height: 9, borderRadius: "50%", background: index < Math.round(item.fill / 18) ? item.tone : "rgba(44,37,32,0.09)" }} />
              ))}
            </div>
            <span style={{ color: DT.textMuted, fontFamily: DT.sans, fontSize: 10, fontWeight: 900 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Donut({ label, value, fill, color }: { label: string; value: number; fill: number; color: string }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 8 }}>
      <div style={{ width: 122, height: 122, borderRadius: "50%", background: `conic-gradient(${color} 0 ${fill}%, rgba(44,37,32,0.08) ${fill}% 100%)`, display: "grid", placeItems: "center", boxShadow: "0 10px 24px rgba(44,37,32,0.08)" }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: DT.cardBg, display: "grid", placeItems: "center", boxShadow: "inset 0 0 0 1px rgba(44,37,32,0.06)" }}>
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
      pageSubtitle="Visual demo"
      syncedAt={new Date().toISOString()}
      source="foundation"
      showRefresh={false}
      navMode="tuesday-master"
    >
      <div style={{ display: "grid", gap: 18 }}>
        <TodayStrip />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          <VisualCard label="Needs Guido">
            <Gauge value={72} color={DT.clay} />
            <Sparkline />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Blocked" tone="red" />
              <Chip label="Draft" tone="amber" />
            </div>
          </VisualCard>

          <VisualCard label="Flow">
            <FlowBars />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Live" tone="green" />
              <Chip label="Planned" tone="teal" />
            </div>
          </VisualCard>

          <VisualCard label="Risk">
            <RiskRing />
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Clear" tone="green" />
              <Chip label="Blocked" tone="red" />
            </div>
          </VisualCard>
        </div>

        <LaneFlow />

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
            borderRadius: 32,
            border: `1px solid ${DT.border}`,
            background: "linear-gradient(145deg, rgba(255,253,249,0.86), rgba(244,237,223,0.62))",
            boxShadow: DT.shadow,
            padding: 22,
          }}
        >
          {rings.map((ring) => <Donut key={ring.label} {...ring} />)}
        </section>
      </div>
    </MissionControlShell>
  );
}
