'use client';

import { useMemo } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { FINISHES, SPECIES, SAMPLE_TYPES, type SampleStockBoard, type SampleStockCell, type StockLevel } from "@/lib/monday/sample-stock-types";

const DT = {
  pageBg: "#f5f3ee",
  cardBg: "#ffffff",
  headerBg: "#1a1a1a",
  teal: "#0c7c7a",
  tealSoft: "rgba(12,124,122,0.08)",
  gold: "#c8a96e",
  goldSoft: "rgba(200,169,110,0.06)",
  textPrimary: "#22201a",
  textSecondary: "#5a5549",
  textMuted: "#7c746b",
  textFaint: "#9a9088",
  border: "rgba(0,0,0,0.06)",
  shadow: "0 1px 3px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
  radius: 14,
  sans: "'DM Sans', -apple-system, sans-serif",
  serif: "'Fraunces', Georgia, serif",
};

function levelMeta(level: StockLevel) {
  if (level === "out") return { label: "Out", bg: "#fee2e2", color: "#991b1b", border: "rgba(153,27,27,0.18)" };
  if (level === "low") return { label: "Low", bg: "rgba(217,119,6,0.10)", color: "#b45309", border: "rgba(217,119,6,0.16)" };
  return { label: "OK", bg: DT.tealSoft, color: DT.teal, border: "rgba(12,124,122,0.14)" };
}

function StatusPill({ level }: { level: StockLevel }) {
  const m = levelMeta(level);
  return <span style={{ fontSize: 10, color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 20, padding: "2px 8px", fontWeight: 700, fontFamily: DT.sans }}>{m.label}</span>;
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "#991b1b" : tone === "warn" ? "#b45309" : tone === "good" ? DT.teal : DT.textPrimary;
  return (
    <div style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: "14px 16px" }}>
      <div style={{ fontSize: 10, color: DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontFamily: DT.sans }}>{label}</div>
      <div style={{ fontSize: 30, lineHeight: 1.1, marginTop: 5, color, fontFamily: DT.serif, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function StockMatrix({ title, cells }: { title: string; cells: SampleStockCell[] }) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 17, fontFamily: DT.serif, color: DT.textPrimary }}>{title}</h2>
        <div style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans }}>0 = out · 1–2 = low · 3+ = OK</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 620, display: "grid", gridTemplateColumns: "120px repeat(3, 1fr)", borderBottom: `1px solid ${DT.border}` }}>
          <div style={headCellStyle}>Species</div>
          {FINISHES.map((finish) => <div key={finish} style={headCellStyle}>{finish}</div>)}
          {SPECIES.flatMap((species) => [
            <div key={`${species}-label`} style={rowHeadStyle}>{species}</div>,
            ...FINISHES.map((finish) => {
              const cell = cells.find((c) => c.species === species && c.finish === finish);
              const level = cell?.level ?? "out";
              const meta = levelMeta(level);
              const cellStyle: React.CSSProperties = { textDecoration: "none", padding: "12px 12px", borderLeft: `1px solid ${DT.border}`, borderTop: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: level === "out" ? "rgba(153,27,27,0.035)" : level === "low" ? "rgba(217,119,6,0.035)" : "transparent" };
              const content = (
                <>
                  <span style={{ fontFamily: DT.serif, color: meta.color, fontSize: 26, lineHeight: 1, fontWeight: 700 }}>{cell?.count ?? 0}</span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><StatusPill level={level} /><span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 700 }}>{cell ? "Tracked" : "No stock row"}</span></span>
                </>
              );
              if (!cell) return <div key={`${species}-${finish}`} title={`No stock row found for ${title} / ${species} / ${finish}`} style={cellStyle}>{content}</div>;
              return (
                <div key={`${species}-${finish}`} style={cellStyle}>
                  {content}
                </div>
              );
            }),
          ])}
        </div>
      </div>
    </section>
  );
}

const headCellStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 10, color: DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, fontFamily: DT.sans, background: "rgba(0,0,0,0.02)" };
const rowHeadStyle: React.CSSProperties = { padding: "14px 12px", fontSize: 13, color: DT.textPrimary, fontWeight: 700, fontFamily: DT.sans, borderTop: `1px solid ${DT.border}`, background: DT.goldSoft };

function TopUpQueue({ cells }: { cells: SampleStockCell[] }) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontFamily: DT.serif, color: DT.textPrimary }}>Top-up queue</h2>
        <div style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans }}>Task trigger list</div>
      </div>
      {cells.length === 0 ? (
        <div style={{ fontSize: 13, color: DT.teal, fontFamily: DT.sans, padding: 10, background: DT.tealSoft, borderRadius: 8 }}>All sample stock cells are OK.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cells.map((cell) => (
            <div key={`${cell.sampleType}-${cell.species}-${cell.finish}`} style={{ textDecoration: "none", border: `1px solid ${DT.border}`, borderRadius: 10, padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", background: cell.level === "out" ? "rgba(153,27,27,0.035)" : "rgba(217,119,6,0.035)" }}>
              <div>
                <div style={{ fontSize: 13, color: DT.textPrimary, fontWeight: 700, fontFamily: DT.sans }}>{cell.sampleType}: {cell.species} / {cell.finish}</div>
                <div style={{ fontSize: 11, color: DT.textSecondary, fontFamily: DT.sans, marginTop: 2 }}>{cell.count === 0 ? "No stock ready" : `${cell.count} ready, top up soon`}</div>
              </div>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}><StatusPill level={cell.level} /><span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 700 }}>Tracked</span></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PromiseRule() {
  return (
    <section style={{ background: `linear-gradient(135deg, ${DT.cardBg} 0%, rgba(210,174,109,0.14) 100%)`, color: DT.textPrimary, border: `1px solid ${DT.border}`, borderRadius: DT.radius, padding: "14px 16px", boxShadow: DT.shadow }}>
      <div style={{ fontSize: 10, color: "#8a5b1f", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, fontFamily: DT.sans }}>Customer promise rule</div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
        <div style={ruleStyle}><strong>Full set ready</strong><span>Can confidently promise this week.</span></div>
        <div style={ruleStyle}><strong>Any key cell out</strong><span>Say following week unless workshop confirms.</span></div>
        <div style={ruleStyle}><strong>Low cells</strong><span>Use current pack, then create top-up task.</span></div>
      </div>
    </section>
  );
}

const ruleStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: DT.textSecondary, fontFamily: DT.sans, background: "rgba(255,255,255,0.58)", border: `1px solid ${DT.border}`, borderRadius: 10, padding: 12 };

export default function SampleStockClient({ board, syncedAt, source, mondayError }: { board: SampleStockBoard | null; syncedAt: string; source: string; mondayError?: string }) {
  const matrices = useMemo(() => SAMPLE_TYPES.map((sampleType) => ({ sampleType, cells: board?.cells.filter((c) => c.sampleType === sampleType) ?? [] })), [board]);

  return (
    <MissionControlShell
      section="samples"
      pageTitle="Sample Stock"
      pageSubtitle="Ready, low, and out sample stock by type, species, and finish"
      syncedAt={syncedAt}
      source={source}
      mondayError={mondayError}
    >
        <p style={{ margin: "-8px 0 18px", color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13 }}>Sample stock feed showing ready, low, and out pieces by type, species, and finish.</p>

        {board ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 14 }}>
              <Kpi label="Total pieces" value={board.summary.total} />
              <Kpi label="Out cells" value={board.summary.outCount} tone={board.summary.outCount ? "bad" : "good"} />
              <Kpi label="Low cells" value={board.summary.lowCount} tone={board.summary.lowCount ? "warn" : "good"} />
              <Kpi label="Ready full sets" value={`${board.summary.readyFullSets}/${SAMPLE_TYPES.length}`} tone={board.summary.readyFullSets === SAMPLE_TYPES.length ? "good" : "warn"} />
            </div>
            <PromiseRule />
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 0.9fr)", gap: 16, marginTop: 14, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {matrices.map((m) => <StockMatrix key={m.sampleType} title={m.sampleType} cells={m.cells} />)}
              </div>
              <TopUpQueue cells={board.summary.topUps} />
            </div>
          </>
        ) : (
          <div style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, padding: 20, color: DT.textSecondary, fontFamily: DT.sans }}>No sample stock data available. {mondayError && `(${mondayError})`}</div>
        )}
    </MissionControlShell>
  );
}
