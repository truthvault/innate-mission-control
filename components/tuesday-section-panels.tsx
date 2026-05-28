"use client";

import type { CSSProperties, ReactNode } from "react";
import { Chip, type ChipTone, DT } from "@/components/mission-control-ui";
import type { TuesdayActionClass, TuesdayPanelKey, TuesdaySectionDefinition } from "@/lib/tuesday/sections";

type PanelProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  panelKey?: TuesdayPanelKey;
  children?: ReactNode;
  emptyState?: string;
  style?: CSSProperties;
};

function panelLabel(panelKey?: TuesdayPanelKey) {
  if (!panelKey) return undefined;
  return {
    overview: "Overview",
    queue: "Queue",
    detail: "Detail",
    decision: "Decision",
    sourceEvidence: "Source evidence",
  }[panelKey];
}

function actionTone(actionClass: TuesdayActionClass): ChipTone {
  if (actionClass === "read_only") return "green";
  if (actionClass === "draft") return "teal";
  if (actionClass === "internal_write") return "amber";
  return "red";
}

export function TuesdayPanel({ title, eyebrow, description, panelKey, children, emptyState, style }: PanelProps) {
  return (
    <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: 12, boxShadow: DT.shadow, padding: 16, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ color: DT.textFaint, fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: DT.sans }}>
            {eyebrow || panelLabel(panelKey) || "Tuesday"}
          </div>
          <h2 style={{ margin: "4px 0 0", color: DT.textPrimary, fontFamily: DT.serif, fontSize: 22, lineHeight: 1.08 }}>{title}</h2>
          {description && <p style={{ margin: "7px 0 0", color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.5 }}>{description}</p>}
        </div>
        {panelKey && <Chip label={panelLabel(panelKey)} tone="teal" />}
      </div>
      {children || <div style={{ border: `1px dashed ${DT.border}`, borderRadius: 10, padding: 14, color: DT.textMuted, fontFamily: DT.sans, fontSize: 13 }}>{emptyState || "Nothing needs attention here yet."}</div>}
    </section>
  );
}

export type TuesdayOverviewMetric = {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  note?: string;
};

export function TuesdayOverviewPanel({ section, metrics, children }: { section: TuesdaySectionDefinition; metrics?: TuesdayOverviewMetric[]; children?: ReactNode }) {
  return (
    <TuesdayPanel panelKey="overview" title={`${section.label} overview`} description={section.purpose}>
      {metrics && metrics.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {metrics.map((metric) => {
            const color = metric.tone === "bad" ? "#8f3f24" : metric.tone === "warn" ? "#8a5b1f" : metric.tone === "good" ? DT.green : DT.textPrimary;
            return (
              <div key={metric.label} style={{ border: `1px solid ${DT.border}`, borderRadius: 10, padding: 12, background: "rgba(255,253,249,0.72)" }}>
                <div style={{ color: DT.textFaint, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: DT.sans }}>{metric.label}</div>
                <div style={{ color, fontFamily: DT.serif, fontSize: 25, lineHeight: 1.1, fontWeight: 800, marginTop: 4 }}>{metric.value}</div>
                {metric.note && <div style={{ color: DT.textMuted, fontSize: 11, fontFamily: DT.sans, marginTop: 5, lineHeight: 1.35 }}>{metric.note}</div>}
              </div>
            );
          })}
        </div>
      )}
      {children && <div style={{ marginTop: metrics?.length ? 12 : 0 }}>{children}</div>}
    </TuesdayPanel>
  );
}

export type TuesdayWorkQueueItem = {
  id: string;
  title: string;
  status: string;
  owner: string;
  nextAction: string;
  sourceFreshness: string;
  blockers?: string[];
};

export function TuesdayWorkQueuePanel({ items }: { items: TuesdayWorkQueueItem[] }) {
  return (
    <TuesdayPanel panelKey="queue" title="Work queue" description="A calm list of live objects, their owner, next action, and source freshness." emptyState="No live queue items yet.">
      <div style={{ display: "grid", gap: 9 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "center", border: `1px solid ${DT.border}`, borderRadius: 10, padding: 11, background: "rgba(255,255,255,0.58)" }}>
            <div>
              <div style={{ color: DT.textPrimary, fontWeight: 800, fontFamily: DT.sans, fontSize: 13 }}>{item.title}</div>
              <div style={{ color: DT.textMuted, fontFamily: DT.sans, fontSize: 11, marginTop: 3 }}>{item.sourceFreshness}</div>
            </div>
            <Chip label={item.status} tone={item.blockers?.length ? "amber" : "green"} />
            <div style={{ color: DT.textSecondary, fontFamily: DT.sans, fontSize: 12 }}>{item.owner}</div>
            <div style={{ color: DT.textSecondary, fontFamily: DT.sans, fontSize: 12, lineHeight: 1.35 }}>{item.nextAction}</div>
            {item.blockers && item.blockers.length > 0 && <div style={{ gridColumn: "1 / -1" }}><TuesdayBlockerList blockers={item.blockers} /></div>}
          </div>
        ))}
      </div>
    </TuesdayPanel>
  );
}

export type TuesdayDetailRow = { label: string; value: ReactNode; source?: string };

export function TuesdayDetailPanel({ title, rows }: { title: string; rows: TuesdayDetailRow[] }) {
  return (
    <TuesdayPanel panelKey="detail" title={title} description="Canonical fields and human-readable context for the selected object.">
      <dl style={{ display: "grid", gap: 9, margin: 0 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 12, borderBottom: `1px solid ${DT.border}`, paddingBottom: 8 }}>
            <dt style={{ color: DT.textFaint, fontFamily: DT.sans, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{row.label}</dt>
            <dd style={{ margin: 0, color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.4 }}>{row.value}{row.source && <span style={{ color: DT.textFaint }}> | {row.source}</span>}</dd>
          </div>
        ))}
      </dl>
    </TuesdayPanel>
  );
}

export function TuesdayDecisionPanel({ actionClass, suggestedAction, rationale, blockedBy }: { actionClass: TuesdayActionClass; suggestedAction: string; rationale: string; blockedBy?: string[] }) {
  return (
    <TuesdayPanel panelKey="decision" title="Decision and safe action" description="The next action is explicit about side effects and approval gates.">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <Chip label={actionClass.replaceAll("_", " ")} tone={actionTone(actionClass)} />
        {blockedBy?.length ? <Chip label="blocked" tone="red" /> : <Chip label="safe to review" tone="green" />}
      </div>
      <div style={{ color: DT.textPrimary, fontFamily: DT.serif, fontSize: 20, lineHeight: 1.2, fontWeight: 800 }}>{suggestedAction}</div>
      <p style={{ color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>{rationale}</p>
      {blockedBy && blockedBy.length > 0 && <div style={{ marginTop: 12 }}><TuesdayBlockerList blockers={blockedBy} /></div>}
    </TuesdayPanel>
  );
}

export type TuesdaySourceEvidenceItem = {
  source: string;
  record: string;
  timestamp: string;
  confidence: "high" | "medium" | "low";
  warning?: string;
};

export function TuesdaySourceEvidencePanel({ items }: { items: TuesdaySourceEvidenceItem[] }) {
  return (
    <TuesdayPanel panelKey="sourceEvidence" title="Source evidence" description="Source records stay inspectable before Tuesday trusts or acts on them." emptyState="No source records connected yet.">
      <div style={{ display: "grid", gap: 9 }}>
        {items.map((item) => (
          <div key={`${item.source}-${item.record}`} style={{ border: `1px solid ${DT.border}`, borderRadius: 10, padding: 11, background: "rgba(255,255,255,0.58)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ color: DT.textPrimary, fontFamily: DT.sans, fontSize: 13 }}>{item.source}</strong>
              <Chip label={`${item.confidence} confidence`} tone={item.confidence === "high" ? "green" : item.confidence === "medium" ? "amber" : "red"} />
            </div>
            <div style={{ color: DT.textSecondary, fontFamily: DT.sans, fontSize: 12, marginTop: 5 }}>{item.record}</div>
            <div style={{ color: DT.textFaint, fontFamily: DT.sans, fontSize: 11, marginTop: 4 }}>Checked {item.timestamp}</div>
            {item.warning && <div style={{ color: "#8f3f24", fontFamily: DT.sans, fontSize: 12, marginTop: 6 }}>{item.warning}</div>}
          </div>
        ))}
      </div>
    </TuesdayPanel>
  );
}

export function TuesdayBlockerChip({ blocker }: { blocker: string }) {
  return <Chip label={blocker.replaceAll("_", " ")} tone="amber" />;
}

export function TuesdayBlockerList({ blockers }: { blockers: string[] }) {
  if (blockers.length === 0) return <Chip label="no blockers" tone="green" />;
  return <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{blockers.map((blocker) => <TuesdayBlockerChip key={blocker} blocker={blocker} />)}</div>;
}

export function TuesdayActionSafetyCard({ section }: { section: TuesdaySectionDefinition }) {
  return (
    <TuesdayPanel title="Action safety" eyebrow="Approval model" description="Allowed and protected action classes are part of the section contract, not hidden page logic.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div>
          <div style={{ color: DT.textFaint, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: DT.sans, marginBottom: 7 }}>Allowed here</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{section.allowedActions.map((action) => <Chip key={action} label={action.replaceAll("_", " ")} tone={actionTone(action)} />)}</div>
        </div>
        <div>
          <div style={{ color: DT.textFaint, fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: DT.sans, marginBottom: 7 }}>Protected</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{section.protectedActions.map((action) => <Chip key={action} label={action.replaceAll("_", " ")} tone="red" />)}</div>
        </div>
      </div>
      <ul style={{ margin: "13px 0 0", paddingLeft: 18, color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.5 }}>
        {section.approvalRules.map((rule) => <li key={rule}>{rule}</li>)}
      </ul>
    </TuesdayPanel>
  );
}

export const TuesdayApprovalCard = TuesdayActionSafetyCard;
