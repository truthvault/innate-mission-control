"use client";

import { useEffect, useMemo, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip, DT, KpiCard } from "@/components/mission-control-ui";
import type { Lead, LeadsResult, LeadPriority, LeadStatus } from "@/lib/leads/types";
import { isRecentSampleFollowUp, sampleDraftPrompt, sampleFollowUpLabel, sortSampleFollowUps } from "@/lib/leads/sample-followups.mjs";

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New enquiry",
  qualifying: "Qualifying",
  quoted: "Quote sent",
  follow_up_due: "Follow-up needed",
  waiting_on_customer: "Waiting on customer",
  won: "Won",
  lost: "Lost",
  parked: "Parked / not now",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as Array<[LeadStatus, string]>;
const PRIORITY_OPTIONS: Array<[LeadPriority, string]> = [["hot", "Hot"], ["normal", "Normal"], ["low", "Low"]];
const CLOSED_STATUSES = new Set<LeadStatus>(["won", "lost", "parked"]);

type LeadFilter = "do_today" | "sample_followups" | "overdue" | "cashflow" | "hot" | "needs_next_step" | "waiting" | "active" | "closed" | "all";

type Warning = { label: string; tone: "red" | "amber" | "grey" | "teal" | "green" };

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

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysKey(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateKey(value?: string) {
  return value ? value.slice(0, 10) : undefined;
}

function daysSince(value?: string) {
  const key = dateKey(value);
  if (!key) return undefined;
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function isClosed(lead: Lead) {
  return CLOSED_STATUSES.has(lead.status);
}

function isDue(lead: Lead) {
  const followUp = dateKey(lead.nextFollowUpAt);
  return Boolean(followUp && followUp <= todayKey() && !isClosed(lead));
}

function isDueThisWeek(lead: Lead) {
  const followUp = dateKey(lead.nextFollowUpAt);
  return Boolean(followUp && followUp <= addDaysKey(7) && !isClosed(lead));
}

function needsNextStep(lead: Lead) {
  return !isClosed(lead) && (!lead.nextAction || lead.nextAction === "No Action" || !dateKey(lead.nextFollowUpAt));
}

function isStale(lead: Lead) {
  if (isClosed(lead)) return false;
  const age = daysSince(lead.lastInteractionAt || lead.updatedAt);
  return typeof age === "number" && age >= 14;
}

function isHighValue(lead: Lead) {
  return (lead.estimatedValue || 0) >= 10_000;
}

function isCashflowQuote(lead: Lead) {
  return !isClosed(lead) && lead.status === "quoted";
}

function doToday(lead: Lead) {
  if (isClosed(lead)) return false;
  if (isDue(lead)) return true;
  if (lead.status === "follow_up_due") return true;
  if (lead.priority === "hot" && isDueThisWeek(lead)) return true;
  if (isCashflowQuote(lead) && (isHighValue(lead) || isDueThisWeek(lead))) return true;
  if (needsNextStep(lead) && (lead.priority === "hot" || isCashflowQuote(lead) || isHighValue(lead))) return true;
  return false;
}

function money(value?: number) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function valueLabel(value?: number) {
  return value ? money(value) : "No value";
}

function sourceActionLabel(lead: Lead) {
  if (!lead.nextAction || lead.nextAction === "No Action") return "Missing next step";
  return lead.nextAction;
}

function bookedVisitSummary(lead: Lead) {
  const text = lead.notes || "";
  const match = text.match(/YouCanBookMe workshop visit booked for ([^.]+)\./i);
  return match?.[1] ? `Booked workshop visit: ${match[1]}` : undefined;
}

function dateLabel(value?: string) {
  const key = dateKey(value);
  if (!key) return "No date";
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

function priorityTone(priority: LeadPriority): "red" | "amber" | "grey" {
  if (priority === "hot") return "red";
  if (priority === "low") return "grey";
  return "amber";
}

function statusTone(status: LeadStatus): "teal" | "amber" | "green" | "grey" | "red" {
  if (status === "won") return "green";
  if (status === "lost" || status === "parked") return "grey";
  if (status === "follow_up_due") return "red";
  if (status === "quoted" || status === "waiting_on_customer") return "amber";
  return "teal";
}

function leadWarnings(lead: Lead) {
  const warnings: Warning[] = [];
  if (isDue(lead)) warnings.push({ label: `Overdue: ${dateLabel(lead.nextFollowUpAt)}`, tone: "red" });
  else if (isDueThisWeek(lead)) warnings.push({ label: `Due: ${dateLabel(lead.nextFollowUpAt)}`, tone: "amber" });
  if (needsNextStep(lead)) warnings.push({ label: "Missing next step", tone: "red" });
  if (isCashflowQuote(lead) && isHighValue(lead)) warnings.push({ label: "High value quote", tone: "green" });
  else if (isHighValue(lead)) warnings.push({ label: "High value", tone: "green" });
  if (isRecentSampleFollowUp(lead)) warnings.push({ label: "Sample follow-up", tone: "teal" });
  if (isStale(lead) && !doToday(lead)) warnings.push({ label: "Stale 14d+", tone: "amber" });
  if (!lead.email && !lead.phone && !isClosed(lead)) warnings.push({ label: "No contact", tone: "grey" });
  if (isClosed(lead)) warnings.push({ label: "Closed", tone: "grey" });
  return warnings.slice(0, 3);
}

function whyNow(lead: Lead) {
  if (isDue(lead)) return `Follow-up overdue since ${dateLabel(lead.nextFollowUpAt)}`;
  if (lead.status === "follow_up_due") return "Manually marked follow-up needed";
  if (isCashflowQuote(lead) && isHighValue(lead)) return "Protect high-value quoted work";
  if (isRecentSampleFollowUp(lead)) return "Customer recently received samples: follow up while the timber is in hand";
  if (needsNextStep(lead) && lead.priority === "hot") return "Hot lead missing a next step";
  if (needsNextStep(lead)) return "Set the next step so it does not drift";
  if (lead.priority === "hot") return "Hot lead due soon";
  return "Review when you scan the board";
}

function sortByUrgency(a: Lead, b: Lead) {
  const dueA = isDue(a) ? 0 : 1;
  const dueB = isDue(b) ? 0 : 1;
  if (dueA !== dueB) return dueA - dueB;
  const hotA = a.priority === "hot" ? 0 : 1;
  const hotB = b.priority === "hot" ? 0 : 1;
  if (hotA !== hotB) return hotA - hotB;
  const quoteA = isCashflowQuote(a) && isHighValue(a) ? 0 : 1;
  const quoteB = isCashflowQuote(b) && isHighValue(b) ? 0 : 1;
  if (quoteA !== quoteB) return quoteA - quoteB;
  const followA = dateKey(a.nextFollowUpAt) || "9999-12-31";
  const followB = dateKey(b.nextFollowUpAt) || "9999-12-31";
  if (followA !== followB) return followA.localeCompare(followB);
  return (b.estimatedValue || 0) - (a.estimatedValue || 0) || b.updatedAt.localeCompare(a.updatedAt);
}

function sortByCashflow(a: Lead, b: Lead) {
  const dueA = isDue(a) ? 0 : 1;
  const dueB = isDue(b) ? 0 : 1;
  if (dueA !== dueB) return dueA - dueB;
  return (b.estimatedValue || 0) - (a.estimatedValue || 0) || sortByUrgency(a, b);
}

function isCashFirstLead(lead: Lead) {
  return !isClosed(lead) && (isCashflowQuote(lead) || isHighValue(lead));
}

function cashFirstLeads(leads: Lead[]) {
  return leads.filter(isCashFirstLead).sort(sortByCashflow).slice(0, 4);
}

function matchesSearch(lead: Lead, search: string) {
  const haystack = [lead.customerName, lead.contactName, lead.email, lead.phone, lead.productCategory, lead.nextAction, lead.lastInteractionSummary, lead.notes, lead.mondayItemId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.trim().toLowerCase());
}

function readForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, typeof value === "string" ? value : ""]));
}

async function jsonFetch(url: string, method: "POST" | "PATCH", payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Lead save failed");
  return body;
}

function Info({ label, value, strong = false, warn = false }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div style={{ background: warn ? "rgba(180,107,70,0.07)" : "rgba(0,0,0,0.018)", border: `1px solid ${warn ? "rgba(180,107,70,0.16)" : DT.border}`, borderRadius: DT.radiusSm, padding: "9px 10px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ marginTop: 3, fontSize: strong ? 15 : 12, lineHeight: 1.45, color: warn ? "#8f3f24" : DT.textPrimary, fontWeight: strong ? 900 : 700, fontFamily: DT.sans, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{value}</div>
    </div>
  );
}

function Input({ name, label, defaultValue = "", type = "text", required = false }: { name: string; label: string; defaultValue?: string; type?: string; required?: boolean }) {
  return <label style={fieldStyle}><span>{label}</span><input name={name} type={type} required={required} defaultValue={defaultValue} style={inputStyle} /></label>;
}

function Textarea({ name, label, defaultValue = "", rows = 4 }: { name: string; label: string; defaultValue?: string; rows?: number }) {
  return <label style={fieldStyle}><span>{label}</span><textarea name={name} defaultValue={defaultValue} rows={rows} style={{ ...inputStyle, resize: "vertical" }} /></label>;
}

function Select<T extends string>({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: T; options: Array<[T, string]> }) {
  return <label style={fieldStyle}><span>{label}</span><select name={name} defaultValue={defaultValue} style={inputStyle}>{options.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select></label>;
}

function sourceLabel(lead: Lead) {
  if (lead.sourceSystem === "monday") return lead.mondayItemId ? `Monday ${lead.mondayItemId}` : "Monday";
  return lead.source || lead.sourceSystem;
}

function SourceLink({ lead }: { lead: Lead }) {
  if (!lead.sourceUrl) return <span style={{ ...smallMutedStyle, justifySelf: "end" }}>No source link</span>;
  return <a href={lead.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source record for ${lead.customerName}`} style={sourceLinkStyle}>Open source ↗</a>;
}

function LeadListHeader() {
  return (
    <div data-lead-list-header="true" style={headerRowStyle}>
      <span>Lead</span>
      <span>Status</span>
      <span>Next step</span>
      <span>Follow-up</span>
      <span>Value</span>
      <span>Actions</span>
    </div>
  );
}

function LeadRow({ lead, selected, onSelect }: { lead: Lead; selected: boolean; onSelect: () => void }) {
  const warnings = leadWarnings(lead);
  return (
    <article data-lead-row="true" style={{ ...rowStyle, borderColor: selected ? "rgba(210,174,109,0.80)" : isDue(lead) ? "rgba(180,107,70,0.30)" : DT.border }}>
      <button data-lead-row-button="true" type="button" onClick={onSelect} aria-expanded={selected} aria-label={`Open details for ${lead.customerName}`} style={rowButtonStyle}>
        <div data-lead-row-main="true" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: 999, background: lead.priority === "hot" ? "#b46b46" : lead.priority === "low" ? "#b9b2a4" : DT.gold, flex: "0 0 auto" }} />
              <strong title={lead.customerName} style={{ fontFamily: DT.serif, fontSize: 17, color: DT.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.customerName}</strong>
          </div>
          <div style={{ ...smallMutedStyle, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[lead.productCategory, lead.contactName].filter(Boolean).join(" · ") || "Lead"}</div>
        </div>
        <div data-lead-row-status="true" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <Chip label={STATUS_LABELS[lead.status]} tone={statusTone(lead.status)} />
          {lead.priority !== "normal" && <Chip label={lead.priority.toUpperCase()} tone={priorityTone(lead.priority)} />}
          {warnings.slice(0, 2).map((warning) => <Chip key={warning.label} label={warning.label} tone={warning.tone} />)}
        </div>
        <span data-lead-row-next="true" style={rowTextStyle}>{isRecentSampleFollowUp(lead) ? sampleFollowUpLabel(lead) : bookedVisitSummary(lead) || sourceActionLabel(lead)}</span>
        <span data-lead-row-followup="true" style={{ ...rowTextStyle, color: isDue(lead) ? "#8f3f24" : DT.textPrimary, fontWeight: 900 }}>{dateLabel(lead.nextFollowUpAt)}</span>
        <span data-lead-row-value="true" style={{ ...rowTextStyle, fontWeight: 900, color: lead.estimatedValue ? DT.textPrimary : DT.textFaint }}>{valueLabel(lead.estimatedValue)}</span>
      </button>
      <div data-lead-row-footer="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={smallMutedStyle}>{sourceLabel(lead)}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <SourceLink lead={lead} />
        </div>
      </div>
    </article>
  );
}

function LeadDrawer({ lead, visibleIds, onClose, onSaved }: { lead: Lead | null; visibleIds: Set<string>; onClose: () => void; onSaved: () => void }) {
  const [saving, startSaving] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!lead) return null;

  const submitUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = readForm(event.currentTarget);
    setError(null);
    startSaving(async () => {
      try {
        await jsonFetch(`/api/leads/${lead.id}`, "PATCH", payload);
        setEditing(false);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const hiddenByFilter = !visibleIds.has(lead.id);
  return (
    <aside data-lead-drawer-overlay="true" style={drawerOverlayStyle} aria-label="Lead detail drawer" onClick={onClose}>
      <div data-lead-drawer-panel="true" style={drawerStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={labelStyle}>Lead detail</div>
            <h2 style={{ margin: "3px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 28, lineHeight: 1.05 }}>{lead.customerName}</h2>
            <div style={{ marginTop: 5, fontFamily: DT.sans, color: DT.textMuted, fontSize: 12 }}>{[lead.contactName, lead.productCategory, sourceLabel(lead)].filter(Boolean).join(" · ")}</div>
          </div>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>Close</button>
        </div>
        {hiddenByFilter && <div style={{ ...errorStyle, marginBottom: 10, color: DT.textSecondary, background: "rgba(210,174,109,0.10)", borderColor: "rgba(210,174,109,0.25)" }}>This lead is outside the current filter, but remains open for reference.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <Chip label={STATUS_LABELS[lead.status]} tone={statusTone(lead.status)} />
          <Chip label={lead.priority.toUpperCase()} tone={priorityTone(lead.priority)} />
          {leadWarnings(lead).map((warning) => <Chip key={warning.label} label={warning.label} tone={warning.tone} />)}
        </div>
        <div style={{ background: "rgba(210,174,109,0.10)", border: `1px solid ${DT.border}`, borderRadius: DT.radiusSm, padding: 11, marginBottom: 12 }}>
          <div style={labelStyle}>Why it matters today</div>
          <div style={{ marginTop: 4, fontFamily: DT.sans, fontWeight: 900, color: DT.textPrimary, fontSize: 14 }}>{whyNow(lead)}</div>
          <div style={{ marginTop: 5, fontFamily: DT.sans, color: DT.textMuted, fontSize: 12 }}>Use this for context here; ask Hermes in chat to draft or run follow-up.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8, marginBottom: 12 }}>
          <Info label="Next action" value={sourceActionLabel(lead)} warn={needsNextStep(lead)} />
          <Info label="Follow-up" value={dateLabel(lead.nextFollowUpAt)} warn={isDue(lead)} />
          <Info label="Sample status" value={isRecentSampleFollowUp(lead) ? sampleFollowUpLabel(lead) : "No active sample follow-up"} warn={isRecentSampleFollowUp(lead)} />
          <Info label="Value" value={valueLabel(lead.estimatedValue)} strong />
          <Info label="Contact" value={[lead.email, lead.phone].filter(Boolean).join(" · ") || "No contact stored"} warn={!lead.email && !lead.phone} />
        </div>
        {isRecentSampleFollowUp(lead) && (
          <div style={{ background: "rgba(12,124,122,0.08)", border: "1px solid rgba(12,124,122,0.18)", borderRadius: DT.radiusSm, padding: 11, marginBottom: 12 }}>
            <div style={labelStyle}>Draft follow-up copy</div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap", fontFamily: DT.sans, color: DT.textSecondary, fontSize: 13, lineHeight: 1.45 }}>{sampleDraftPrompt(lead)}</div>
          </div>
        )}
        {bookedVisitSummary(lead) && <div style={{ background: "rgba(110,138,106,0.08)", border: "1px solid rgba(110,138,106,0.18)", borderRadius: DT.radiusSm, padding: 11, marginBottom: 12, fontFamily: DT.sans, fontSize: 13, color: DT.textSecondary }}><strong style={{ color: DT.textPrimary }}>Actual context:</strong> {bookedVisitSummary(lead)}</div>}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <Info label="Last touch" value={lead.lastInteractionSummary || dateLabel(lead.lastInteractionAt) || "No summary stored"} />
          <Info label="Notes / Monday context" value={lead.notes || "No notes stored"} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <SourceLink lead={lead} />
          <button type="button" onClick={() => setEditing((value) => !value)} style={editing ? primaryButtonStyle : secondaryButtonStyle}>{editing ? "Close edit fields" : "Edit lead"}</button>
        </div>
        {editing && (
          <form onSubmit={submitUpdate} style={{ display: "grid", gap: 9, borderTop: `1px solid ${DT.border}`, paddingTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <Select name="status" label="Status" defaultValue={lead.status} options={STATUS_OPTIONS} />
              <Select name="priority" label="Priority" defaultValue={lead.priority} options={PRIORITY_OPTIONS} />
              <Input name="nextFollowUpAt" label="Next follow-up" type="date" defaultValue={dateKey(lead.nextFollowUpAt) || ""} />
              <Input name="estimatedValue" label="Value" type="number" defaultValue={lead.estimatedValue?.toString() || ""} />
            </div>
            <Input name="nextAction" label="Next step" defaultValue={lead.nextAction || ""} />
            <Input name="lastInteractionSummary" label="Last touch summary" defaultValue={lead.lastInteractionSummary || ""} />
            <Textarea name="notes" label="Notes" defaultValue={lead.notes || ""} rows={7} />
            {error && <div style={errorStyle}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setEditing(false)} style={secondaryButtonStyle}>Cancel</button>
              <button type="submit" disabled={saving} style={primaryButtonStyle}>{saving ? "Saving…" : "Save lead"}</button>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}

function DecisionQueue({ leads, limit = 8, onSelect }: { leads: Lead[]; limit?: number; onSelect: (lead: Lead) => void }) {
  const fullQueue = leads.filter(doToday).sort(sortByUrgency);
  const queue = fullQueue.slice(0, limit);
  if (queue.length === 0) return null;
  return (
    <section style={{ background: "linear-gradient(135deg, rgba(248,241,228,0.98), rgba(255,252,246,0.98))", border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 24 }}>Do Today</h2>
          <p style={{ margin: "3px 0 0", fontFamily: DT.sans, fontSize: 12, color: DT.textMuted }}>Start here: protect cashflow and unblock Monday follow-ups.</p>
        </div>
        <Chip label={`Top ${queue.length} of ${fullQueue.length}`} tone="amber" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))", gap: 8 }}>
        {queue.map((lead) => (
          <button key={lead.id} type="button" onClick={() => onSelect(lead)} style={{ textAlign: "left", border: `1px solid ${DT.border}`, borderRadius: DT.radiusSm, background: DT.cardBg, padding: 10, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
              <strong title={lead.customerName} style={{ fontFamily: DT.serif, fontSize: 16, color: DT.textPrimary, lineHeight: 1.1 }}>{lead.customerName}</strong>
              <span style={{ fontFamily: DT.sans, color: lead.estimatedValue ? DT.textSecondary : DT.textFaint, fontWeight: 900, fontSize: 11 }}>{lead.estimatedValue ? money(lead.estimatedValue) : "No value"}</span>
            </div>
            <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 12, color: DT.textSecondary, lineHeight: 1.3 }}>{whyNow(lead)}</div>
            <div style={{ marginTop: 7, display: "flex", gap: 5, flexWrap: "wrap" }}>
              {leadWarnings(lead).slice(0, 2).map((warning) => <Chip key={warning.label} label={warning.label} tone={warning.tone} />)}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function CashFirstStrip({ leads, limit = 4, onSelect }: { leads: Lead[]; limit?: number; onSelect: (lead: Lead) => void }) {
  const allCashLeads = cashFirstLeads(leads);
  const cashLeads = allCashLeads.slice(0, limit);
  const total = allCashLeads.reduce((sum, lead) => sum + (lead.estimatedValue || 0), 0);
  if (cashLeads.length === 0) return null;
  return (
    <section style={{ background: "linear-gradient(135deg, rgba(255,250,239,0.98), rgba(246,237,219,0.98))", border: "1px solid rgba(180,107,70,0.18)", borderRadius: DT.radius, boxShadow: DT.shadow, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={labelStyle}>Cash first</div>
          <h2 style={{ margin: "2px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 24 }}>Protect quoted/high-value work</h2>
          <p style={{ margin: "3px 0 0", fontFamily: DT.sans, fontSize: 12, color: DT.textMuted }}>Read-only: quotes and high-value leads only. No status changes here.</p>
        </div>
        <div style={{ display: "grid", gap: 3, textAlign: "right" }}>
          <span style={labelStyle}>Top cash value</span>
          <strong style={{ fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22 }}>{money(total)}</strong>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
        {cashLeads.map((lead) => (
          <button key={lead.id} type="button" onClick={() => onSelect(lead)} style={{ display: "grid", gap: 6, textAlign: "left", border: "1px solid rgba(180,107,70,0.16)", borderRadius: DT.radiusSm, background: DT.cardBg, padding: 10, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "start" }}>
              <strong title={lead.customerName} style={{ fontFamily: DT.serif, fontSize: 16, color: DT.textPrimary, lineHeight: 1.1 }}>{lead.customerName}</strong>
              <span style={{ fontFamily: DT.sans, color: DT.textSecondary, fontWeight: 900, fontSize: 11 }}>{valueLabel(lead.estimatedValue)}</span>
            </div>
            <span style={{ ...rowTextStyle, whiteSpace: "normal", overflow: "visible" }}>{whyNow(lead)}</span>
            <span style={{ fontFamily: DT.sans, color: "#8f3f24", fontSize: 11, fontWeight: 900 }}>Open context</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function NewLeadForm({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = readForm(form);
    setError(null);
    startSaving(async () => {
      try {
        await jsonFetch("/api/leads", "POST", payload);
        form.reset();
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={secondaryButtonStyle}>Add lead</button>;
  return (
    <form onSubmit={submitCreate} style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 14, display: "grid", gap: 10, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22 }}>Add lead</h2><Chip label="Manual record" tone="teal" /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 8 }}>
        <Input name="customerName" label="Customer / company" required />
        <Input name="contactName" label="Contact" />
        <Input name="email" label="Email" type="email" />
        <Input name="phone" label="Phone" />
        <Input name="productCategory" label="Product/category" />
        <Input name="estimatedValue" label="Estimated value" type="number" />
        <Select name="status" label="Status" defaultValue="new" options={STATUS_OPTIONS} />
        <Select name="priority" label="Priority" defaultValue="normal" options={PRIORITY_OPTIONS} />
        <Input name="nextFollowUpAt" label="Next follow-up" type="date" />
        <Input name="source" label="Source" />
      </div>
      <Input name="nextAction" label="Next step" />
      <Input name="lastInteractionSummary" label="Last touch summary" />
      <Textarea name="notes" label="Notes" />
      {error && <div style={errorStyle}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}><button type="button" onClick={() => setOpen(false)} style={secondaryButtonStyle}>Cancel</button><button type="submit" disabled={saving} style={primaryButtonStyle}>{saving ? "Creating…" : "Create lead"}</button></div>
    </form>
  );
}

function EmptyState({ error }: { error?: string }) {
  return <section style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderRadius: DT.radius, boxShadow: DT.shadow, padding: 20 }}><h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 24 }}>No leads found</h2><p style={{ color: DT.textSecondary, fontFamily: DT.sans, fontSize: 13, lineHeight: 1.5, maxWidth: 760 }}>Tuesday is connected, but there are no lead records to show. Add a manual lead or check the import/source settings.</p>{error && <p style={errorStyle}>{error}</p>}</section>;
}

function MetricButton({ label, value, tone, active, onClick }: { label: string; value: string | number; tone?: "good" | "warn" | "bad" | "neutral"; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} style={{ border: `1px solid ${active ? "rgba(210,174,109,0.65)" : DT.border}`, borderRadius: DT.radius, background: active ? DT.goldSoft : "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}><KpiCard label={label} value={value} tone={tone} /></button>;
}

function MobileMetricButton({ label, value, active, onClick }: { label: string; value: string | number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={{ minWidth: 0, minHeight: 44, border: `1px solid ${active ? "rgba(210,174,109,0.58)" : DT.border}`, borderRadius: 10, background: active ? DT.goldSoft : "rgba(255,255,255,0.76)", color: active ? "#8a5b1f" : DT.textSecondary, padding: "7px 6px", textAlign: "center", cursor: "pointer", touchAction: "manipulation" }}>
      <span style={{ display: "block", fontFamily: DT.sans, fontSize: 8.5, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.1, color: DT.textFaint }}>{label}</span>
      <strong style={{ display: "block", marginTop: 3, fontFamily: DT.serif, fontSize: 17, lineHeight: 1, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</strong>
    </button>
  );
}

const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 10, padding: "8px 10px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: "#fff" };
const fieldStyle: CSSProperties = { display: "grid", gap: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 800, color: DT.textFaint, fontFamily: DT.sans };
const labelStyle: CSSProperties = { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 900, color: DT.textFaint, fontFamily: DT.sans };
const primaryButtonStyle: CSSProperties = { minHeight: 40, border: "none", background: DT.gold, color: DT.headerBg, borderRadius: 999, padding: "8px 13px", fontSize: 11, fontWeight: 900, fontFamily: DT.sans, cursor: "pointer", touchAction: "manipulation" };
const secondaryButtonStyle: CSSProperties = { minHeight: 40, border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textSecondary, borderRadius: 999, padding: "8px 13px", fontSize: 11, fontWeight: 800, fontFamily: DT.sans, cursor: "pointer", touchAction: "manipulation" };
const secondaryTinyButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "6px 9px", fontSize: 10 };
const sourceLinkStyle: CSSProperties = { ...secondaryTinyButtonStyle, display: "inline-flex", gap: 5, alignItems: "center", textDecoration: "none" };
const errorStyle: CSSProperties = { color: "#8f3f24", background: "rgba(180,107,70,0.08)", border: "1px solid rgba(180,107,70,0.16)", borderRadius: 10, padding: 10, fontFamily: DT.sans, fontSize: 12 };
const smallMutedStyle: CSSProperties = { fontFamily: DT.sans, color: DT.textMuted, fontSize: 11 };
const headerRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px, 1.25fr) minmax(210px, 1fr) minmax(145px, 0.75fr) minmax(105px, 0.55fr) minmax(85px, 0.45fr) minmax(150px, 0.65fr)", gap: 10, padding: "0 12px 6px", fontFamily: DT.sans, color: DT.textFaint, fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
const rowStyle: CSSProperties = { background: "rgba(255,252,246,0.94)", border: `1px solid ${DT.border}`, borderRadius: 14, padding: 10, display: "grid", gap: 8 };
const rowButtonStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px, 1.25fr) minmax(210px, 1fr) minmax(145px, 0.75fr) minmax(105px, 0.55fr) minmax(85px, 0.45fr)", gap: 10, alignItems: "center", textAlign: "left", border: "none", background: "transparent", padding: 0, cursor: "pointer", minWidth: 0 };
const rowTextStyle: CSSProperties = { fontFamily: DT.sans, fontSize: 12, color: DT.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const drawerOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 80, background: "rgba(38,32,25,0.30)", cursor: "default", display: "grid", placeItems: "center", padding: 18 };
const drawerStyle: CSSProperties = { width: "min(760px, calc(100vw - 36px))", maxHeight: "min(760px, calc(100vh - 36px))", overflowY: "auto", background: "#fffaf1", border: `1px solid ${DT.border}`, borderRadius: 22, boxShadow: "0 28px 70px rgba(31,24,15,0.28)", padding: 20 };
const LEADS_MOBILE_CSS = `
  @media (max-width: 759px) {
    [data-lead-list-header="true"] { display: none !important; }
    [data-lead-row="true"] { border-radius: 16px !important; padding: 12px !important; gap: 10px !important; }
    [data-lead-row-button="true"] {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      grid-template-areas:
        "main value"
        "status status"
        "next next"
        "follow follow" !important;
      gap: 8px !important;
      align-items: start !important;
      width: 100% !important;
    }
    [data-lead-row-main="true"] { grid-area: main !important; }
    [data-lead-row-main="true"] strong {
      display: block !important;
      max-width: 100% !important;
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      line-height: 1.14 !important;
    }
    [data-lead-row-main="true"] > div {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      line-height: 1.28 !important;
    }
    [data-lead-row-status="true"] { grid-area: status !important; gap: 5px !important; }
    [data-lead-row-next="true"] {
      grid-area: next !important;
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
      line-height: 1.35 !important;
    }
    [data-lead-row-followup="true"] {
      grid-area: follow !important;
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: clip !important;
    }
    [data-lead-row-value="true"] {
      grid-area: value !important;
      justify-self: end !important;
      text-align: right !important;
      white-space: nowrap !important;
      max-width: 104px !important;
    }
    [data-lead-row-footer="true"] {
      align-items: flex-start !important;
      flex-direction: column !important;
      gap: 6px !important;
    }
    [data-lead-filter-bar="true"] {
      position: sticky !important;
      top: 57px !important;
      z-index: 45 !important;
      margin-left: -12px !important;
      margin-right: -12px !important;
      padding: 8px 12px !important;
      background: rgba(248,245,238,0.96) !important;
    }
    [data-lead-filter-scroll="true"] {
      display: flex !important;
      flex-wrap: nowrap !important;
      gap: 7px !important;
      overflow-x: auto !important;
      max-width: 100% !important;
      padding-bottom: 2px !important;
      -webkit-overflow-scrolling: touch !important;
    }
    [data-lead-filter-scroll="true"] button { min-width: 44px !important; min-height: 40px !important; white-space: nowrap !important; flex: 0 0 auto !important; }
    [data-lead-filter-bar="true"] form { flex: 0 0 auto !important; }
    [data-lead-filter-bar="true"] form button { min-height: 40px !important; }
    [data-lead-result-copy="true"] {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 4px !important;
      align-items: start !important;
      line-height: 1.35 !important;
    }
    [data-lead-drawer-overlay="true"] {
      padding: 0 !important;
      place-items: stretch !important;
      align-items: stretch !important;
    }
    [data-lead-drawer-panel="true"] {
      width: 100% !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
      padding: 16px !important;
    }
  }
`;

export default function LeadsClient({ result }: { result: LeadsResult }) {
  const [filter, setFilter] = useState<LeadFilter>("do_today");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleExpandedKey, setVisibleExpandedKey] = useState<string | null>(null);
  const isNarrow = useIsNarrow(760);
  const router = useRouter();

  const activeRows = useMemo(() => result.rows.filter((lead) => !isClosed(lead)), [result.rows]);
  const cashflowRows = useMemo(() => activeRows.filter(isCashflowQuote), [activeRows]);
  const sampleFollowUpRows = useMemo(() => sortSampleFollowUps(activeRows.filter((lead) => isRecentSampleFollowUp(lead))), [activeRows]);
  const selectedLead = useMemo(() => result.rows.find((lead) => lead.id === selectedId) || null, [result.rows, selectedId]);

  const visible = useMemo(() => {
    const rows = result.rows
      .filter((lead) => {
        if (filter === "do_today") return doToday(lead);
        if (filter === "sample_followups") return isRecentSampleFollowUp(lead);
        if (filter === "overdue") return isDue(lead);
        if (filter === "cashflow") return isCashflowQuote(lead);
        if (filter === "hot") return lead.priority === "hot" && !isClosed(lead);
        if (filter === "needs_next_step") return needsNextStep(lead);
        if (filter === "waiting") return lead.status === "waiting_on_customer" && !isClosed(lead);
        if (filter === "active") return !isClosed(lead);
        if (filter === "closed") return isClosed(lead);
        return true;
      })
      .filter((lead) => (search.trim() ? matchesSearch(lead, search) : true));
    if (filter === "sample_followups") return sortSampleFollowUps(rows);
    return rows.sort(filter === "cashflow" ? sortByCashflow : sortByUrgency);
  }, [filter, result.rows, search]);

  const visibleIds = useMemo(() => new Set(visible.map((lead) => lead.id)), [visible]);
  const mobileVisibleLimit = 24;
  const visibleContextKey = `${filter}:${search.trim().toLowerCase()}`;
  const visibleExpanded = visibleExpandedKey === visibleContextKey;
  const visibleRows = isNarrow && !visibleExpanded ? visible.slice(0, mobileVisibleLimit) : visible;
  const hot = activeRows.filter((lead) => lead.priority === "hot").length;
  const overdue = activeRows.filter(isDue).length;
  const quotedValue = cashflowRows.reduce((sum, lead) => sum + (lead.estimatedValue || 0), 0);
  const missingNext = activeRows.filter(needsNextStep).length;
  const closed = result.rows.length - activeRows.length;

  const filters: Array<[LeadFilter, string]> = [
    ["do_today", "Do Today"],
    ["sample_followups", "Sample Follow-ups"],
    ["overdue", "Overdue"],
    ["cashflow", "Cashflow Quotes"],
    ["hot", "Hot"],
    ["needs_next_step", "Needs Next Step"],
    ["waiting", "Waiting"],
    ["active", "All Active"],
    ["closed", "Closed / history"],
    ["all", "All"],
  ];

  const refresh = () => router.refresh();

  return (
    <MissionControlShell section="leads" pageTitle="Leads" pageSubtitle="Tuesday source-of-truth board: scan the work, then ask Hermes to follow up" syncedAt={result.syncedAt} source={result.source} mondayError={result.error} pageTitleAccessory={<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all visible fields…" style={{ width: "100%", minHeight: 40, border: `1px solid ${DT.border}`, borderRadius: 999, padding: "9px 13px", fontFamily: DT.sans, fontSize: 12, background: DT.cardBg, color: DT.textPrimary }} />}>
      <style>{LEADS_MOBILE_CSS}</style>
      {isNarrow ? (
        <div data-lead-mobile-metrics="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
          <MobileMetricButton label="Overdue" value={overdue} active={filter === "overdue"} onClick={() => setFilter("overdue")} />
          <MobileMetricButton label="Samples" value={sampleFollowUpRows.length} active={filter === "sample_followups"} onClick={() => setFilter("sample_followups")} />
          <MobileMetricButton label="Quoted" value={money(quotedValue)} active={filter === "cashflow"} onClick={() => setFilter("cashflow")} />
          <MobileMetricButton label="Hot" value={hot} active={filter === "hot"} onClick={() => setFilter("hot")} />
          <MobileMetricButton label="No step" value={missingNext} active={filter === "needs_next_step"} onClick={() => setFilter("needs_next_step")} />
          <MobileMetricButton label="Active" value={activeRows.length} active={filter === "active"} onClick={() => setFilter("active")} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <MetricButton label="Overdue now" value={overdue} tone={overdue ? "warn" : "good"} active={filter === "overdue"} onClick={() => setFilter("overdue")} />
          <MetricButton label="Recent sample follow-ups" value={sampleFollowUpRows.length} tone={sampleFollowUpRows.length ? "warn" : "good"} active={filter === "sample_followups"} onClick={() => setFilter("sample_followups")} />
          <MetricButton label="Open quoted value" value={money(quotedValue)} active={filter === "cashflow"} onClick={() => setFilter("cashflow")} />
          <MetricButton label="Hot leads" value={hot} tone={hot ? "bad" : "neutral"} active={filter === "hot"} onClick={() => setFilter("hot")} />
          <MetricButton label="Missing next step" value={missingNext} tone={missingNext ? "bad" : "good"} active={filter === "needs_next_step"} onClick={() => setFilter("needs_next_step")} />
          <KpiCard label="Active leads" value={activeRows.length} />
          <KpiCard label="Closed leads hidden" value={closed} tone="neutral" />
        </div>
      )}

      <CashFirstStrip leads={activeRows} limit={isNarrow ? 2 : 4} onSelect={(lead) => setSelectedId(lead.id)} />
      <DecisionQueue leads={activeRows} limit={isNarrow ? 4 : 8} onSelect={(lead) => setSelectedId(lead.id)} />

      <div data-lead-filter-bar="true" style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 14, padding: "8px 0", background: "rgba(248,245,238,0.94)", backdropFilter: "blur(10px)" }}>
        <div data-lead-filter-scroll="true" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {filters.map(([key, label]) => <button key={key} onClick={() => setFilter(key)} style={{ border: `1px solid ${filter === key ? "rgba(210,174,109,0.50)" : DT.border}`, background: filter === key ? DT.goldSoft : DT.cardBg, color: filter === key ? "#8a5b1f" : DT.textSecondary, borderRadius: 999, padding: "7px 11px", fontSize: 11, fontWeight: 800, fontFamily: DT.sans, cursor: "pointer" }}>{label}</button>)}
        </div>
        <NewLeadForm onSaved={refresh} />
      </div>

      {result.rows.length === 0 ? <EmptyState error={result.error} /> : (
        <>
          {result.error && <div style={{ ...errorStyle, marginBottom: 12 }}>{result.error}</div>}
          <div data-lead-result-copy="true" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10, color: DT.textMuted, fontFamily: DT.sans, fontSize: 12 }}>
            <span>{visibleRows.length} of {visible.length} matching leads shown · {result.rows.length} total</span>
            <span>{filter === "do_today" ? `Default: priority list. Top ${isNarrow ? 4 : 8} are highlighted above.` : filter === "sample_followups" ? "Showing sample recipients who likely need a warm follow-up." : filter === "overdue" ? "Showing only overdue follow-ups." : "Sorted by urgency, cashflow, follow-up date"}</span>
          </div>
          <LeadListHeader />
          <div style={{ display: "grid", gap: 8 }}>
            {visibleRows.map((lead) => <LeadRow key={lead.id} lead={lead} selected={lead.id === selectedId} onSelect={() => setSelectedId(lead.id)} />)}
          </div>
          {visibleRows.length < visible.length && (
            <button type="button" onClick={() => setVisibleExpandedKey(visibleContextKey)} style={{ ...secondaryButtonStyle, width: "100%", marginTop: 10 }}>
              Show all {visible.length} matching leads
            </button>
          )}
        </>
      )}
      <LeadDrawer lead={selectedLead} visibleIds={visibleIds} onClose={() => setSelectedId(null)} onSaved={refresh} />
    </MissionControlShell>
  );
}
