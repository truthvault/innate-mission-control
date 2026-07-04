'use client';

import type { CSSProperties, ReactNode } from "react";

import { MC_WIDTH, MC_COLORS, DT } from "@/components/mission-control-tokens";
export { MC_WIDTH, MC_COLORS, DT };

export type ChipTone = "neutral" | "amber" | "teal" | "red" | "grey" | "green";

export function chipColors(tone: ChipTone = "neutral") {
  return {
    neutral: { bg: "rgba(0,0,0,0.03)", color: DT.textMuted, border: "rgba(0,0,0,0.05)" },
    grey: { bg: "rgba(0,0,0,0.035)", color: DT.textMuted, border: "rgba(0,0,0,0.05)" },
    amber: { bg: DT.goldSoft, color: DT.goldInk, border: "rgba(200,169,110,0.28)" },
    red: { bg: "rgba(180,107,70,0.13)", color: DT.clay, border: "rgba(180,107,70,0.22)" },
    teal: { bg: DT.tealSoft, color: DT.teal, border: "rgba(79,95,168,0.18)" },
    green: { bg: DT.greenBg, color: DT.green, border: "rgba(79,127,89,0.18)" },
  }[tone];
}

export function Chip({ label, tone = "neutral", style }: { label: ReactNode; tone?: ChipTone; style?: CSSProperties }) {
  const colors = chipColors(tone);
  return (
    <span style={{ fontSize: 10, color: colors.color, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 14, padding: "2px 8px", fontWeight: 700, fontFamily: DT.sans, whiteSpace: "nowrap", ...style }}>
      {label}
    </span>
  );
}

export function OpenHint({ label = "Open source" }: { label?: string }) {
  return <span aria-hidden="true" style={{ fontSize: 10, color: DT.teal, fontFamily: DT.sans, fontWeight: 800, whiteSpace: "nowrap" }}>{label} ↗</span>;
}

export function KpiCard({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? DT.clay : tone === "warn" ? DT.goldInk : tone === "good" ? DT.green : DT.textPrimary;
  return (
    <div style={{ padding: "13px 15px", background: DT.cardBg, borderRadius: DT.radius, border: `1px solid ${DT.border}`, boxShadow: DT.shadow }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: DT.serif, marginTop: 3, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

export function TuesdayPageHeader({
  eyebrow,
  title,
  subtitle,
  accessory,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accessory?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      aria-label={`${title} page summary`}
      style={{
        border: `1px solid ${DT.border}`,
        borderRadius: compact ? 16 : 20,
        background: "linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,253,249,0.90) 56%, rgba(245,243,238,0.82) 100%)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.80) inset, 0 16px 38px rgba(34,32,26,0.075)",
        padding: compact ? "12px 13px" : "16px 18px",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0, flex: "1 1 420px" }}>
        {eyebrow && (
          <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 900, letterSpacing: "0.11em", textTransform: "uppercase", color: DT.textFaint }}>
            {eyebrow}
          </div>
        )}
        <h1 style={{ margin: "3px 0 0", fontFamily: DT.serif, fontSize: compact ? 26 : 32, lineHeight: 1.03, letterSpacing: "-0.045em", color: DT.textPrimary }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ margin: "7px 0 0", maxWidth: 760, fontFamily: DT.sans, fontSize: compact ? 12 : 13, lineHeight: 1.42, color: DT.textSecondary, fontWeight: 700 }}>
            {subtitle}
          </p>
        )}
      </div>
      {accessory && <div style={{ flex: "0 1 auto", minWidth: 0 }}>{accessory}</div>}
    </section>
  );
}
