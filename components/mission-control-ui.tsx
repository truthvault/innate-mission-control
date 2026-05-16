'use client';

import type { CSSProperties, ReactNode } from "react";

export const MC_WIDTH = 1240;

export const MC_COLORS = {
  pageBg: "#f8f5ee",
  cardBg: "#fffdf9",
  headerBg: "#24201c",
  headerBg2: "#302920",
  headerBg3: "#191714",
  teal: "#4f5fa8",
  tealSoft: "rgba(79,95,168,0.09)",
  gold: "#d2ae6d",
  goldSoft: "rgba(210,174,109,0.14)",
  clay: "#b46b46",
  sage: "#6e8a6a",
  textPrimary: "#2c2520",
  textSecondary: "#5d554c",
  textMuted: "#81766c",
  textFaint: "#aaa097",
  green: "#4f7f59",
  greenBg: "rgba(79,127,89,0.12)",
  border: "rgba(44,37,32,0.09)",
  shadow: "0 1px 2px rgba(44,37,32,0.04), 0 10px 28px rgba(44,37,32,0.05)",
  shadowHover: "0 2px 8px rgba(44,37,32,0.07), 0 14px 36px rgba(44,37,32,0.08)",
  radius: 16,
  radiusSm: 10,
  sans: "var(--font-sans), 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "var(--font-display), 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
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
