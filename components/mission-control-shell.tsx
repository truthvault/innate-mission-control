'use client';

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DT, MC_WIDTH } from "@/components/mission-control-ui";

export type MissionControlSection = "orders" | "leads" | "calls" | "plan" | "samples" | "stock" | "dispatch" | "test" | "quoting" | "costings" | "processTemplates" | "freight" | "configurator" | "today" | "workshop";

type NavItem = { section: MissionControlSection; label: string; href: string; group?: "Control" | "Sales" | "Ops" | "Drafts" };

const NAV: NavItem[] = [
  { section: "plan", label: "Orders", href: "/production/plan" },
  { section: "stock", label: "Stock", href: "/production/stock" },
  { section: "samples", label: "Samples", href: "/production/samples" },
  { section: "processTemplates", label: "Processes", href: "/production/plan?view=process-templates" },
];
const GUIDO_NAV: NavItem[] = [
  { section: "today", label: "Today / America Mode", href: "/today", group: "Control" },
  { section: "leads", label: "Leads", href: "/leads", group: "Sales" },
  { section: "quoting", label: "Quoting", href: "/quoting", group: "Sales" },
  { section: "costings", label: "Costings", href: "/costings", group: "Sales" },
  { section: "freight", label: "Freight quotes", href: "/freight-quotes", group: "Ops" },
  { section: "configurator", label: "Configurator", href: "/configurator", group: "Drafts" },
  { section: "calls", label: "Calls", href: "/call-intelligence", group: "Drafts" },
  { section: "test", label: "Test job", href: "/production/test", group: "Drafts" },
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
  if (["leads", "calls", "quoting", "costings", "processTemplates", "stock", "freight", "configurator", "today"].includes(section)) return "local";
  if (section === "plan") return "plan";
  if (section === "samples") return "samples";
  if (section === "test") return "orders";
  return "orders";
}

function autoRefreshEnabledFor(section: MissionControlSection) {
  const scope = scopeFor(section);
  return scope === "plan" || scope === "orders" || scope === "samples";
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
        fontSize: isNarrow ? 9 : 10,
        color: stale ? "#fbbf24" : "rgba(255,255,255,0.64)",
        fontFamily: DT.sans,
        lineHeight: isNarrow ? 1.05 : 1.3,
        whiteSpace: isNarrow ? "nowrap" : "nowrap",
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

function TuesdayMark({ compact = false }: { compact?: boolean }) {
  const scale = compact ? 0.78 : 1;
  const capsule = (background: string, width: number, rotate: number, left: number, top: number) => (
    <span
      style={{
        position: "absolute",
        width: Math.round(width * scale),
        height: Math.round(9 * scale),
        left: Math.round(left * scale),
        top: Math.round(top * scale),
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
        width: compact ? 24 : 36,
        height: compact ? 24 : 36,
        flex: "0 0 auto",
        borderRadius: compact ? 10 : 14,
        background: "linear-gradient(145deg, rgba(255,253,249,0.13), rgba(210,174,109,0.10))",
        border: "1px solid rgba(210,174,109,0.22)",
        overflow: "hidden",
      }}
    >
      {capsule(DT.clay, 22, -18, 5, 9)}
      {capsule(DT.gold, 23, -18, 7, 16)}
      {capsule(DT.sage, 22, -18, 9, 23)}
      <span style={{ position: "absolute", width: compact ? 5 : 7, height: compact ? 5 : 7, right: compact ? 5 : 7, top: compact ? 5 : 6, borderRadius: 999, background: DT.teal }} />
    </div>
  );
}

function TuesdayBrand({ syncedAt, source, mondayError, isNarrow = false }: { syncedAt: string; source: string; mondayError?: string; isNarrow?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: isNarrow ? 7 : 10, width: "100%", maxWidth: isNarrow ? undefined : 220, minWidth: 0, flex: isNarrow ? "1 1 auto" : "0 1 220px" }}>
      <TuesdayMark compact={isNarrow} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, lineHeight: 1 }}>
          <div style={{ fontSize: isNarrow ? 17 : 21, fontWeight: 800, color: "#fff", fontFamily: DT.serif, letterSpacing: "-0.045em" }}>Tuesday</div>
        </div>
        {!isNarrow && <SyncBadge syncedAt={syncedAt} source={source} mondayError={mondayError} />}
      </div>
    </div>
  );
}

function RefreshButton({ section, compact = false }: { section: MissionControlSection; compact?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const clearRefreshedTimer = useRef<number | null>(null);
  const autoRefreshInFlight = useRef(false);
  const autoRefreshEnabled = autoRefreshEnabledFor(section);

  const markRefreshed = useCallback(() => {
    setRefreshed(true);
    if (clearRefreshedTimer.current) window.clearTimeout(clearRefreshedTimer.current);
    clearRefreshedTimer.current = window.setTimeout(() => setRefreshed(false), 5000);
  }, []);

  const runRefresh = useCallback(async ({ automatic = false } = {}) => {
    if (automatic) {
      if (!autoRefreshEnabled || autoRefreshInFlight.current || document.visibilityState !== "visible") return;
      autoRefreshInFlight.current = true;
    }
    setErr(null);
    if (!automatic) setRefreshed(false);
    try {
      const scope = scopeFor(section);
      if (scope === "local") {
        if (!automatic) markRefreshed();
        startTransition(() => router.refresh());
        return;
      }
      const url = scope === "orders" ? "/api/monday/refresh" : `/api/monday/refresh?scope=${scope}`;
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "Refresh failed");
      markRefreshed();
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (automatic) autoRefreshInFlight.current = false;
    }
  }, [autoRefreshEnabled, markRefreshed, router, section, startTransition]);

  useEffect(() => {
    return () => {
      if (clearRefreshedTimer.current) window.clearTimeout(clearRefreshedTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const intervalId = window.setInterval(() => {
      void runRefresh({ automatic: true });
    }, 180_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void runRefresh({ automatic: true });
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [autoRefreshEnabled, runRefresh]);

  const onClick = () => {
    void runRefresh();
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
          minWidth: compact ? 42 : undefined,
          minHeight: compact ? 32 : undefined,
          padding: compact ? "0 9px" : "7px 11px",
          borderRadius: 999,
          background: compact ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.84)",
          border: "1px solid rgba(255,255,255,0.12)",
          fontWeight: 760,
          fontSize: compact ? 10 : 11,
          cursor: isPending ? "wait" : "pointer",
          fontFamily: DT.sans,
          letterSpacing: "0.01em",
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {compact ? (isPending ? "..." : "↻") : isPending ? `${actionLabel}ing...` : actionLabel}
      </button>
    </div>
  );
}

function MobileManagementMenu({ section, pathname }: { section: MissionControlSection; pathname: string | null }) {
  return (
    <details style={{ position: "relative", justifySelf: "end", zIndex: 1200 }}>
      <summary style={{ listStyle: "none", border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.90)", borderRadius: 999, minHeight: 32, padding: "0 10px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 850, fontFamily: DT.sans, cursor: "pointer", whiteSpace: "nowrap" }}>
        Menu
      </summary>
      <div style={{ position: "absolute", top: 36, right: 0, minWidth: 188, padding: 7, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 16, background: "rgba(33,31,29,0.96)", boxShadow: "0 18px 44px rgba(0,0,0,0.30)", display: "flex", flexDirection: "column", gap: 5, zIndex: 1201, backdropFilter: "blur(18px)" }}>
        {ALL_NAV.map((item) => {
          const active = navItemActive(item, section, pathname);
          return (
            <Link key={item.section} href={item.href} style={{ color: active ? "#fff" : "rgba(255,255,255,0.84)", background: active ? "rgba(255,255,255,0.14)" : "transparent", border: active ? "1px solid rgba(255,255,255,0.16)" : "1px solid transparent", borderRadius: 10, minHeight: 40, padding: "0 11px", display: "flex", alignItems: "center", fontSize: 12, textDecoration: "none", fontFamily: DT.sans, fontWeight: active ? 900 : 760 }}>
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
        color: active ? "#fff" : "rgba(255,255,255,0.78)",
        background: active ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.055)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.04)" : "none",
        borderRadius: 999,
        padding: "7px 12px",
        minWidth: 72,
        fontSize: 11,
        fontFamily: DT.sans,
        fontWeight: 780,
        letterSpacing: "0.01em",
        textAlign: "center",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}>
        Guido ▾
      </summary>
      <div style={{ position: "absolute", top: 38, right: 0, minWidth: 210, padding: 7, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 16, background: "rgba(33,31,29,0.96)", boxShadow: "0 18px 44px rgba(0,0,0,0.30)", display: "flex", flexDirection: "column", gap: 4, zIndex: 1201, backdropFilter: "blur(18px)" }}>
        {GUIDO_NAV.map((item, index) => {
          const itemActive = navItemActive(item, section, pathname);
          const showGroup = item.group && (index === 0 || GUIDO_NAV[index - 1]?.group !== item.group);
          return (
            <div key={item.section} style={{ display: "grid", gap: 4 }}>
              {showGroup && <div style={{ padding: "5px 8px 1px", color: "rgba(255,255,255,0.42)", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>{item.group}</div>}
              <Link href={item.href} style={{ color: itemActive ? "#fff" : "rgba(255,255,255,0.84)", background: itemActive ? "rgba(255,255,255,0.14)" : "transparent", border: itemActive ? "1px solid rgba(255,255,255,0.16)" : "1px solid transparent", borderRadius: 10, padding: "8px 10px", fontSize: 11, textDecoration: "none", fontFamily: DT.sans, fontWeight: itemActive ? 900 : 760 }}>
                {item.label}
              </Link>
            </div>
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
    <div style={{ minHeight: "100vh", background: `radial-gradient(circle at top left, rgba(210,174,109,0.16), transparent 32%), radial-gradient(circle at top right, rgba(12,124,122,0.075), transparent 30%), ${DT.pageBg}`, fontFamily: DT.sans }}>
      <style>{`
          .mc-mobile-only { display: none; }
          @media (max-width: 759px) {
            .mc-mobile-only { display: flex; }
            .mc-mobile-hide { display: none !important; }
            .mc-mobile-grid { grid-template-columns: minmax(0, 1fr) auto !important; padding: 3px calc(10px + env(safe-area-inset-right, 0px)) 3px calc(6px + env(safe-area-inset-left, 0px)) !important; }
            .mc-mobile-only { justify-content: flex-end; min-width: 0; }
            .mc-mobile-only summary { max-width: 58px; overflow: hidden; text-overflow: ellipsis; }
            [data-order-rail="neutral-command-panel"] { width: 100% !important; min-width: 0 !important; box-sizing: border-box !important; }
            .mc-plan-mobile-main { padding: 5px 6px 22px !important; }
            .mc-plan-mobile-title-wrap { margin-bottom: 5px !important; }
            .production-plan-layout-grid { display: flex !important; flex-direction: column !important; gap: 6px !important; }
            [data-order-row-week-grid] { grid-template-columns: 1fr !important; }
            [data-mobile-crew-pill="crew-filter"] { gap: 0 !important; flex-wrap: nowrap !important; border: 1px solid rgba(0,0,0,0.06) !important; border-radius: 999px !important; background: rgba(255,255,255,0.78) !important; padding: 2px !important; overflow: hidden !important; width: 100% !important; }
            [data-mobile-crew-pill="crew-filter"] > button { min-width: 0 !important; min-height: 30px !important; flex: 1 1 0 !important; border: 0 !important; padding: 5px 8px !important; }
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
        <div className="mc-mobile-grid" style={{ background: `linear-gradient(135deg, #181716 0%, #24211d 58%, #151312 100%)`, padding: isNarrow ? "5px 8px" : "9px 18px", display: "grid", gridTemplateColumns: isNarrow ? "1fr auto" : "minmax(176px, 220px) minmax(360px, 1fr) auto", alignItems: "center", gap: isNarrow ? 6 : 14, boxShadow: "0 10px 28px rgba(44,37,32,0.18)", overflow: "visible" }}>
          <TuesdayBrand syncedAt={syncedAt} source={source} mondayError={mondayError} isNarrow={isNarrow} />
          {compactMobile && (
            <div className="mc-mobile-only" style={{ alignItems: "center", gap: 7 }}>
              <RefreshButton section={section} compact />
              <MobileManagementMenu section={section} pathname={pathname} />
            </div>
          )}
          {compactMobile ? null : <nav className="mc-mobile-hide" style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-start", justifySelf: "start", gap: 5, flexWrap: "nowrap", overflowX: "visible", padding: 4, border: "1px solid rgba(255,255,255,0.16)", borderRadius: 999, background: "rgba(255,255,255,0.075)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 10px rgba(0,0,0,0.10)", WebkitOverflowScrolling: "touch" }} aria-label="Mission Control boards">
            {NAV.map((item) => {
              const active = navItemActive(item, section, pathname);
              return (
                <Link
                  key={item.section}
                  href={item.href}
                  style={{
                    color: active ? "#1d1a16" : "rgba(255,250,240,0.88)",
                    background: active ? "linear-gradient(135deg, #fffaf0 0%, rgba(210,174,109,0.92) 100%)" : "linear-gradient(135deg, rgba(255,250,240,0.095), rgba(210,174,109,0.055))",
                    border: active ? "1px solid rgba(255,255,255,0.42)" : "1px solid rgba(255,250,240,0.13)",
                    boxShadow: active ? "0 1px 0 rgba(255,255,255,0.35), 0 6px 18px rgba(0,0,0,0.16)" : "0 1px 0 rgba(255,255,255,0.05) inset",
                    borderRadius: 999,
                    padding: "7px 13px",
                    minWidth: item.section === "processTemplates" ? 96 : 78,
                    fontSize: 12,
                    textDecoration: "none",
                    fontFamily: DT.sans,
                    fontWeight: active ? 900 : 790,
                    letterSpacing: "0.01em",
                    textAlign: "center",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>}
          {!compactMobile && (
            <div className="mc-mobile-hide" style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <RefreshButton section={section} />
              <GuidoMenu section={section} pathname={pathname} />
            </div>
          )}
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
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
