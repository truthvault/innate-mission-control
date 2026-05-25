import { buildDailyBrief, type DailyBriefSection, type OwnerActionKind, type SourceHealthState } from "@/lib/tuesday/daily-brief";
import { listLeads } from "@/lib/leads/fetch-leads";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getSampleStockWithFallback } from "@/lib/monday/fetch-sample-stock";
import { getFreightQuoteLogStatus, listQuoteEvents } from "@/lib/freight/quoteLog";
import { getReadOnlyXeroCashSignal } from "@/lib/xero/cash-signal";

export const dynamic = "force-dynamic";

type BriefSectionKey = keyof ReturnType<typeof buildDailyBrief>["sections"];

const sectionOrder: BriefSectionKey[] = [
  "hotLeads",
  "staleFollowUps",
  "production",
  "customerPromises",
  "cash",
  "freightAndSamples",
];

function formatDate() {
  const fmt = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

function sourceStateLabel(state: SourceHealthState) {
  switch (state) {
    case "live":
      return "Live";
    case "stale":
      return "May be stale";
    case "fallback":
      return "Fallback data";
    case "missing":
      return "Missing source";
    case "unverified":
      return "Needs verification";
  }
}

function sourceColor(state: SourceHealthState) {
  switch (state) {
    case "live":
      return { bg: "rgba(12,124,122,0.1)", fg: "#0c7c7a" };
    case "stale":
      return { bg: "rgba(200,169,110,0.18)", fg: "#8a6728" };
    case "fallback":
      return { bg: "rgba(122,106,143,0.14)", fg: "#6e5f83" };
    case "missing":
      return { bg: "rgba(132,92,72,0.12)", fg: "#845c48" };
    case "unverified":
      return { bg: "rgba(95,95,95,0.12)", fg: "#555" };
  }
}

function SourcePill({ label, state }: { label: string; state: SourceHealthState }) {
  const color = sourceColor(state);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        padding: "4px 8px",
        fontSize: 10,
        fontWeight: 650,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}: {sourceStateLabel(state)}
    </span>
  );
}

function ownerActionColor(kind: OwnerActionKind) {
  switch (kind) {
    case "needs_guido_decision":
      return { bg: "rgba(182,91,68,0.12)", fg: "#9b4b38" };
    case "draft_follow_up":
      return { bg: "rgba(12,124,122,0.1)", fg: "#0c6f6d" };
    case "ask_nick":
      return { bg: "rgba(200,169,110,0.18)", fg: "#7d6128" };
    case "check_invoice":
      return { bg: "rgba(122,106,143,0.13)", fg: "#66577b" };
    case "verify_source":
      return { bg: "rgba(95,95,95,0.11)", fg: "#555" };
    case "ignore_today":
    case "watch_only":
      return { bg: "rgba(48,37,28,0.06)", fg: "var(--text-muted)" };
  }
}

function OwnerActionChip({ kind, label }: { kind: OwnerActionKind; label: string }) {
  const color = ownerActionColor(kind);
  return (
    <span
      aria-label={`Owner action: ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        padding: "4px 8px",
        fontSize: 11,
        fontWeight: 650,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      Owner: {label}
    </span>
  );
}

function severityStripe(severity: "watch" | "action" | "urgent") {
  if (severity === "urgent") return "#b65b44";
  if (severity === "action") return "#0c7c7a";
  return "#c8a96e";
}

function BriefSection({ section }: { section: DailyBriefSection }) {
  return (
    <section
      style={{
        background: "var(--bg-surface)",
        border: "1px solid rgba(48, 37, 28, 0.08)",
        borderRadius: 18,
        padding: 16,
        boxShadow: "var(--shadow-rest)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 520, color: "var(--text-main)", margin: 0 }}>
          {section.title}
        </h2>
        <SourcePill label={section.sourceLabel} state={section.sourceState} />
      </div>
      {section.items.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.45, margin: 0 }}>{section.empty}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {section.items.map((item) => (
            <a
              key={item.id}
              href={item.href || "#"}
              style={{
                display: "block",
                textDecoration: "none",
                color: "inherit",
                background: "rgba(255,255,255,0.54)",
                borderRadius: 13,
                borderLeft: `4px solid ${severityStripe(item.severity)}`,
                padding: "12px 13px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <p style={{ fontSize: 15, fontWeight: 650, color: "var(--text-main)", lineHeight: 1.25, margin: 0 }}>{item.title}</p>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 }}>
                  {item.ownerAction ? <OwnerActionChip kind={item.ownerAction.kind} label={item.ownerAction.label} /> : null}
                  <SourcePill label="source" state={item.sourceState} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "5px 0 0", lineHeight: 1.35 }}>{item.detail}</p>
              {item.whyThisMatters ? (
                <p style={{ fontSize: 12, color: "#6f4e2f", margin: "7px 0 0", lineHeight: 1.35 }}>
                  Why this matters: {item.whyThisMatters}
                </p>
              ) : null}
              {item.action ? (
                <p style={{ fontSize: 12, color: "var(--text-main)", margin: "7px 0 0", lineHeight: 1.35 }}>Next: {item.action}</p>
              ) : null}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

async function getBrief() {
  const now = new Date().toISOString();
  const [leads, orders, samples, freightRows, cashSignal] = await Promise.all([
    listLeads(100),
    getOrdersWithFallback(),
    getSampleStockWithFallback(),
    listQuoteEvents(25),
    getReadOnlyXeroCashSignal(now),
  ]);
  const freightStatus = getFreightQuoteLogStatus();
  const freightSource = freightStatus.supabaseConfigured
    ? "supabase"
    : freightStatus.airtableConfigured
      ? "airtable"
      : "missing";

  return buildDailyBrief({
    now,
    leads,
    orders,
    samples,
    freight: {
      rows: freightRows.rows,
      source: freightSource,
      syncedAt: now,
      error: freightRows.error,
    },
    cash: cashSignal,
  });
}

export default async function TodayPage() {
  const brief = await getBrief();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 56px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            Today
          </span>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 10,
            fontWeight: 650,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            {formatDate()}
          </span>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 30,
            fontWeight: 520,
            letterSpacing: "-0.02em",
            color: "var(--text-main)",
            margin: "0 0 8px",
          }}>
            Owner Daily Brief
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5, maxWidth: 620, margin: 0 }}>
            One calm read of leads, production promises, cash signal, freight and samples. Draft-first, read-only source checks only.
          </p>
        </div>

        <section
          style={{
            background: brief.safeToIgnore ? "rgba(12,124,122,0.08)" : "rgba(200,169,110,0.16)",
            border: "1px solid rgba(48, 37, 28, 0.08)",
            borderRadius: 20,
            padding: 18,
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            One decision
          </span>
          <p style={{ fontFamily: "var(--font-display)", color: "var(--text-main)", fontSize: 22, lineHeight: 1.25, margin: "7px 0 10px" }}>
            {brief.safeToIgnore ? brief.safeToIgnoreMessage : brief.mostImportantDecision.prompt}
          </p>
          <SourcePill label={brief.mostImportantDecision.sourceLabel} state={brief.mostImportantDecision.sourceState} />
        </section>

        <section style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }} aria-label="Source health">
          {brief.sourceHealth.map((source) => (
            <SourcePill key={source.label} label={source.label} state={source.state} />
          ))}
        </section>

        <div style={{ display: "grid", gap: 14 }}>
          {sectionOrder.map((key) => (
            <BriefSection key={key} section={brief.sections[key]} />
          ))}
        </div>
      </main>
    </div>
  );
}
