'use client';

import type { CSSProperties, ReactNode } from "react";

export const MC_WIDTH = 1240;

export const MC_COLORS = {
  pageBg: "#f5f3ee",
  cardBg: "#ffffff",
  headerBg: "#1a1a1a",
  headerBg2: "#27221b",
  headerBg3: "#141210",
  teal: "#0c7c7a",
  tealSoft: "rgba(12,124,122,0.08)",
  gold: "#c8a96e",
  goldSoft: "rgba(200,169,110,0.10)",
  clay: "#9a3b2f",
  sage: "#6e8a6a",
  textPrimary: "#22201a",
  textSecondary: "#5a5549",
  textMuted: "#7c746b",
  textFaint: "#9a9088",
  green: "#4f7f59",
  greenBg: "rgba(79,127,89,0.12)",
  border: "rgba(0,0,0,0.06)",
  shadow: "0 1px 3px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
  shadowHover: "0 2px 8px rgba(0,0,0,0.07), 0 14px 36px rgba(0,0,0,0.08)",
  radius: 14,
  radiusSm: 8,
  sans: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "'Fraunces', Georgia, serif",
} as const;

export const DT = MC_COLORS;

export type ChipTone = "neutral" | "amber" | "teal" | "red" | "grey" | "green";

export function chipColors(tone: ChipTone = "neutral") {
  return {
    neutral: { bg: "rgba(0,0,0,0.03)", color: DT.textMuted, border: "rgba(0,0,0,0.05)" },
    grey: { bg: "rgba(0,0,0,0.035)", color: DT.textMuted, border: "rgba(0,0,0,0.05)" },
    amber: { bg: DT.goldSoft, color: "#8a5b1f", border: "rgba(210,174,109,0.28)" },
    red: { bg: "rgba(180,107,70,0.13)", color: "#8f3f24", border: "rgba(180,107,70,0.22)" },
    teal: { bg: DT.tealSoft, color: DT.teal, border: "rgba(79,95,168,0.18)" },
    green: { bg: DT.greenBg, color: DT.green, border: "rgba(79,127,89,0.18)" },
  }[tone];
}

export function Chip({ label, tone = "neutral", style }: { label: ReactNode; tone?: ChipTone; style?: CSSProperties }) {
  const colors = chipColors(tone);
  return (
    <span style={{ fontSize: 10, color: colors.color, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 20, padding: "2px 8px", fontWeight: 700, fontFamily: DT.sans, whiteSpace: "nowrap", ...style }}>
      {label}
    </span>
  );
}

export function OpenHint({ label = "Open source" }: { label?: string }) {
  return <span aria-hidden="true" style={{ fontSize: 10, color: DT.teal, fontFamily: DT.sans, fontWeight: 800, whiteSpace: "nowrap" }}>{label} ↗</span>;
}

export function KpiCard({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "bad" | "warn" | "good" }) {
  const color = tone === "bad" ? "#8f3f24" : tone === "warn" ? "#8a5b1f" : tone === "good" ? DT.green : DT.textPrimary;
  return (
    <div style={{ padding: "13px 15px", background: DT.cardBg, borderRadius: DT.radius, border: `1px solid ${DT.border}`, boxShadow: DT.shadow }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: DT.serif, marginTop: 3, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
