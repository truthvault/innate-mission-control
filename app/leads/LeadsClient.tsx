'use client';

import Link from "next/link";
import type { LeadRecord, LeadsResult, LeadStatusBucket } from "@/lib/leads/types";

const DT = {
  pageBg: "#f5f3ee",
  cardBg: "#fffdfa",
  headerBg: "#1f1c17",
  teal: "#0c7c7a",
  tealSoft: "rgba(12,124,122,0.08)",
  gold: "#c8a96e",
  goldSoft: "rgba(200,169,110,0.12)",
  sage: "#6e8a6a",
  clay: "#9a5231",
  textPrimary: "#22201a",
  textSecondary: "#5a5549",
  textMuted: "#7c746b",
  textFaint: "#9a9088",
  border: "rgba(34,32,26,0.09)",
  shadow: "0 10px 28px rgba(34,32,26,0.06)",
  sans: "'DM Sans', -apple-system, sans-serif",
  serif: "'Fraunces', Georgia, serif",
};

const BUCKETS: Array<{ id: LeadStatusBucket; label: string; help: string; color: string }> = [
  { id: "hot", label: "Hot / cash-relevant", help: "Quote, urgent, high value, deposit/paid signals", color: DT.clay },
  { id: "followUp", label: "Needs follow-up", help: "Due, stale, or no next action", color: "#b7791f" },
  { id: "active", label: "Active", help: "Moving with a future next step", color: DT.teal },
  { id: "waiting", label: "Waiting on customer", help: "Reply/approval/info needed from customer", color: DT.sage },
  { id: "won", label: "Won", help: "Accepted/paid/deposit", color: "#15803d" },
  { id: "parked", label: "Parked", help: "Future, hold, nurture", color: DT.textMuted },
  { id: "lost", label: "Lost", help: "Closed lost/cancelled/dead", color: "#8a3b2f" },
];

function formatMoney(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function leadSearchText(lead: LeadRecord) {
  return `${lead.name} ${lead.contact} ${lead.source} ${lead.product} ${lead.status} ${lead.owner} ${lead.notes}`.toLowerCase();
}

function StatCard({ label, value, hint, color }: { label: string; value: string | number; hint: string; color: string }) {
  return (
    <div style={{ background: DT.cardBg, border: `1px solid ${DT.border}`, borderLeft: `5px solid ${color}`, borderRadius: 16, padding: 14, boxShadow: DT.shadow }}>
      <div style={{ fontFamily: DT.serif, fontSize: 28, lineHeight: 1, color: DT.textPrimary }}>{value}</div>
      <div style={{ marginTop: 5, fontWeight: 850, fontSize: 12, color: DT.textPrimary }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>{hint}</div>
    </div>
  );
}

function LeadCard({ lead }: { lead: LeadRecord }) {
  return (
    <article style={{ background: "rgba(255,255,255,0.78)", border: `1px solid ${DT.border}`, borderRadius: 14, padding: 14, display: "grid", gap: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900, color: DT.textPrimary, fontSize: 15, lineHeight: 1.2 }}>{lead.name}</div>
          <div style={{ marginTop: 3, color: DT.textMuted, fontSize: 12 }}>{lead.contact || "No contact on row"}</div>
        </div>
        <div style={{ textAlign: "right", color: DT.textPrimary, fontWeight: 900, fontSize: 13 }}>{formatMoney(lead.estimatedValue)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
        <Mini label="Status" value={lead.status || "Active"} />
        <Mini label="Owner" value={lead.owner || "—"} />
        <Mini label="Next follow-up" value={formatDate(lead.nextFollowUp)} />
        <Mini label="Last touch" value={formatDate(lead.lastInteraction)} />
        <Mini label="Product" value={lead.product || "—"} />
        <Mini label="Source" value={lead.source || "—"} />
      </div>
      {lead.notes && <p style={{ margin: 0, color: DT.textSecondary, fontSize: 12, lineHeight: 1.45, background: "rgba(200,169,110,0.08)", borderRadius: 10, padding: 9 }}>{lead.notes}</p>}
      {lead.mondayUrl && <a href={lead.mondayUrl} target="_blank" rel="noopener noreferrer" style={{ color: DT.teal, fontWeight: 850, fontSize: 12, textDecoration: "none" }}>Open source / Monday link →</a>}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(245,243,238,0.72)", borderRadius: 10, padding: "7px 8px", minWidth: 0 }}>
      <div style={{ color: DT.textFaint, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color: DT.textPrimary, fontSize: 12, fontWeight: 800, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

export default function LeadsClient({ result }: { result: LeadsResult }) {
  const leads = result.leads;
  const active = leads.filter((lead) => !["won", "lost", "parked"].includes(lead.bucket)).length;
  const hot = leads.filter((lead) => lead.bucket === "hot");
  const followUp = leads.filter((lead) => lead.bucket === "followUp");
  const waiting = leads.filter((lead) => lead.bucket === "waiting").length;
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: DT.pageBg, fontFamily: DT.sans, color: DT.textPrimary }}>
      <header style={{ background: DT.headerBg, color: "white", padding: "18px 22px", borderBottom: `1px solid ${DT.gold}` }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: DT.serif, fontSize: 24, fontWeight: 800 }}>Tuesday Leads</div>
            <div style={{ color: DT.gold, fontSize: 12, marginTop: 2 }}>Read-only Supabase overview · {result.table ? `table: ${result.table}` : "waiting for Supabase env"}</div>
          </div>
          <nav style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/production/plan" style={{ color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: 12, fontWeight: 750 }}>Workshop board</Link>
            <Link href="/production" style={{ color: "rgba(255,255,255,0.72)", textDecoration: "none", fontSize: 12, fontWeight: 750 }}>Orders</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: 22 }}>
        <section style={{ background: "linear-gradient(135deg, rgba(255,253,250,0.96), rgba(200,169,110,0.10))", border: `1px solid ${DT.border}`, borderRadius: 18, padding: 18, boxShadow: DT.shadow, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: DT.serif, fontSize: 20, fontWeight: 800 }}>Morning command board</div>
              <p style={{ margin: "6px 0 0", color: DT.textSecondary, fontSize: 13, lineHeight: 1.45 }}>Use this to see who needs attention tomorrow: hot cash-relevant enquiries first, then stale or due follow-ups, then normal active leads. Nothing here writes back to Supabase, Monday, Xero, or Shopify.</p>
            </div>
            <div style={{ color: DT.textMuted, fontSize: 11, alignSelf: "flex-start" }}>Loaded {formatDate(result.syncedAt)} · Source: {result.source === "supabase" ? "Supabase read-only" : "not configured"}</div>
          </div>
          {result.error && <div style={{ marginTop: 12, background: "rgba(154,82,49,0.10)", border: "1px solid rgba(154,82,49,0.24)", color: DT.clay, borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 750 }}>{result.error}</div>}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
          <StatCard label="Active leads" value={active} hint="Open, hot, follow-up, or waiting" color={DT.teal} />
          <StatCard label="Hot / cash" value={hot.length} hint="Prioritise these first" color={DT.clay} />
          <StatCard label="Follow-up due" value={followUp.length} hint="Due, stale, or missing next action" color="#b7791f" />
          <StatCard label="Waiting" value={waiting} hint="Customer needs to reply" color={DT.sage} />
          <StatCard label="Pipeline value" value={formatMoney(pipelineValue)} hint="Known estimated values only" color={DT.gold} />
        </div>

        {leads.length === 0 && (
          <div style={{ background: DT.cardBg, border: `1px dashed ${DT.border}`, borderRadius: 18, padding: 34, textAlign: "center", color: DT.textMuted, boxShadow: DT.shadow }}>
            <div style={{ fontFamily: DT.serif, color: DT.textPrimary, fontSize: 22, fontWeight: 800 }}>No leads to show yet</div>
            <p style={{ maxWidth: 620, margin: "8px auto 0", lineHeight: 1.5, fontSize: 13 }}>If Supabase is configured, the leads table may be empty or named differently. Set <code>SUPABASE_LEADS_TABLE</code> if the table is not <code>leads</code>.</p>
          </div>
        )}

        {leads.length > 0 && (
          <div style={{ display: "grid", gap: 16 }}>
            {BUCKETS.map((bucket) => {
              const bucketLeads = leads.filter((lead) => lead.bucket === bucket.id).sort((a, b) => (b.estimatedValue ?? 0) - (a.estimatedValue ?? 0) || leadSearchText(a).localeCompare(leadSearchText(b)));
              if (bucketLeads.length === 0) return null;
              return (
                <section key={bucket.id} style={{ background: "rgba(255,253,250,0.78)", border: `1px solid ${DT.border}`, borderRadius: 18, padding: 14, boxShadow: DT.shadow }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontFamily: DT.serif, fontSize: 20 }}>{bucket.label}</h2>
                    <span style={{ color: bucket.color, fontWeight: 950, fontSize: 12 }}>{bucketLeads.length}</span>
                    <span style={{ color: DT.textMuted, fontSize: 12 }}>{bucket.help}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
                    {bucketLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
