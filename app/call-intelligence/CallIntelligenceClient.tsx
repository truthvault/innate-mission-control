"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT, KpiCard } from "@/components/mission-control-ui";
import type { ActionItem, CallIntelligenceResult, ExtractedNugget, NuggetType, SourceCapture } from "@/lib/call-intelligence/types";

type Tone = "neutral" | "amber" | "teal" | "red" | "grey" | "green";

function useIsNarrow(breakpoint = 760) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth <= breakpoint);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

const TYPE_LABELS: Record<NuggetType, string> = {
  contact: "Contact",
  action: "Action",
  research: "Research",
  knowledge: "Knowledge",
  opportunity: "Opportunity",
  waiting: "Waiting",
  update: "Update",
};

const TYPE_TONES: Record<NuggetType, Tone> = {
  contact: "teal",
  action: "amber",
  research: "green",
  knowledge: "grey",
  opportunity: "teal",
  waiting: "red",
  update: "neutral",
};

function sourceDateLabel(value?: string) {
  if (!value) return "No date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

function Section({ title, subtitle, count, children }: { title: string; subtitle?: string; count?: number; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <h2 style={sectionTitleStyle}>{title}</h2>
          {subtitle && <p style={sectionSubtitleStyle}>{subtitle}</p>}
        </div>
        {typeof count === "number" && <Chip label={count} tone={count ? "teal" : "grey"} />}
      </div>
      {children}
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={emptyStyle}>{label}</div>;
}

function MoreButton({ hiddenCount, label, onClick }: { hiddenCount: number; label: string; onClick: () => void }) {
  if (hiddenCount <= 0) return null;
  return (
    <button type="button" onClick={onClick} style={moreButtonStyle}>
      Show {hiddenCount} more {label}
    </button>
  );
}

function CaptureCard({ capture }: { capture: SourceCapture }) {
  return (
    <article style={cardStyle}>
      <div style={cardHeaderStyle}>
        <div style={cardHeaderTextStyle}>
          <div style={kickerStyle}>{sourceDateLabel(capture.sourceDate)} · {capture.sourceType}</div>
          <h3 style={cardTitleStyle}>{capture.title}</h3>
        </div>
        <Chip label={capture.capturedBy} tone="grey" />
      </div>
      {capture.summary && <p style={bodyStyle}>{capture.summary}</p>}
      {capture.transcriptPath && <p style={pathStyle}>Transcript: {capture.transcriptPath}</p>}
    </article>
  );
}

function ActionCard({ action }: { action: ActionItem }) {
  const tone: Tone = action.bucket === "waiting" ? "red" : action.bucket === "research" ? "green" : action.bucket === "explore" ? "teal" : "amber";
  return (
    <article style={cardStyle}>
      <div style={cardHeaderStyle}>
        <h3 style={cardTitleStyle}>{action.title}</h3>
        <Chip label={action.priority} tone={action.priority === "high" || action.priority === "urgent" ? "red" : "grey"} />
      </div>
      {action.detail && <p style={bodyStyle}>{action.detail}</p>}
      <div style={chipRowStyle}>
        <Chip label={action.bucket.replace("_", " ")} tone={tone} />
        <Chip label={action.status} tone={action.status === "waiting" ? "red" : "grey"} />
        <Chip label={action.owner} tone="neutral" />
      </div>
    </article>
  );
}

function NuggetCard({ nugget }: { nugget: ExtractedNugget }) {
  return (
    <article style={cardStyle}>
      <div style={chipRowStyle}>
        <Chip label={TYPE_LABELS[nugget.nuggetType]} tone={TYPE_TONES[nugget.nuggetType]} />
        {nugget.personOrOrg && <Chip label={nugget.personOrOrg} tone="neutral" />}
      </div>
      <h3 style={{ ...cardTitleStyle, marginTop: 8 }}>{nugget.title}</h3>
      {nugget.detail && <p style={bodyStyle}>{nugget.detail}</p>}
    </article>
  );
}

function firstCapture(captures: SourceCapture[]) {
  return captures[0];
}

export default function CallIntelligenceClient({ result }: { result: CallIntelligenceResult }) {
  const isNarrow = useIsNarrow(760);
  const [expanded, setExpanded] = useState<Partial<Record<"thisWeek" | "waiting" | "research" | "explore" | "nuggets", boolean>>>({});
  const thisWeek = result.actions.filter((action) => action.bucket === "this_week" || action.bucket === "today");
  const waiting = result.actions.filter((action) => action.bucket === "waiting" || action.status === "waiting");
  const research = result.actions.filter((action) => action.bucket === "research");
  const explore = result.actions.filter((action) => action.bucket === "explore");
  const recentNuggets = result.nuggets.slice(0, 18);
  const capture = firstCapture(result.captures);
  const limitActions = (items: ActionItem[], key: "thisWeek" | "waiting" | "research" | "explore", mobileLimit: number) => (isNarrow && !expanded[key] ? items.slice(0, mobileLimit) : items);
  const visibleThisWeek = limitActions(thisWeek, "thisWeek", 8);
  const visibleWaiting = limitActions(waiting, "waiting", 4);
  const visibleResearch = limitActions(research, "research", 4);
  const visibleExplore = limitActions(explore, "explore", 4);
  const visibleNuggets = isNarrow && !expanded.nuggets ? recentNuggets.slice(0, 6) : recentNuggets;
  const showSection = (key: "thisWeek" | "waiting" | "research" | "explore" | "nuggets") => setExpanded((current) => ({ ...current, [key]: true }));

  return (
    <MissionControlShell
      section="calls"
      pageTitle="Call intelligence"
      pageSubtitle="Call -> Nuggets -> Tasks -> Waiting -> Explore"
      syncedAt={result.syncedAt}
      source={result.source}
      mondayError={result.error}
      maxWidth={960}
    >
      <style>{`
        @media (max-width: 759px) {
          [data-call-kpis="true"] {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 5px !important;
            margin-bottom: 8px !important;
          }
          [data-call-kpis="true"] > * {
            min-width: 0 !important;
          }
          [data-call-stack="true"] {
            gap: 9px !important;
          }
          [data-call-intelligence-root="true"] section {
            padding: 10px !important;
          }
        }
        @media (max-width: 359px) {
          [data-call-intelligence-root="true"] {
            max-width: 100%;
            overflow-x: clip;
          }
          [data-call-intelligence-root="true"] * {
            box-sizing: border-box;
            min-width: 0;
          }
        }
      `}</style>
      <div data-call-intelligence-root="true" style={{ maxWidth: "100%", overflowX: "clip" }}>
        {result.error && <div style={errorStyle}>Read-only prototype could not load Supabase data: {result.error}</div>}

        <div data-call-kpis="true" style={kpiGridStyle}>
          <KpiCard label="Captures" value={result.captures.length} tone="neutral" />
          <KpiCard label="This week" value={thisWeek.length} tone={thisWeek.length ? "warn" : "neutral"} />
          <KpiCard label="Waiting" value={waiting.length} tone={waiting.length ? "bad" : "neutral"} />
          <KpiCard label="Research" value={research.length} tone={research.length ? "good" : "neutral"} />
        </div>

        <div data-call-stack="true" style={mobileStackStyle}>
          <Section title="Inbox" subtitle="Most recent source capture" count={result.captures.length}>
            {capture ? <CaptureCard capture={capture} /> : <Empty label="No captures loaded yet." />}
          </Section>

          <Section title="This week actions" subtitle="Small moves Guido can do next" count={thisWeek.length}>
            {visibleThisWeek.length ? visibleThisWeek.map((action) => <ActionCard key={action.id} action={action} />) : <Empty label="No this-week actions." />}
            <MoreButton hiddenCount={thisWeek.length - visibleThisWeek.length} label="actions" onClick={() => showSection("thisWeek")} />
          </Section>

          <Section title="Waiting" subtitle="Things not owned by Guido yet" count={waiting.length}>
            {visibleWaiting.length ? visibleWaiting.map((action) => <ActionCard key={action.id} action={action} />) : <Empty label="Nothing waiting." />}
            <MoreButton hiddenCount={waiting.length - visibleWaiting.length} label="waiting items" onClick={() => showSection("waiting")} />
          </Section>

          <Section title="Research queue" subtitle="Questions to resolve before acting hard" count={research.length}>
            {visibleResearch.length ? visibleResearch.map((action) => <ActionCard key={action.id} action={action} />) : <Empty label="No research queued." />}
            <MoreButton hiddenCount={research.length - visibleResearch.length} label="research items" onClick={() => showSection("research")} />
          </Section>

          <Section title="Explore" subtitle="Opportunities to assess later" count={explore.length}>
            {visibleExplore.length ? visibleExplore.map((action) => <ActionCard key={action.id} action={action} />) : <Empty label="No explore items." />}
            <MoreButton hiddenCount={explore.length - visibleExplore.length} label="explore items" onClick={() => showSection("explore")} />
          </Section>

          <Section title="Recent nuggets" subtitle="Contacts, knowledge, opportunities, and updates" count={recentNuggets.length}>
            {visibleNuggets.length ? <div style={nuggetGridStyle}>{visibleNuggets.map((nugget) => <NuggetCard key={nugget.id} nugget={nugget} />)}</div> : <Empty label="No nuggets loaded." />}
            <MoreButton hiddenCount={recentNuggets.length - visibleNuggets.length} label="nuggets" onClick={() => showSection("nuggets")} />
          </Section>
        </div>
      </div>
    </MissionControlShell>
  );
}

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const mobileStackStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 12,
};

const nuggetGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 10,
};

const sectionStyle: CSSProperties = {
  background: "rgba(255,253,249,0.72)",
  border: `1px solid ${DT.border}`,
  borderRadius: DT.radius,
  boxShadow: DT.shadow,
  padding: 12,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: DT.textPrimary,
  fontFamily: DT.serif,
  fontSize: 21,
  letterSpacing: "-0.035em",
  lineHeight: 1.1,
};

const sectionSubtitleStyle: CSSProperties = {
  margin: "3px 0 0",
  color: DT.textMuted,
  fontSize: 12,
  lineHeight: 1.35,
};

const cardStyle: CSSProperties = {
  minWidth: 0,
  background: DT.cardBg,
  border: `1px solid ${DT.border}`,
  borderRadius: DT.radiusSm,
  padding: 12,
  marginTop: 8,
  boxShadow: "0 1px 2px rgba(39,34,27,0.03)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const cardHeaderTextStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
};

const cardTitleStyle: CSSProperties = {
  minWidth: 0,
  margin: 0,
  color: DT.textPrimary,
  fontSize: 15,
  lineHeight: 1.28,
  fontWeight: 900,
  overflowWrap: "anywhere",
};

const kickerStyle: CSSProperties = {
  color: DT.textFaint,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginBottom: 5,
  overflowWrap: "anywhere",
};

const bodyStyle: CSSProperties = {
  minWidth: 0,
  color: DT.textSecondary,
  fontSize: 13,
  lineHeight: 1.45,
  margin: "8px 0 0",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
};

const pathStyle: CSSProperties = {
  color: DT.textFaint,
  fontSize: 11,
  lineHeight: 1.35,
  margin: "8px 0 0",
  overflowWrap: "anywhere",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const moreButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 40,
  marginTop: 8,
  border: `1px solid ${DT.border}`,
  borderRadius: 999,
  background: "rgba(255,255,255,0.78)",
  color: DT.textSecondary,
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  touchAction: "manipulation",
};

const emptyStyle: CSSProperties = {
  border: `1px dashed ${DT.border}`,
  borderRadius: DT.radiusSm,
  color: DT.textMuted,
  fontSize: 13,
  padding: 14,
  background: "rgba(255,255,255,0.45)",
};

const errorStyle: CSSProperties = {
  marginBottom: 12,
  border: "1px solid rgba(180,107,70,0.22)",
  borderRadius: DT.radiusSm,
  background: "rgba(180,107,70,0.09)",
  color: DT.clay,
  padding: 12,
  fontSize: 13,
  lineHeight: 1.4,
};
