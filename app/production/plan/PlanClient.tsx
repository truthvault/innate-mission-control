'use client';

import { useMemo, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DAYS,
  PEOPLE,
  derivePlanGrid,
  groupPlanRowsByWeek,
  type PlanRow,
  type DayKey,
  type Person,
} from "@/lib/monday/production-plan-mapping";

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
  radiusSm: 8,
  sans: "'DM Sans', -apple-system, sans-serif",
  serif: "'Fraunces', Georgia, serif",
};

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
};
const PERSON_LABELS: Record<Person, string> = { nick: "Nick", dylan: "Dylan" };
const PERSON_SHORT: Record<Person, string> = { nick: "N", dylan: "D" };

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function SourceIndicator({
  syncedAt,
  source,
  mondayError,
}: {
  syncedAt: string;
  source: string;
  mondayError?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  void tick;
  const stale = source === "snapshot";
  return (
    <div
      title={mondayError ? `Monday error: ${mondayError}` : `Synced at ${syncedAt}`}
      style={{
        fontSize: 10,
        color: stale ? "#d97706" : DT.gold,
        fontFamily: DT.sans,
        marginTop: 1,
        lineHeight: 1.3,
      }}
    >
      Read-only mirror · Source: Monday.com · {stale ? "⚠ Stale — " : "Synced "}
      {relativeAge(syncedAt)}
    </div>
  );
}

function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const onClick = async () => {
    setErr(null);
    try {
      const res = await fetch("/api/monday/refresh?scope=plan", {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "Refresh failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {err && (
        <span
          style={{ fontSize: 10, color: "#fca5a5", fontFamily: DT.sans }}
          title={err}
        >
          Refresh error
        </span>
      )}
      <button
        onClick={onClick}
        disabled={isPending}
        style={{
          padding: "5px 12px",
          borderRadius: 6,
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
        {isPending ? "Refreshing…" : "Refresh from Monday"}
      </button>
    </div>
  );
}

function LinkedOrderPill({ row }: { row: PlanRow }) {
  if (row.linkedOrders.length === 0) return null;
  // Per Guido's rule: cross-link only when the connected order is on the app's
  // synced Orders board. Otherwise show plain text.
  if (row.hasAppLinkedOrder) {
    const ordersBoardId = process.env.NEXT_PUBLIC_MONDAY_ORDERS_BOARD_ID;
    const linked = ordersBoardId
      ? row.linkedOrders.find((l) => l.boardId === ordersBoardId)
      : row.linkedOrders[0];
    return (
      <Link
        href="/production"
        style={{
          fontSize: 10,
          color: DT.teal,
          background: DT.tealSoft,
          border: "1px solid rgba(12,124,122,0.10)",
          borderRadius: 4,
          padding: "2px 6px",
          textDecoration: "none",
          fontFamily: DT.sans,
        }}
      >
        → {linked?.name ?? "Linked order"}
      </Link>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: DT.textMuted,
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.04)",
        borderRadius: 4,
        padding: "2px 6px",
        fontFamily: DT.sans,
        fontStyle: "italic",
      }}
      title={row.linkedOrders.map((l) => `${l.name} (${l.boardName})`).join("\n")}
    >
      Linked: {row.linkedOrders.map((l) => l.name).join(" · ").slice(0, 60)}
    </span>
  );
}

function DayPills({ row }: { row: PlanRow }) {
  const hasAny = DAYS.some((d) => PEOPLE.some((p) => row.dayTasks[d][p]));
  if (!hasAny) {
    return (
      <span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans, fontStyle: "italic" }}>
        no day assignments
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {DAYS.flatMap((day) =>
        PEOPLE.map((person) => {
          const text = row.dayTasks[day][person];
          if (!text) return null;
          const isToday = text.toLowerCase() === "today";
          return (
            <span
              key={`${day}-${person}`}
              style={{
                fontSize: 10,
                fontFamily: DT.sans,
                background: DT.cardBg,
                border: `1px solid ${DT.border}`,
                borderRadius: 4,
                padding: "2px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontStyle: isToday ? "italic" : "normal",
                color: isToday ? DT.textFaint : DT.textSecondary,
              }}
            >
              <span style={{ fontWeight: 700, color: DT.textFaint, fontSize: 9 }}>
                {DAY_LABELS[day]} {PERSON_SHORT[person]}
              </span>
              <span>{text}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

function PlanRowCard({ row }: { row: PlanRow }) {
  return (
    <div
      style={{
        background: DT.cardBg,
        border: `1px solid ${DT.border}`,
        borderRadius: DT.radius,
        padding: "12px 16px",
        boxShadow: DT.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <a
          href={row.mondayUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: DT.textPrimary,
            fontFamily: DT.sans,
            textDecoration: "none",
          }}
        >
          {row.name}
        </a>
        <LinkedOrderPill row={row} />
      </div>
      <DayPills row={row} />
      {row.notes && (
        <p
          style={{
            fontSize: 12,
            color: DT.textSecondary,
            lineHeight: 1.5,
            margin: 0,
            fontFamily: DT.sans,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.015)",
            borderRadius: 6,
          }}
        >
          {row.notes}
        </p>
      )}
    </div>
  );
}

function WeekSection({
  title,
  rows,
  defaultOpen,
}: {
  title: string;
  rows: PlanRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "8px 0",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: DT.textPrimary,
            fontFamily: DT.serif,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 10,
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontWeight: 500,
          }}
        >
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.04)" }} />
        <span
          style={{
            fontSize: 12,
            color: DT.textFaint,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 10,
          }}
        >
          {rows.map((r) => (
            <PlanRowCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function GridView({ rows, weekTitle }: { rows: PlanRow[]; weekTitle: string }) {
  const grid = useMemo(() => derivePlanGrid(rows), [rows]);
  const anyTasks = DAYS.some((d) =>
    PEOPLE.some((p) => grid[d][p].length > 0)
  );

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: DT.textFaint,
          fontFamily: DT.sans,
          marginBottom: 10,
        }}
      >
        Grid for {weekTitle} · {rows.length} row{rows.length === 1 ? "" : "s"} ·
        tasks derived from day-columns (empty days/people are hidden only when completely empty)
      </div>
      {!anyTasks && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontSize: 13,
          }}
        >
          No day-column assignments for this week.
        </div>
      )}
      {anyTasks && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 1fr",
            gap: 3,
          }}
        >
          <div />
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.nick}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.dylan}
          </div>
          {DAYS.map((day) => (
            <GridRow key={day} day={day} grid={grid} />
          ))}
        </div>
      )}
    </div>
  );
}

function GridRow({
  day,
  grid,
}: {
  day: DayKey;
  grid: ReturnType<typeof derivePlanGrid>;
}) {
  return (
    <>
      <div style={{ paddingTop: 6 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: DT.textMuted,
            fontFamily: DT.sans,
          }}
        >
          {DAY_LABELS[day]}
        </div>
      </div>
      {PEOPLE.map((person) => (
        <div
          key={person}
          style={{
            background: DT.cardBg,
            borderRadius: 6,
            border: `1px solid ${DT.border}`,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minHeight: 28,
          }}
        >
          {grid[day][person].map((t, i) => {
            const isToday = t.text.toLowerCase() === "today";
            return (
              <a
                key={`${t.sourceRowId}-${i}`}
                href={t.sourceRowUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: "rgba(12,124,122,0.05)",
                  border: `1px solid ${DT.border}`,
                  textDecoration: "none",
                  color: DT.textPrimary,
                  fontFamily: DT.sans,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    fontStyle: isToday ? "italic" : "normal",
                    color: isToday ? DT.textFaint : DT.textPrimary,
                  }}
                >
                  {t.text}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: DT.textFaint,
                    marginTop: 1,
                  }}
                >
                  {t.sourceRowName}
                </div>
              </a>
            );
          })}
        </div>
      ))}
    </>
  );
}

export type PlanClientProps = {
  rows: PlanRow[];
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

export default function PlanClient({
  rows,
  syncedAt,
  source,
  mondayError,
}: PlanClientProps) {
  const [view, setView] = useState<"list" | "grid">("list");
  const weeks = useMemo(() => groupPlanRowsByWeek(rows), [rows]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(() =>
    weeks[0]?.id ?? ""
  );
  const selectedWeek =
    weeks.find((w) => w.id === selectedWeekId) ?? weeks[0];

  const firstTwoWeekIds = new Set(weeks.slice(0, 2).map((w) => w.id));

  return (
    <div style={{ minHeight: "100vh", background: DT.pageBg, fontFamily: DT.sans }}>
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap"
        rel="stylesheet"
      />
      <header style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <div
          style={{
            background: DT.headerBg,
            padding: "0 24px",
            height: 64,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#fff",
                fontFamily: DT.serif,
                lineHeight: 1.2,
              }}
            >
              Production Plan
            </div>
            <div style={{ fontSize: 11, color: DT.gold, fontFamily: DT.sans, marginTop: 1 }}>
              {rows.length} row{rows.length === 1 ? "" : "s"} across {weeks.length} week
              {weeks.length === 1 ? "" : "s"}
            </div>
            <SourceIndicator syncedAt={syncedAt} source={source} mondayError={mondayError} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="/production"
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.6)",
                textDecoration: "none",
                fontFamily: DT.sans,
                fontWeight: 500,
              }}
            >
              ← Orders
            </Link>
            <RefreshButton />
          </div>
        </div>
        <div
          style={{
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${DT.gold} 30%, ${DT.gold} 70%, transparent 100%)`,
            opacity: 0.35,
          }}
        />
      </header>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {(["list", "grid"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 14px",
                borderRadius: DT.radiusSm,
                border: view === v ? "none" : `1px solid ${DT.border}`,
                background: view === v ? DT.headerBg : DT.cardBg,
                color: view === v ? "#fff" : DT.textMuted,
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: DT.sans,
              }}
            >
              {v === "list" ? "List" : "Grid"}
            </button>
          ))}
          {view === "grid" && weeks.length > 0 && (
            <>
              <div style={{ flex: 1 }} />
              <label
                style={{
                  fontSize: 10,
                  color: DT.textFaint,
                  fontFamily: DT.sans,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Week
              </label>
              <select
                value={selectedWeek?.id ?? ""}
                onChange={(e) => setSelectedWeekId(e.target.value)}
                style={{
                  fontSize: 12,
                  fontFamily: DT.sans,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: `1px solid ${DT.border}`,
                  background: DT.cardBg,
                  color: DT.textPrimary,
                }}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {rows.length === 0 && (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              fontSize: 13,
              color: DT.textFaint,
              fontFamily: DT.sans,
            }}
          >
            No Production Plan rows. {mondayError && `(${mondayError})`}
          </div>
        )}

        {view === "list" &&
          weeks.map((w) => (
            <WeekSection
              key={w.id}
              title={w.title}
              rows={w.rows}
              defaultOpen={firstTwoWeekIds.has(w.id)}
            />
          ))}

        {view === "grid" && selectedWeek && (
          <GridView rows={selectedWeek.rows} weekTitle={selectedWeek.title} />
        )}
      </main>
      <footer
        style={{
          textAlign: "center",
          padding: "20px",
          fontSize: 10,
          color: "#ccc",
          fontFamily: DT.sans,
        }}
      >
        Innate Production Command Centre · Production Plan mirror · Monday.com data
      </footer>
    </div>
  );
}
