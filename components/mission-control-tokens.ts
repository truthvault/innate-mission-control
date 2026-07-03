// Shared design tokens for Mission Control / Tuesday.
// This module must stay free of "use client" so BOTH server and client
// components get real values — importing constants from a client module
// into a server component silently breaks them.

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
  sans: "var(--font-sans, 'DM Sans'), -apple-system, BlinkMacSystemFont, sans-serif",
  serif: "var(--font-display, 'Fraunces'), Georgia, serif",
} as const;

export const DT = MC_COLORS;
