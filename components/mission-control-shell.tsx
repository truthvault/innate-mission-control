'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { DT, MC_WIDTH } from "@/components/mission-control-ui";

export type MissionControlSection = "orders" | "leads" | "calls" | "workboard" | "plan" | "samples" | "stock" | "dispatch" | "test" | "quoting" | "costings" | "processTemplates";

const NAV: Array<{ section: MissionControlSection; label: string; href: string }> = [
  { section: "plan", label: "Production Plan", href: "/production/plan" },
  { section: "stock", label: "Stock", href: "/production/stock" },
  { section: "samples", label: "Samples", href: "/production/samples" },
  { section: "processTemplates", label: "Processes", href: "/production/plan?view=process-templates" },
];
const GUIDO_NAV: Array<{ section: MissionControlSection; label: string; href: string }> = [
  { section: "leads", label: "Leads", href: "/leads" },
  { section: "workboard", label: "Workboard", href: "/workboard" },
  { section: "quoting", label: "Quoting", href: "/quoting" },
  { section: "costings", label: "Costings", href: "/costings" },
  { section: "calls", label: "Calls", href: "/call-intelligence" },
];
const ALL_NAV = [...NAV, ...GUIDO_NAV];

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
  if (section === "leads" || section === "calls" || section === "workboard" || section === "quoting" || section === "costings" || section === "processTemplates" || section === "stock") return "local";
  if (section === "plan") return "plan";
  if (section === "samples") return "samples";
  if (section === "test") return "orders";
  return "orders";
}

function navItemActive(
  item: { section: MissionControlSection; href: string },
  section: MissionControlSection,
  pathname: string | null
) {
  if (item.section === section) return true;
  if (section === "processTemplates" && item.section === "plan") return false;
  if (item.href.includes("?")) return false;
  return pathname === item.href;
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

function useIsNarrow(breakpoint = 760) {
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
    <div style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", maxWidth: isNarrow ? undefined : 300, minWidth: 0, flex: isNarrow ? "1 1 auto" : "0 1 300px" }}>
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

function RefreshButton({ section, compact = false }: { section: MissionControlSection; compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  const onClick = async () => {
    setErr(null);
    setRefreshed(false);
    try {
      const scope = scopeFor(section);
      if (scope === "local") {
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
  const actionLabel = section === "processTemplates" ? "Reload" : "Refresh";
  const refreshedLabel = section === "processTemplates" ? "Reloaded just now" : "Refreshed just now";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 8 }}>
      {!compact && err && <span style={{ fontSize: 10, color: "#fca5a5", fontFamily: DT.sans }} title={err}>Refresh error</span>}
      {!compact && refreshed && !err && <span style={{ fontSize: 10, color: DT.gold, fontFamily: DT.sans }}>{refreshedLabel}</span>}
      <button
        onClick={onClick}
        disabled={isPending}
        aria-label={compact ? `${actionLabel} Tuesday` : undefined}
        title={compact ? err || (refreshed ? refreshedLabel : `${actionLabel} Tuesday`) : undefined}
        style={{
          minWidth: compact ? 72 : undefined,
          minHeight: compact ? 40 : undefined,
          padding: compact ? "0 12px" : "6px 12px",
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
        {compact ? (isPending ? "..." : actionLabel) : isPending ? `${actionLabel}ing...` : actionLabel}
      </button>
    </div>
  );
}

function MobileManagementMenu({ section, pathname }: { section: MissionControlSection; pathname: string | null }) {
  return (
    <details style={{ position: "relative", justifySelf: "end", zIndex: 1200 }}>
      <summary style={{ listStyle: "none", border: "1px solid rgba(210,174,109,0.24)", background: "rgba(255,253,249,0.08)", color: "rgba(255,255,255,0.90)", borderRadius: 999, minHeight: 40, padding: "0 13px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 950, fontFamily: DT.sans, cursor: "pointer", whiteSpace: "nowrap" }}>
        Menu
      </summary>
      <div style={{ position: "absolute", top: 44, right: 0, minWidth: 188, padding: 7, border: "1px solid rgba(210,174,109,0.22)", borderRadius: 14, background: DT.headerBg2, boxShadow: "0 16px 36px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", gap: 5, zIndex: 1201 }}>
        {ALL_NAV.map((item) => {
          const active = navItemActive(item, section, pathname);
          return (
            <Link key={item.section} href={item.href} style={{ color: active ? DT.headerBg : "rgba(255,255,255,0.86)", background: active ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.07)", border: active ? "1px solid rgba(210,174,109,0.34)" : "1px solid rgba(210,174,109,0.12)", borderRadius: 10, minHeight: 40, padding: "0 11px", display: "flex", alignItems: "center", fontSize: 12, textDecoration: "none", fontFamily: DT.sans, fontWeight: 900 }}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}

function GuidoMenu({ section, pathname }: { section: MissionControlSection; pathname: string | null }) {
  const active = GUIDO_NAV.some((item) => navItemActive(item, section, pathname));
  return (
    <details style={{ position: "relative", zIndex: 1200 }}>
      <summary style={{
        listStyle: "none",
        color: active ? DT.headerBg : "rgba(255,255,255,0.74)",
        background: active ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.055)",
        border: active ? "1px solid rgba(210,174,109,0.36)" : "1px solid rgba(210,174,109,0.12)",
        boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.12)" : "none",
        borderRadius: 999,
        padding: "6px 12px",
        minWidth: 74,
        fontSize: 11,
        fontFamily: DT.sans,
        fontWeight: 700,
        letterSpacing: "0.01em",
        textAlign: "center",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}>
        Guido ▾
      </summary>
      <div style={{ position: "absolute", top: 34, left: "50%", transform: "translateX(-50%)", minWidth: 156, padding: 6, border: "1px solid rgba(210,174,109,0.22)", borderRadius: 14, background: DT.headerBg2, boxShadow: "0 16px 36px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", gap: 4, zIndex: 1201 }}>
        {GUIDO_NAV.map((item) => {
          const itemActive = navItemActive(item, section, pathname);
          return (
            <Link key={item.section} href={item.href} style={{ color: itemActive ? DT.headerBg : "rgba(255,255,255,0.84)", background: itemActive ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.07)", border: itemActive ? "1px solid rgba(210,174,109,0.34)" : "1px solid rgba(210,174,109,0.12)", borderRadius: 10, padding: "8px 10px", fontSize: 11, textDecoration: "none", fontFamily: DT.sans, fontWeight: 850 }}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </details>
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
}) {
  const pathname = usePathname();
  const isNarrow = useIsNarrow();
  const compactMobile = isNarrow;
  const compactPlanMobile = compactMobile && section === "plan";
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top left, rgba(210,174,109,0.16), transparent 32%), radial-gradient(circle at top right, rgba(79,95,168,0.08), transparent 30%), ${DT.pageBg}`, fontFamily: DT.sans }}>
      <style>{`
          .mc-mobile-only { display: none; }
          @media (max-width: 759px) {
            .mc-mobile-only { display: flex; }
            .mc-mobile-hide { display: none !important; }
            .mc-mobile-grid { grid-template-columns: minmax(0, 1fr) auto !important; padding: 8px 10px !important; }
            .mc-plan-mobile-main { padding: 8px 8px 24px !important; }
            .mc-plan-mobile-title-wrap { margin-bottom: 8px !important; }
            .production-plan-layout-grid { display: flex !important; flex-direction: column !important; gap: 8px !important; }
            [data-order-row-week-grid] { grid-template-columns: 1fr !important; }
            [data-mobile-crew-pill="crew-filter"] { gap: 0 !important; flex-wrap: nowrap !important; border: 1px solid rgba(0,0,0,0.06) !important; border-radius: 999px !important; background: rgba(255,255,255,0.78) !important; padding: 2px !important; overflow: hidden !important; width: 100% !important; }
            [data-mobile-crew-pill="crew-filter"] > button { min-width: 0 !important; flex: 1 1 0 !important; border: 0 !important; padding: 6px 8px !important; }
            [data-mobile-crew-pill="crew-filter"] > button span:nth-child(2), [data-mobile-crew-pill="crew-filter"] > button + button + button + button { display: none !important; }
            .plan-schedule-desktop-label { display: none; }
            .plan-schedule-mobile-label { display: inline; }
          }
          @media (min-width: 760px) {
            .plan-schedule-desktop-label { display: inline; }
            .plan-schedule-mobile-label { display: none; }
          }
        `}</style>
      <header style={{ position: "sticky", top: 0, zIndex: 1000 }}>
        <div className="mc-mobile-grid" style={{ background: `linear-gradient(135deg, ${DT.headerBg} 0%, ${DT.headerBg2} 58%, ${DT.headerBg3} 100%)`, padding: isNarrow ? "8px 10px" : "10px 22px", display: "grid", gridTemplateColumns: isNarrow ? "1fr auto" : "minmax(220px, 300px) minmax(0, 1fr) auto", alignItems: "center", gap: isNarrow ? 8 : 16, boxShadow: "0 12px 30px rgba(44,37,32,0.20)", overflow: "visible" }}>
          <TuesdayBrand syncedAt={syncedAt} source={source} mondayError={mondayError} isNarrow={isNarrow} />
          {compactMobile && (
            <div className="mc-mobile-only" style={{ alignItems: "center", gap: 7 }}>
              <RefreshButton section={section} compact />
              <MobileManagementMenu section={section} pathname={pathname} />
            </div>
          )}
          {compactMobile ? null : <nav className="mc-mobile-hide" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "nowrap", overflowX: "visible", paddingBottom: 0, WebkitOverflowScrolling: "touch" }} aria-label="Mission Control sections">
            {NAV.map((item) => {
              const active = navItemActive(item, section, pathname);
              return (
                <Link
                  key={item.section}
                  href={item.href}
                  style={{
                    color: active ? DT.headerBg : "rgba(255,255,255,0.74)",
                    background: active ? `linear-gradient(135deg, ${DT.gold}, ${DT.sage})` : "rgba(255,253,249,0.055)",
                    border: active ? "1px solid rgba(210,174,109,0.36)" : "1px solid rgba(210,174,109,0.12)",
                    boxShadow: active ? "0 0 0 1px rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.12)" : "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    minWidth: item.section === "dispatch" ? 92 : item.section === "plan" ? 124 : item.section === "processTemplates" ? 92 : 74,
                    fontSize: 11,
                    textDecoration: "none",
                    fontFamily: DT.sans,
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
            <GuidoMenu section={section} pathname={pathname} />
          </nav>}
          {!compactMobile && <div className="mc-mobile-hide" style={{ justifySelf: "end" }}><RefreshButton section={section} /></div>}
        </div>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${DT.clay} 0%, ${DT.gold} 38%, ${DT.sage} 72%, ${DT.teal} 100%)` }} />
      </header>
      <main className={section === "plan" ? "mc-plan-mobile-main" : undefined} style={{ maxWidth, margin: "0 auto", padding: isNarrow ? compactPlanMobile ? "8px 8px 24px" : "14px 12px 28px" : "18px 20px 22px" }}>
        <div className={section === "plan" ? "mc-plan-mobile-title-wrap" : undefined} style={{ marginBottom: compactPlanMobile ? 8 : 14 }}>
          <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            {pageTitle && !compactPlanMobile && <h1 className={section === "plan" ? "mc-plan-mobile-hide" : undefined} style={{ margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: isNarrow ? 28 : 32, lineHeight: 1.05, letterSpacing: "-0.04em", flex: "0 0 auto" }}>{pageTitle}</h1>}
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
