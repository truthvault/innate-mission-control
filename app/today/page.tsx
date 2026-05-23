import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT, KpiCard } from "@/components/mission-control-ui";
import { listLeads } from "@/lib/leads/fetch-leads";
import { getOrdersWithFallback } from "@/lib/monday/fetch-orders";
import { getSampleStockWithFallback } from "@/lib/monday/fetch-sample-stock";
import { buildDailyBrief, type DailyBriefItem, type DailyBriefSection, type DailyBriefTone } from "@/lib/tuesday/daily-brief";

export const dynamic = "force-dynamic";

type ToneStyle = {
  border: string;
  background: string;
  color: string;
  chip: "neutral" | "amber" | "teal" | "red" | "grey" | "green";
};

const TONE_STYLES: Record<DailyBriefTone, ToneStyle> = {
  good: { border: "rgba(79,127,89,0.22)", background: "rgba(79,127,89,0.09)", color: DT.green, chip: "green" },
  neutral: { border: DT.border, background: "rgba(255,253,249,0.72)", color: DT.textSecondary, chip: "neutral" },
  warning: { border: "rgba(210,174,109,0.30)", background: "rgba(210,174,109,0.12)", color: "#8a5b1f", chip: "amber" },
  danger: { border: "rgba(180,107,70,0.28)", background: "rgba(180,107,70,0.11)", color: "#8f3f24", chip: "red" },
};

function newestIso(values: string[]): string {
  const times = values.map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
  if (!times.length) return new Date().toISOString();
  return new Date(Math.max(...times)).toISOString();
}

function sourceLabel(source: string) {
  if (source === "supabase") return "Supabase";
  if (source === "monday") return "Monday";
  if (source === "xero") return "Xero";
  if (source === "blob") return "Blob";
  return "Tuesday";
}

function ItemCard({ item }: { item: DailyBriefItem }) {
  const tone = TONE_STYLES[item.tone];
  const content = (
    <div
      style={{
        display: "grid",
        gap: 7,
        padding: "13px 14px",
        borderRadius: 16,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        boxShadow: "0 8px 22px rgba(44,37,32,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 17, lineHeight: 1.08 }}>{item.title}</strong>
        <Chip label={sourceLabel(item.source)} tone={tone.chip} />
      </div>
      <p style={{ margin: 0, color: DT.textSecondary, fontFamily: DT.sans, fontSize: 12, lineHeight: 1.45 }}>{item.detail}</p>
      {item.meta && <span style={{ color: DT.textFaint, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.meta}</span>}
    </div>
  );

  if (!item.href) return content;
  return <a href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{content}</a>;
}

function SectionCard({ section }: { section: DailyBriefSection }) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: 22, boxShadow: DT.shadow, padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, color: DT.textPrimary, fontFamily: DT.serif, fontSize: 22, lineHeight: 1.05, letterSpacing: "-0.035em" }}>{section.title}</h2>
        <p style={{ margin: "5px 0 0", color: DT.textMuted, fontFamily: DT.sans, fontSize: 12, lineHeight: 1.4 }}>{section.subtitle}</p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {section.items.map((item) => <ItemCard key={`${section.id}-${item.title}-${item.detail}`} item={item} />)}
      </div>
    </section>
  );
}

export default async function TodayPage() {
  const [leads, orders, sampleStock] = await Promise.all([
    listLeads(),
    getOrdersWithFallback(),
    getSampleStockWithFallback(),
  ]);
  const generatedAt = newestIso([leads.syncedAt, orders.syncedAt, sampleStock.syncedAt]);
  const brief = buildDailyBrief({
    now: new Date().toISOString(),
    leads,
    orders,
    sampleStock,
    xero: { source: "not_connected", label: "Xero not connected", tone: "warning" },
  });
  const syncSource = [leads.source === "none" ? "leads" : null, orders.source === "none" ? "orders" : null, sampleStock.source === "none" ? "samples" : null].filter(Boolean).length ? "partial" : "mixed";
  const syncError = [leads.error, orders.mondayError, sampleStock.mondayError].filter(Boolean).join(" · ") || undefined;

  return (
    <MissionControlShell
      section="today"
      pageTitle="Owner Daily Brief"
      pageSubtitle="The one-page command post: leads, production promises, samples, cash placeholders, and source health."
      syncedAt={generatedAt}
      source={syncSource}
      mondayError={syncError}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) repeat(4, minmax(120px, 0.7fr))", gap: 10, alignItems: "stretch", overflowX: "auto", paddingBottom: 2 }}>
          <div style={{ minWidth: 260, padding: 18, borderRadius: 24, background: `linear-gradient(135deg, ${DT.headerBg}, ${DT.headerBg2})`, color: "white", boxShadow: DT.shadow }}>
            <div style={{ color: DT.gold, fontFamily: DT.sans, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.11em" }}>Most important decision</div>
            <h2 style={{ margin: "7px 0 6px", fontFamily: DT.serif, fontSize: 28, lineHeight: 1, letterSpacing: "-0.045em" }}>{brief.decision.label}</h2>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.76)", fontFamily: DT.sans, fontSize: 13, lineHeight: 1.42 }}>{brief.decision.detail}</p>
          </div>
          <KpiCard label="Hot leads" value={brief.summary.hotLeads} tone={brief.summary.hotLeads ? "warn" : "good"} />
          <KpiCard label="Production risk" value={brief.summary.productionRisks} tone={brief.summary.productionRisks ? "bad" : "good"} />
          <KpiCard label="Sample issues" value={brief.summary.sampleIssues} tone={brief.summary.sampleIssues ? "warn" : "good"} />
          <KpiCard label="Source warnings" value={brief.summary.sourcesWithWarnings} tone={brief.summary.sourcesWithWarnings ? "warn" : "good"} />
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, alignItems: "start" }}>
          {brief.sections.map((section) => <SectionCard key={section.id} section={section} />)}
        </div>
      </div>
    </MissionControlShell>
  );
}
