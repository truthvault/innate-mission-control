import Link from "next/link";
import type { ReactNode } from "react";
import { DT } from "@/components/mission-control-tokens";

/**
 * Light chrome for the workshop screens. Deliberately not MissionControlShell:
 * the workshop contract is low-noise, tablet-first, and Supabase-only.
 */
export function WorkshopShell({
  active,
  title,
  subtitle,
  children,
}: {
  active: "week" | "orders" | "today";
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const tabs = [
    { key: "week", label: "Week", href: "/workshop" },
    { key: "orders", label: "Orders", href: "/workshop/orders" },
    { key: "today", label: "Today", href: "/workshop/today" },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: DT.pageBg, color: DT.textPrimary, fontFamily: DT.sans }}>
      <header
        style={{
          background: DT.headerBg,
          color: DT.cardBg,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <Link href="/workshop" style={{ color: DT.cardBg, textDecoration: "none", fontFamily: DT.serif, fontSize: 18, fontWeight: 600 }}>
          Tuesday <span style={{ color: DT.gold }}>Workshop</span>
        </Link>
        <nav style={{ display: "flex", gap: 6 }}>
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              style={{
                color: tab.key === active ? DT.headerBg : "rgba(255,255,255,0.85)",
                background: tab.key === active ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.08)",
                border: "1px solid rgba(200,169,110,0.18)",
                borderRadius: 8,
                minHeight: 40,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                fontSize: 13,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/production/plan"
          style={{ marginLeft: "auto", color: "rgba(255,255,255,0.55)", fontSize: 11, textDecoration: "none", fontWeight: 700 }}
        >
          Mission Control →
        </Link>
      </header>
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 14px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <h1 style={{ fontFamily: DT.serif, fontSize: 26, fontWeight: 600, margin: 0 }}>{title}</h1>
          {subtitle ? <span style={{ color: DT.textMuted, fontSize: 13 }}>{subtitle}</span> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
