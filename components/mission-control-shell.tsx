'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useEffect, useState, useTransition } from "react";
import { DT, MC_WIDTH } from "@/components/mission-control-ui";
import { tuesdayNavigationSections, type TuesdaySectionKey } from "@/lib/tuesday/sections";

export type MissionControlSection = TuesdaySectionKey | "plan" | "samples" | "dispatch" | "test";

type MissionControlNavItem = {
  section: TuesdaySectionKey;
  label: string;
  href?: string;
  status: "live" | "planned" | "disabled";
};

const NAV: MissionControlNavItem[] = tuesdayNavigationSections.map((item) => ({
  section: item.key,
  label: item.shortLabel || item.label,
  href: item.href,
  status: item.status,
}));

const PRODUCTION_SECTIONS: MissionControlSection[] = ["orders", "production", "plan", "samples", "dispatch", "test"];

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function scopeFor(section: MissionControlSection): string {
  if (section === "leads") return "leads";
  if (section === "plan" || section === "production") return "plan";
  if (section === "samples") return "samples";
  if (section === "test") return "orders";
  return "orders";
}

function navItemIsActive(section: MissionControlSection, pathname: string, item: MissionControlNavItem): boolean {
  if (item.section === "production") return PRODUCTION_SECTIONS.includes(section) || pathname.startsWith("/production/plan");
  if (item.section === "stock") return section === "samples" || pathname.startsWith("/production/samples");
  return item.section === section || pathname === item.href;
}

function SyncBadge({ syncedAt, source, mondayError, isNarrow = false }: { syncedAt: string; source: string; mondayError?: string; isNarrow?: boolean }) {
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const mountId = window.setTimeout(() => setMounted(true), 0);
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      window.clearTimeout(mountId);
      clearInterval(id);
    };
  }, []);
  void tick;
  const stale = source === "snapshot" || source === "none";
  const ageLabel = mounted ? relativeAge(syncedAt) : "recently";
  return (
    <div
      title={mondayError ? `Sync error: ${mondayError}` : `Synced at ${syncedAt}`}
      style={{
        fontSize: 10,
        color: stale ? "#d97706" : "rgba(210,174,109,0.92)",
        fontFamily: DT.sans,
        lineHeight: 1.3,
        whiteSpace: isNarrow ? "normal" : "nowrap",
        maxWidth: isNarrow ? "100%" : 230,
        overflow: "hidden",
        textOverflow: isNarrow ? "clip" : "ellipsis",
      }}
    >
      {stale ? "Stale · " : "Synced "}{ageLabel}
    </div>
  );
}

function useIsNarrow(breakpoint = 1120) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < breakpoint);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

function TuesdayMark() {
  const capsule = (background: string, width: number, rotate: number, left: number, top: number) => (
    <span
      style={{
        position: "absolute",
        width,
        height: 9,
        left,
        top,
        borderRadius: 999,
        background,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 4px 10px rgba(0,0,0,0.14)",
      }}
    />
  );
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: 36,
        height: 36,
        flex: "0 0 auto",
        borderRadius: 14,
        background: "linear-gradient(145deg, rgba(255,253,249,0.13), rgba(210,174,109,0.10))",
        border: "1px solid rgba(210,174,109,0.22)",
        overflow: "hidden",
      }}
    >
      {capsule(DT.clay, 22, -18, 5, 9)}
      {capsule(DT.gold, 23, -18, 7, 16)}
      {capsule(DT.sage, 22, -18, 9, 23)}
      <span style={{ position: "absolute", width: 7, height: 7, right: 7, top: 6, borderRadius: 999, background: DT.teal }} />
    </div>
  );
}

function TuesdayBrand({ syncedAt, source, mondayError, isNarrow = false }: { syncedAt: string; source: string; mondayError?: string; isNarrow?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, width: isNarrow ? "100%" : 300, minWidth: 0, flex: isNarrow ? "1 1 auto" : "0 0 300px" }}>
      <TuesdayMark />
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, lineHeight: 1 }}>
          <div style={{ fontSize: 23, fontWeight: 800, color: "#fff", fontFamily: DT.serif, letterSpacing: "-0.045em" }}>Tuesday</div>
        </div>
        <SyncBadge syncedAt={syncedAt} source={source} mondayError={mondayError} isNarrow={isNarrow} />
      </div>
    </div>
  );
}

function RefreshButton({ section }: { section: MissionControlSection }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  const onClick = async () => {
    setErr(null);
    setRefreshed(false);
    try {
      const scope = scopeFor(section);
      if (scope === "leads") {
        setRefreshed(true);
        window.setTimeout(() => setRefreshed(false), 5000);
        startTransition(() => router.refresh());
        return;
      }
      const url = scope === "orders" ? "/api/monday/refresh" : `/api/monday/refresh?scope=${scope}`;
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "Refresh failed");
      setRefreshed(true);
      window.setTimeout(() => setRefreshed(false), 5000);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {err && <span style={{ fontSize: 10, color: "#fca5a5", fontFamily: DT.sans }} title={err}>Refresh error</span>}
      {refreshed && !err && <span style={{ fontSize: 10, color: DT.gold, fontFamily: DT.sans }}>Refreshed just now</span>}
      <button
        onClick={onClick}
        disabled={isPending}
        style={{
          padding: "6px 12px",
          borderRadius: 999,
          background: DT.gold,
          color: DT.headerBg,
          border: "none",
          fontWeight: 700,
          fontSize: 11,
          cursor: isPending ? "wait" : "pointer",
          fontFamily: DT.sans,
          letterSpacing: "0.02em",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}

export function MissionControlShell({
  section,
  pageTitle,
  pageSubtitle,
  syncedAt,
  source,
  mondayError,
  children,
  pageTitleAccessory,
  maxWidth = MC_WIDTH,
  showRefresh = true,
}: {
  section: MissionControlSection;
  pageTitle: string;
  pageSubtitle?: string;
  syncedAt: string;
  source: string;
  mondayError?: string;
  children: ReactNode;
  pageTitleAccessory?: ReactNode;
  maxWidth?: number;
  showRefresh?: boolean;
}) {
  const pathname = usePathname();
  const isNarrow = useIsNarrow();
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top left, rgba(210,174,109,0.16), transparent 32%), radial-gradient(circle at top right, rgba(79,95,168,0.08), transparent 30%), ${DT.pageBg}`, fontFamily: DT.sans }}>
      <header style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ background: `linear-gradient(135deg, ${DT.headerBg} 0%, ${DT.headerBg2} 58%, ${DT.headerBg3} 100%)`, padding: isNarrow ? "10px 12px" : "10px 22px", display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "300px minmax(620px, 1fr) 150px", alignItems: "center", gap: isNarrow ? 8 : 16, boxShadow: "0 12px 30px rgba(44,37,32,0.20)", overflowX: "hidden" }}>
          <TuesdayBrand syncedAt={syncedAt} source={source} mondayError={mondayError} isNarrow={isNarrow} />
          <nav style={{ display: "flex", alignItems: "center", justifyContent: isNarrow ? "flex-start" : "center", gap: 6, flexWrap: "nowrap", overflowX: isNarrow ? "auto" : "visible", paddingBottom: isNarrow ? 2 : 0, WebkitOverflowScrolling: "touch" }} aria-label="Mission Control sections">
            {NAV.map((item) => {
              const active = navItemIsActive(section, pathname, item);
              const planned = item.status !== "live" || !item.href;
              const itemStyle: CSSProperties = {
                color: active ? DT.headerBg : "rgba(255,255,255,0.74)",
                background: active ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.055)",
                border: active ? "1px solid rgba(210,174,109,0.36)" : "1px solid rgba(210,174,109,0.12)",
                boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.12)" : "none",
                borderRadius: 999,
                padding: "6px 11px",
                minWidth: item.section === "production" ? 96 : item.section === "suppliers" ? 92 : 68,
                fontSize: 11,
                textDecoration: "none",
                fontFamily: DT.sans,
                fontWeight: 700,
                letterSpacing: "0.01em",
                textAlign: "center",
                opacity: planned ? 0.62 : 1,
                cursor: planned ? "default" : "pointer",
                whiteSpace: "nowrap",
              };
              if (planned) {
                return <span key={item.section} title="Planned Tuesday section" style={itemStyle}>{item.label}</span>;
              }
              return <Link key={item.section} href={item.href || "/"} style={itemStyle}>{item.label}</Link>;
            })}
          </nav>
          <div style={{ justifySelf: isNarrow ? "start" : "end" }}>{showRefresh && <RefreshButton section={section} />}</div>
        </div>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${DT.clay} 0%, ${DT.gold} 38%, ${DT.sage} 72%, ${DT.teal} 100%)` }} />
      </header>
      <main style={{ maxWidth, margin: "0 auto", padding: isNarrow ? "14px 12px 28px" : "18px 20px 22px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: isNarrow ? 28 : 32, lineHeight: 1.05, letterSpacing: "-0.04em", flex: "0 0 auto" }}>{pageTitle}</h1>
            {pageTitleAccessory && <div style={{ flex: "1 1 560px", minWidth: isNarrow ? "100%" : 420 }}>{pageTitleAccessory}</div>}
          </div>
          {pageSubtitle && <p style={{ margin: "7px 0 0", color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13 }}>{pageSubtitle}</p>}
        </div>
        {children}
      </main>
      <footer style={{ textAlign: "center", padding: 20, fontSize: 10, color: DT.textFaint, fontFamily: DT.sans }}>Tuesday</footer>
    </div>
  );
}
