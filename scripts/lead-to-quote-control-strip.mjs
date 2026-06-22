#!/usr/bin/env node

import { createHash } from "node:crypto";

const OPEN_LEAD_STATUSES = new Set(["new", "qualifying", "quoted", "follow_up_due", "waiting_on_customer"]);
const CLOSED_LEAD_STATUSES = new Set(["won", "lost", "parked"]);
const QUOTE_TABLES = [
  "quote_requests",
  "quote_scenarios",
  "quote_cost_lines",
  "quote_source_links",
  "quote_audit_events",
  "quote_xero_draft_payloads",
];
const COUNT_TABLES = ["leads", "orders", "order_financial_documents", ...QUOTE_TABLES];

function parseArgs(argv) {
  const options = {
    format: "markdown",
    limit: 5,
    ownerBrief: false,
    quotePacketLeadId: null,
    verifyCounts: false,
    fixture: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.format = "json";
    else if (arg === "--format") options.format = argv[++index] || options.format;
    else if (arg.startsWith("--format=")) options.format = arg.slice("--format=".length);
    else if (arg === "--limit") options.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--owner-brief") options.ownerBrief = true;
    else if (arg === "--quote-packet" || arg === "--lead-id") options.quotePacketLeadId = argv[++index] || null;
    else if (arg.startsWith("--quote-packet=")) options.quotePacketLeadId = arg.slice("--quote-packet=".length);
    else if (arg.startsWith("--lead-id=")) options.quotePacketLeadId = arg.slice("--lead-id=".length);
    else if (arg === "--verify-counts") options.verifyCounts = true;
    else if (arg === "--fixture") options.fixture = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  options.limit = Number.isFinite(options.limit) ? Math.max(1, Math.min(Math.floor(options.limit), 20)) : 5;
  if (!["markdown", "json"].includes(options.format)) throw new Error("--format must be markdown or json");
  return options;
}

function usage() {
  return `Usage: node scripts/lead-to-quote-control-strip.mjs [options]

Read-only daily Lead-to-Quote control strip.

Options:
  --limit N                  Rows per section, default 5
  --json                     Output JSON
  --format markdown|json     Output format
  --owner-brief              Show lead/customer names for Guido-only internal use
  --quote-packet LEAD_ID     Add a draft quote-prep packet for one lead
  --verify-counts            Read row counts before and after generation
  --fixture                  Use local fixture data instead of Supabase
  --help                     Show this help

Supabase env, when not using --fixture:
  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, or NEXT_PUBLIC_SUPABASE_ANON_KEY`;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRead(supabase, path, { count = false } = {}) {
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: supabase.key,
      Authorization: `Bearer ${supabase.key}`,
      ...(count ? { Prefer: "count=exact" } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase read failed for ${path.split("?")[0]}: HTTP ${response.status} ${redact(text).slice(0, 220)}`);
  }

  const contentRange = response.headers.get("content-range");
  const exactCount = contentRange?.includes("/") ? Number(contentRange.split("/").pop()) : null;
  const rows = response.status === 204 ? [] : await response.json();
  return { rows: Array.isArray(rows) ? rows : [], count: Number.isFinite(exactCount) ? exactCount : null };
}

async function countTable(supabase, table) {
  try {
    const result = await supabaseRead(supabase, `${table}?select=id&limit=0`, { count: true });
    return { table, count: result.count ?? 0 };
  } catch (err) {
    return { table, count: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function readCounts(supabase) {
  const entries = await Promise.all(COUNT_TABLES.map((table) => countTable(supabase, table)));
  return Object.fromEntries(entries.map((entry) => [entry.table, entry]));
}

async function readLeads(supabase, limit) {
  const params = new URLSearchParams({
    select: [
      "id",
      "created_at",
      "updated_at",
      "customer_name",
      "contact_name",
      "source",
      "source_url",
      "source_system",
      "monday_item_id",
      "product_category",
      "estimated_value",
      "status",
      "priority",
      "owner",
      "next_follow_up_at",
      "last_interaction_at",
      "last_interaction_summary",
      "next_action",
      "archived_at",
    ].join(","),
    archived_at: "is.null",
    order: "updated_at.desc",
    limit: String(Math.max(50, limit * 20)),
  });
  const result = await supabaseRead(supabase, `leads?${params}`);
  return result.rows.map(normaliseLead);
}

async function readQuoteRequests(supabase, limit) {
  const params = new URLSearchParams({
    select: [
      "id",
      "created_at",
      "updated_at",
      "request_name",
      "customer_name",
      "source_channel",
      "product_area",
      "status",
      "owner",
      "metadata",
    ].join(","),
    order: "updated_at.desc",
    limit: String(limit),
  });
  try {
    const result = await supabaseRead(supabase, `quote_requests?${params}`);
    return { rows: result.rows.map(normaliseQuoteRequest), error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function readOneLead(supabase, leadId) {
  const params = new URLSearchParams({
    select: [
      "id",
      "created_at",
      "updated_at",
      "customer_name",
      "contact_name",
      "source",
      "source_url",
      "source_system",
      "monday_item_id",
      "product_category",
      "estimated_value",
      "status",
      "priority",
      "owner",
      "next_follow_up_at",
      "last_interaction_at",
      "last_interaction_summary",
      "next_action",
      "archived_at",
    ].join(","),
    id: `eq.${leadId}`,
    limit: "1",
  });
  const result = await supabaseRead(supabase, `leads?${params}`);
  return result.rows[0] ? normaliseLead(result.rows[0]) : null;
}

function fixtureData() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const oldFollowUp = new Date(today);
  oldFollowUp.setDate(today.getDate() - 21);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return {
    counts: Object.fromEntries(COUNT_TABLES.map((table) => [table, { table, count: QUOTE_TABLES.includes(table) ? 0 : table === "leads" ? 5 : 1 }])),
    leads: [
      {
        id: "fixture-hot",
        customerName: "Alex Example",
        productCategory: "boardroom table",
        estimatedValue: 14000,
        status: "follow_up_due",
        priority: "hot",
        owner: "Guido",
        nextFollowUpAt: oldFollowUp.toISOString(),
        lastInteractionAt: oldFollowUp.toISOString(),
        lastInteractionSummary: "Customer asked for price and timber options. alex@example.com",
        nextAction: "Prepare quote direction after confirming dimensions",
        source: "website",
        sourceSystem: "supabase",
        sourceUrl: "https://example.test/contact?email=alex@example.com",
        mondayItemId: "12345",
      },
      {
        id: "fixture-ready",
        customerName: "Morgan Quote",
        productCategory: "dining table",
        estimatedValue: 7200,
        status: "qualifying",
        priority: "normal",
        owner: "Guido",
        nextFollowUpAt: tomorrow.toISOString(),
        lastInteractionAt: today.toISOString(),
        nextAction: "Wait for Bethan to send dimensions, then prepare quote direction",
        source: "showroom",
        sourceSystem: "supabase",
      },
      {
        id: "fixture-waiting",
        customerName: "Taylor Waiting",
        productCategory: "outdoor",
        estimatedValue: 5200,
        status: "quoted",
        priority: "normal",
        owner: "Guido",
        nextFollowUpAt: yesterday.toISOString(),
        lastInteractionAt: yesterday.toISOString(),
        nextAction: "Follow up on quote",
        source: "gmail",
        sourceSystem: "supabase",
      },
      {
        id: "fixture-fresh-action",
        customerName: "Casey Current",
        productCategory: "benchtop",
        estimatedValue: 4300,
        status: "new",
        priority: "normal",
        owner: "Guido",
        nextFollowUpAt: today.toISOString(),
        lastInteractionAt: today.toISOString(),
        nextAction: "Call back to clarify project timing",
        source: "phone",
        sourceSystem: "supabase",
      },
      {
        id: "fixture-missing",
        customerName: "Sam Missing",
        productCategory: "",
        estimatedValue: null,
        status: "new",
        priority: "normal",
        owner: "",
        nextFollowUpAt: "",
        lastInteractionAt: today.toISOString(),
        nextAction: "",
        source: "instagram",
        sourceSystem: "supabase",
      },
      {
        id: "fixture-supplier-noise",
        customerName: "Supplier Noise",
        productCategory: "decking stock update",
        estimatedValue: null,
        status: "follow_up_due",
        priority: "hot",
        owner: "Guido",
        nextFollowUpAt: yesterday.toISOString(),
        lastInteractionAt: today.toISOString(),
        nextAction: "Check supplier stock update and payment settlement",
        source: "supplier email",
        sourceSystem: "supabase",
      },
    ].map(normaliseLead),
    quoteRequests: [],
  };
}

function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normaliseLead(row) {
  return {
    id: asString(row.id) || stableId(row.customer_name || row.customerName || "lead"),
    createdAt: asString(row.created_at || row.createdAt),
    updatedAt: asString(row.updated_at || row.updatedAt),
    customerName: asString(row.customer_name || row.customerName) || "Unnamed lead",
    source: asString(row.source),
    sourceUrl: asString(row.source_url || row.sourceUrl),
    sourceSystem: asString(row.source_system || row.sourceSystem) || "supabase",
    mondayItemId: asString(row.monday_item_id || row.mondayItemId),
    productCategory: asString(row.product_category || row.productCategory),
    estimatedValue: asNumber(row.estimated_value ?? row.estimatedValue),
    status: asString(row.status) || "new",
    priority: asString(row.priority) || "normal",
    owner: asString(row.owner),
    nextFollowUpAt: asString(row.next_follow_up_at || row.nextFollowUpAt),
    lastInteractionAt: asString(row.last_interaction_at || row.lastInteractionAt),
    lastInteractionSummary: asString(row.last_interaction_summary || row.lastInteractionSummary),
    nextAction: asString(row.next_action || row.nextAction),
    archivedAt: asString(row.archived_at || row.archivedAt),
  };
}

function normaliseQuoteRequest(row) {
  return {
    id: asString(row.id),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    requestName: asString(row.request_name),
    customerName: asString(row.customer_name),
    sourceChannel: asString(row.source_channel),
    productArea: asString(row.product_area),
    status: asString(row.status),
    readyToQuote: row.ready_to_quote === true || row.status === "draft_ready_for_review" || row.status === "approved",
    owner: asString(row.owner),
    warnings: arrayText(row.warnings),
    blockers: arrayText(row.blockers),
    assumptions: arrayText(row.assumptions),
    calculatedAt: asString(row.calculated_at),
  };
}

function arrayText(value) {
  if (Array.isArray(value)) return value.map((item) => safeText(item, 80)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [safeText(value, 80)];
  return [];
}

function stableId(value) {
  return createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function redact(value) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, (match) => /\d{4}-\d{2}-\d{2}/.test(match) ? match : "[phone]")
    .replace(/\b\d{1,5}\s+[A-Za-z][A-Za-z\s.'-]{2,}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Place|Pl|Terrace|Tce|Way|Crescent|Cres)\b/gi, "[address]");
}

function safeText(value, max = 96) {
  const text = redact(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function leadLabel(lead, ownerBrief) {
  return ownerBrief ? safeText(lead.customerName, 48) : `Lead ${stableId(lead.id)}`;
}

function ownerLabel(owner, ownerBrief) {
  if (!owner) return "unassigned";
  return ownerBrief ? safeText(owner, 32) : "assigned";
}

function actionLabel(value, ownerBrief, fallback = "Review and choose next action") {
  if (ownerBrief) return safeText(value || fallback, 110);
  const text = `${value || ""}`.toLowerCase();
  if (/payment|paid|settlement/.test(text)) return "Payment/status check set";
  if (/quote|price|pricing|estimate|cost|xero/.test(text)) return "Quote/pricing action set";
  if (/follow\s*up|callback|call|reply|response|voicemail/.test(text)) return "Follow-up action set";
  if (/sample/.test(text)) return "Sample action set";
  if (/delivery|freight|mainfreight|courier/.test(text)) return "Delivery/freight action set";
  return value ? "Next action set" : fallback;
}

function valueBand(value) {
  if (!Number.isFinite(value)) return "unknown";
  if (value >= 15000) return "$15k+";
  if (value >= 10000) return "$10k-$15k";
  if (value >= 5000) return "$5k-$10k";
  if (value > 0) return "under $5k";
  return "unknown";
}

function proof(lead) {
  const parts = [`Supabase lead ${stableId(lead.id)}`];
  if (lead.sourceSystem) parts.push(`source ${safeText(lead.sourceSystem, 24)}`);
  if (lead.source) parts.push(safeText(lead.source, 24));
  if (lead.mondayItemId) parts.push(`Monday ref present`);
  if (lead.sourceUrl) {
    try {
      parts.push(`URL domain ${new URL(lead.sourceUrl).hostname}`);
    } catch {
      parts.push("source URL present");
    }
  }
  return parts.join("; ");
}

function isDueTodayOrOverdue(value, now = new Date()) {
  if (!value) return false;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return false;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return due <= endOfToday;
}

function dueSort(a, b) {
  const left = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;
  const right = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Number.POSITIVE_INFINITY;
  return left - right;
}

function valueSort(a, b) {
  return (b.estimatedValue || 0) - (a.estimatedValue || 0);
}

function timestampMs(value) {
  if (!value) return null;
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function ageDays(value, now = new Date()) {
  const ms = timestampMs(value);
  if (ms === null) return null;
  return Math.floor((now.getTime() - ms) / 86400000);
}

function missingFacts(lead) {
  const missing = [];
  if (!lead.productCategory) missing.push("product/category");
  if (!Number.isFinite(lead.estimatedValue)) missing.push("value/budget signal");
  if (!lead.nextAction) missing.push("next action");
  if (!lead.nextFollowUpAt) missing.push("follow-up date");
  if (!lead.owner) missing.push("owner");
  return missing;
}

function quoteIntent(lead) {
  const text = `${lead.status} ${lead.nextAction} ${lead.lastInteractionSummary}`.toLowerCase();
  return /\bquote|price|pricing|estimate|cost|xero\b/.test(text);
}

function isLeadToQuoteNoise(lead) {
  const text = [
    lead.customerName,
    lead.source,
    lead.sourceSystem,
    lead.productCategory,
    lead.nextAction,
    lead.lastInteractionSummary,
  ].join(" ").toLowerCase();

  return /supplier email|stock update|payment settlement|mainfreight collection|freight collection|milling next week|sample order #|bookkeeping|accounts admin/.test(text);
}

function whyHot(lead) {
  const reasons = [];
  if (lead.priority === "hot") reasons.push("hot priority");
  if (lead.status === "follow_up_due") reasons.push("follow-up due");
  if (isDueTodayOrOverdue(lead.nextFollowUpAt)) reasons.push("due today/overdue");
  if ((lead.estimatedValue || 0) >= 10000) reasons.push("high value band");
  return reasons.length ? reasons.join(", ") : "active lead needs decision";
}

function importanceScore(lead, now = new Date()) {
  let score = 0;
  if (lead.priority === "hot") score += 1000;
  if (lead.status === "follow_up_due") score += 800;
  if (isDueTodayOrOverdue(lead.nextFollowUpAt, now)) score += 600;
  if (lead.status === "quoted" || lead.status === "waiting_on_customer") score += 220;
  if (quoteIntent(lead)) score += 180;
  score += Math.min(Math.floor((lead.estimatedValue || 0) / 100), 180);
  const followUpAge = ageDays(lead.nextFollowUpAt, now);
  if (followUpAge !== null && followUpAge > 0) score += Math.min(followUpAge * 10, 120);
  if (missingFacts(lead).length) score -= 60;
  return score;
}

function importanceSort(now = new Date()) {
  return (a, b) => {
    const scoreDiff = importanceScore(b, now) - importanceScore(a, now);
    if (scoreDiff) return scoreDiff;
    return dueSort(a, b) || valueSort(a, b) || String(a.id).localeCompare(String(b.id));
  };
}

function freshnessGate(lead, { quoteSpineEmpty = false, now = new Date() } = {}) {
  const missing = missingFacts(lead);
  const followUpAge = ageDays(lead.nextFollowUpAt, now);
  const lastTouchAge = ageDays(lead.lastInteractionAt || lead.updatedAt || lead.createdAt, now);
  const evidenceBits = [];

  if (lead.lastInteractionAt) evidenceBits.push(`last interaction ${safeText(lead.lastInteractionAt, 32)}`);
  else if (lead.updatedAt) evidenceBits.push(`lead updated ${safeText(lead.updatedAt, 32)}`);
  if (lead.nextFollowUpAt) evidenceBits.push(`follow-up due ${safeText(lead.nextFollowUpAt, 32)}`);
  if (lead.nextAction) evidenceBits.push(actionLabel(lead.nextAction, false));
  if (lead.source || lead.sourceSystem) evidenceBits.push(`source ${safeText([lead.sourceSystem, lead.source].filter(Boolean).join("/"), 40)}`);

  if (missing.length) {
    return {
      status: "missing-facts blocker",
      evidenceToVerify: `Resolve missing ${missing.join(", ")} before proposing any customer action.`,
      freshnessWarning: "missing-facts blocker; do not treat the stored next action as ready.",
    };
  }

  const staleReasons = [];
  if (followUpAge !== null && followUpAge > 1) staleReasons.push(`follow-up evidence is ${followUpAge} days old`);
  if (lastTouchAge === null) staleReasons.push("no last-touch evidence");
  else if (lastTouchAge > 14) staleReasons.push(`last touch is ${lastTouchAge} days old`);

  if (staleReasons.length) {
    return {
      status: "stale-source / needs verification",
      evidenceToVerify: `Check live Gmail/Monday/Supabase/source trail first: ${staleReasons.join("; ")}.`,
      freshnessWarning: `stale-source / needs verification: ${staleReasons.join("; ")}.`,
    };
  }

  if (quoteSpineEmpty && quoteIntent(lead)) {
    return {
      status: "quote-spine-empty fallback",
      evidenceToVerify: "Quote spine is empty; verify lead facts and costing evidence before any quote/customer action.",
      freshnessWarning: "quote-spine-empty fallback; lead row is not quote authority.",
    };
  }

  return {
    status: "action-ready; live freshness check pending",
    evidenceToVerify: `Before action, re-check live source trail against stored evidence: ${evidenceBits.join("; ") || proof(lead)}.`,
    freshnessWarning: "action-ready only after live freshness check; no customer action from stored row alone.",
  };
}

function rowAccuracyFields(lead, quoteSpineEmpty) {
  const gate = freshnessGate(lead, { quoteSpineEmpty });
  return {
    freshnessStatus: gate.status,
    evidenceToVerify: gate.evidenceToVerify,
    freshnessWarning: gate.freshnessWarning,
  };
}

function buildSections({ leads, quoteRequests, counts, options }) {
  const openLeads = leads.filter((lead) => OPEN_LEAD_STATUSES.has(lead.status) && !lead.archivedAt);
  const excludedNoiseCount = openLeads.filter(isLeadToQuoteNoise).length;
  const activeLeads = openLeads.filter((lead) => !isLeadToQuoteNoise(lead));
  const closedLeads = leads.filter((lead) => CLOSED_LEAD_STATUSES.has(lead.status));
  const quoteSpineEmpty = QUOTE_TABLES.every((table) => (counts[table]?.count ?? 0) === 0);
  const limit = options.limit;
  const sortedQueueLeads = [...activeLeads].sort(importanceSort());

  const workQueue = sortedQueueLeads
    .slice(0, limit)
    .map((lead) => ({
      lead: leadLabel(lead, options.ownerBrief),
      queueRule: "Work every active lead in this priority order, one at a time.",
      importance: whyHot(lead),
      valueBand: valueBand(lead.estimatedValue),
      due: safeText(lead.nextFollowUpAt || "not set", 32),
      recommendedNextAction: actionLabel(lead.nextAction, options.ownerBrief, "Decide next sales action"),
      latestProof: proof(lead),
      ...rowAccuracyFields(lead, quoteSpineEmpty),
    }));

  const hot = activeLeads
    .filter((lead) => lead.priority === "hot" || lead.status === "follow_up_due" || isDueTodayOrOverdue(lead.nextFollowUpAt) || (lead.estimatedValue || 0) >= 10000)
    .sort(importanceSort())
    .slice(0, limit)
    .map((lead) => ({
      lead: leadLabel(lead, options.ownerBrief),
      whyNow: whyHot(lead),
      latestProof: proof(lead),
      missingFact: missingFacts(lead)[0] || "none obvious from lead row",
      recommendedNextAction: actionLabel(lead.nextAction, options.ownerBrief, "Decide next sales action"),
      owner: ownerLabel(lead.owner, options.ownerBrief),
      due: safeText(lead.nextFollowUpAt || "not set", 32),
      ...rowAccuracyFields(lead, quoteSpineEmpty),
    }));

  const quoteReadyFromSpine = quoteRequests
    .filter((quote) => quote.readyToQuote || quote.status === "ready_to_quote")
    .slice(0, limit)
    .map((quote) => ({
      leadProject: options.ownerBrief ? safeText(quote.requestName || quote.customerName || quote.id, 48) : `Quote ${stableId(quote.id)}`,
      productArea: safeText(quote.productArea || "unknown", 40),
      factsComplete: quote.blockers.length ? "blocked" : "ready from quote spine",
      costSourceFreshness: quote.warnings.length ? "warnings present" : "not flagged",
      quoteBasis: "quote_requests ready_to_quote",
      blockers: quote.blockers.join("; ") || "none flagged",
      draftPacketStatus: "local draft only; not written",
      owner: ownerLabel(quote.owner, options.ownerBrief),
      freshnessStatus: "action-ready; live freshness check pending",
      evidenceToVerify: "Verify quote spine row, source links, costing evidence, and customer facts before any customer action.",
      freshnessWarning: "action-ready only after live freshness check; quote spine is draft evidence until approved.",
    }));

  const quoteReadyFromLeads = activeLeads
    .filter((lead) => lead.status !== "quoted" && quoteIntent(lead) && lead.productCategory && Number.isFinite(lead.estimatedValue))
    .sort(importanceSort())
    .slice(0, Math.max(0, limit - quoteReadyFromSpine.length))
    .map((lead) => ({
      leadProject: leadLabel(lead, options.ownerBrief),
      productArea: safeText(lead.productCategory, 40),
      factsComplete: missingFacts(lead).length ? `partial; missing ${missingFacts(lead).join(", ")}` : "lead basics present",
      costSourceFreshness: quoteSpineEmpty ? "quote-spine-empty; use lead/costing review only" : "not checked in this strip",
      quoteBasis: `lead status ${safeText(lead.status, 24)}; ${valueBand(lead.estimatedValue)}`,
      blockers: missingFacts(lead).join("; ") || "none obvious from lead row",
      draftPacketStatus: "available via --quote-packet; no write",
      owner: ownerLabel(lead.owner, options.ownerBrief),
      ...rowAccuracyFields(lead, quoteSpineEmpty),
    }));

  const waitingFollowUp = activeLeads
    .filter((lead) => lead.status === "quoted" || lead.status === "waiting_on_customer")
    .sort((a, b) => dueSort(a, b) || valueSort(a, b))
    .slice(0, limit)
    .map((lead) => ({
      leadProject: leadLabel(lead, options.ownerBrief),
      quoteProof: proof(lead),
      valueBand: valueBand(lead.estimatedValue),
      lastTouch: safeText(lead.lastInteractionAt || "unknown", 32),
      followUpDue: safeText(lead.nextFollowUpAt || "not set", 32),
      suggestedFollowUpAngle: actionLabel(lead.nextAction, options.ownerBrief, "Confirm whether the quote is still active and what is blocking the decision"),
      owner: ownerLabel(lead.owner, options.ownerBrief),
      ...rowAccuracyFields(lead, quoteSpineEmpty),
    }));

  const blockers = activeLeads
    .map((lead) => ({ lead, missing: missingFacts(lead) }))
    .filter((item) => item.missing.length && (quoteIntent(item.lead) || item.lead.productCategory || Number.isFinite(item.lead.estimatedValue)))
    .sort((a, b) => b.missing.length - a.missing.length || dueSort(a.lead, b.lead))
    .slice(0, limit)
    .map(({ lead, missing }) => ({
      leadProject: leadLabel(lead, options.ownerBrief),
      missingFacts: missing.join(", "),
      bestSourceToResolve: proof(lead),
      draftQuestion: draftMissingQuestion(missing),
      owner: ownerLabel(lead.owner, options.ownerBrief),
      due: safeText(lead.nextFollowUpAt || "not set", 32),
      ...rowAccuracyFields(lead, quoteSpineEmpty),
    }));

  const learning = buildLearningNotes({ activeLeads, closedLeads, counts, quoteSpineEmpty, excludedNoiseCount }).slice(0, limit);

  return {
    workQueue,
    hot,
    quotesReady: [...quoteReadyFromSpine, ...quoteReadyFromLeads].slice(0, limit),
    waitingFollowUp,
    blockers,
    learning,
    guardrails: [
      "READ-ONLY: Supabase access uses GET requests only; no Gmail, Xero, Shopify, Monday, Drive, or Supabase writes.",
      "Default output redacts lead/customer names, emails, phones, addresses, raw snippets, and long notes.",
      "Quote-prep packets are local drafts only; no Xero draft is created or sent.",
      "Supplier/admin/order-payment noise is excluded from Lead-to-Quote action sections; route those through the correct ops/payment/workshop loop instead.",
      quoteSpineEmpty ? "quote-spine-empty: quote tables have no rows, so lead-based sections remain the operating fallback." : "quote spine has rows; treat calculated quote readiness as draft evidence until approved.",
    ],
    quoteSpineEmpty,
  };
}

function draftMissingQuestion(missing) {
  const bits = [];
  if (missing.includes("product/category")) bits.push("the product type");
  if (missing.includes("value/budget signal")) bits.push("budget or target price range");
  if (missing.includes("follow-up date")) bits.push("timing for the next decision");
  if (!bits.length) bits.push("the missing quote detail");
  return `Ask for ${bits.join(", ")} before quote prep.`;
}

function buildLearningNotes({ activeLeads, closedLeads, counts, quoteSpineEmpty, excludedNoiseCount = 0 }) {
  const missingFollowUps = activeLeads.filter((lead) => !lead.nextFollowUpAt).length;
  const missingActions = activeLeads.filter((lead) => !lead.nextAction).length;
  const quotedWaiting = activeLeads.filter((lead) => lead.status === "quoted" || lead.status === "waiting_on_customer").length;
  const highValue = activeLeads.filter((lead) => (lead.estimatedValue || 0) >= 10000).length;
  const productCounts = new Map();
  for (const lead of activeLeads) {
    const key = lead.productCategory || "uncategorised";
    productCounts.set(key, (productCounts.get(key) || 0) + 1);
  }
  const topProduct = [...productCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return [
    {
      pattern: quoteSpineEmpty ? "quote-spine-empty" : "quote spine has draft evidence rows",
      evidenceCount: QUOTE_TABLES.reduce((sum, table) => sum + (counts[table]?.count || 0), 0),
      whatChangesNext: quoteSpineEmpty ? "Use lead rows for v0.1 today; do not imply quote calculations exist." : "Review quote rows before using them as quote authority.",
      actionBucket: "quote spine",
    },
    {
      pattern: "supplier/admin/order-payment rows excluded",
      evidenceCount: excludedNoiseCount,
      whatChangesNext: "Keep the Lead-to-Quote strip focused on customer quote work; handle excluded rows in the right ops loop.",
      actionBucket: "routing hygiene",
    },
    {
      pattern: "open leads missing follow-up dates",
      evidenceCount: missingFollowUps,
      whatChangesNext: "Surface these as blockers before they become memory-dependent.",
      actionBucket: "lead hygiene",
    },
    {
      pattern: "open leads missing next action",
      evidenceCount: missingActions,
      whatChangesNext: "Require one internal next action before quote/order progress is trusted.",
      actionBucket: "lead hygiene",
    },
    {
      pattern: "quoted or waiting-on-customer leads",
      evidenceCount: quotedWaiting,
      whatChangesNext: "Keep follow-up visible even when not overdue.",
      actionBucket: "follow-up",
    },
    {
      pattern: topProduct ? `largest visible product cluster: ${safeText(topProduct[0], 40)}` : "no active product cluster",
      evidenceCount: topProduct?.[1] || 0,
      whatChangesNext: "Use repeated categories to prioritise quote templates and content gaps.",
      actionBucket: "learning",
    },
    {
      pattern: "closed leads available for later outcome learning",
      evidenceCount: closedLeads.length,
      whatChangesNext: "Future write-approved loop needs structured win/loss reason capture.",
      actionBucket: "learning",
    },
    {
      pattern: "orders/financial mirror visible to read-only counts",
      evidenceCount: (counts.orders?.count || 0) + (counts.order_financial_documents?.count || 0),
      whatChangesNext: "Use order data only as read-only proof until quote-to-order learning links are approved.",
      actionBucket: "order bridge",
    },
  ];
}

function buildQuotePacket(lead, options, quoteSpineEmpty) {
  if (!lead) return null;
  const missing = missingFacts(lead);
  const enoughFields = Boolean(lead.productCategory && Number.isFinite(lead.estimatedValue));

  return {
    mode: "draft-only/read-only",
    lead: leadLabel(lead, options.ownerBrief),
    leadId: options.ownerBrief ? lead.id : stableId(lead.id),
    readiness: enoughFields && !missing.includes("next action") ? "prep-ready with human review" : "needs missing facts before quote prep",
    productSpecSummary: {
      productArea: safeText(lead.productCategory || "unknown", 60),
      valueBand: valueBand(lead.estimatedValue),
      status: safeText(lead.status, 32),
      priority: safeText(lead.priority, 32),
      owner: ownerLabel(lead.owner, options.ownerBrief),
    },
    knownFacts: [
      lead.productCategory ? `Product/category: ${safeText(lead.productCategory, 60)}` : null,
      Number.isFinite(lead.estimatedValue) ? `Estimated value band: ${valueBand(lead.estimatedValue)}` : null,
      lead.nextFollowUpAt ? `Follow-up due: ${safeText(lead.nextFollowUpAt, 32)}` : null,
      lead.source ? `Source: ${safeText(lead.source, 40)}` : null,
    ].filter(Boolean),
    missingFacts: missing,
    sourceProof: proof(lead),
    quotePrepChecklist: [
      "Confirm product dimensions, timber/finish/options, quantity, delivery/freight requirement, and timing.",
      "Check cost source freshness before price authority; block if supplier/current costing evidence is stale or missing.",
      "Use 50 percent gross margin logic, NZ GST 15 percent, and keep freight separate from product cost.",
      "Prepare Xero wording as a draft only; do not create, update, send, or approve a Xero record.",
    ],
    dryRunXeroPayloadShape: {
      mode: "dry_run_only",
      createOrSendXeroQuote: false,
      customer: options.ownerBrief ? safeText(lead.customerName, 48) : "[redacted]",
      lineItems: [],
      assumptions: quoteSpineEmpty ? ["quote-spine-empty; no quote scenario rows available"] : ["quote spine rows require human review before authority"],
    },
  };
}

function countsChanged(before, after) {
  const changes = [];
  for (const table of COUNT_TABLES) {
    const left = before?.[table]?.count;
    const right = after?.[table]?.count;
    if (left !== null && right !== null && left !== undefined && right !== undefined && left !== right) {
      changes.push({ table, before: left, after: right });
    }
  }
  return changes;
}

const FIELD_LABELS = {
  lead: "Lead",
  leadProject: "Lead",
  queueRule: "Rule",
  importance: "Why",
  whyNow: "Why",
  latestProof: "Proof",
  quoteProof: "Proof",
  freshnessStatus: "Accuracy",
  evidenceToVerify: "Verify",
  freshnessWarning: "Warning",
  missingFact: "Need",
  missingFacts: "Need",
  recommendedNextAction: "Next",
  suggestedFollowUpAngle: "Next",
  productArea: "Product",
  factsComplete: "Facts",
  costSourceFreshness: "Cost",
  quoteBasis: "Basis",
  blockers: "Blocks",
  draftPacketStatus: "Packet",
  valueBand: "Value",
  lastTouch: "Last",
  followUpDue: "Due",
  bestSourceToResolve: "Source",
  draftQuestion: "Ask",
  owner: "Owner",
  due: "Due",
  pattern: "Pattern",
  evidenceCount: "Count",
  whatChangesNext: "Meaning",
  actionBucket: "Bucket",
};

function compactFieldValue(value, headerName) {
  const maxByField = {
    latestProof: 90,
    quoteProof: 90,
    bestSourceToResolve: 90,
    recommendedNextAction: 110,
    suggestedFollowUpAngle: 110,
    whatChangesNext: 110,
    evidenceToVerify: 130,
    freshnessWarning: 120,
  };
  return safeText(value ?? "", maxByField[headerName] || 70).replace(/\|/g, "/");
}

function renderRows(headers, rows) {
  if (!rows.length) return "_No rows in this section._\n";
  const titleHeader = headers[0];
  return rows.map((row, index) => {
    const title = compactFieldValue(row[titleHeader], titleHeader) || "untitled";
    const lines = [`${index + 1}. **${title}**`];
    for (const header of headers.slice(1)) {
      const value = compactFieldValue(row[header], header);
      if (!value) continue;
      lines.push(`   - ${FIELD_LABELS[header] || header}: ${value}`);
    }
    return lines.join("\n");
  }).join("\n\n") + "\n";
}

function renderMarkdown(report) {
  const sections = report.sections;
  const lines = [
    `# Innate Lead-to-Quote control strip`,
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    `Output: ${report.ownerBrief ? "owner brief, names allowed" : "redacted default"}`,
    `Supabase source: ${report.source}`,
    "Format: mobile-friendly, no wide tables.",
    "",
    "## 1. Next lead to verify",
    "Work all active leads from most important down, one at a time; continue down the queue after each verified decision.",
    "",
    renderRows(["lead", "queueRule", "importance", "freshnessStatus", "evidenceToVerify", "recommendedNextAction", "valueBand", "due", "latestProof"], sections.workQueue),
    "## 2. Hot leads needing Guido today",
    renderRows(["lead", "whyNow", "freshnessStatus", "freshnessWarning", "missingFact", "recommendedNextAction", "owner", "due", "latestProof"], sections.hot),
    "## 3. Quotes ready to prepare",
    renderRows(["leadProject", "productArea", "freshnessStatus", "evidenceToVerify", "factsComplete", "costSourceFreshness", "quoteBasis", "blockers", "draftPacketStatus", "owner"], sections.quotesReady),
    "## 4. Quotes waiting for customer follow-up",
    renderRows(["leadProject", "freshnessStatus", "freshnessWarning", "valueBand", "lastTouch", "followUpDue", "suggestedFollowUpAngle", "owner", "quoteProof"], sections.waitingFollowUp),
    "## 5. Missing facts blocking quote/order progress",
    renderRows(["leadProject", "freshnessStatus", "freshnessWarning", "missingFacts", "draftQuestion", "owner", "due", "bestSourceToResolve"], sections.blockers),
    "## 6. Learning notes / patterns",
    renderRows(["pattern", "evidenceCount", "whatChangesNext", "actionBucket"], sections.learning),
  ];

  if (report.quotePacket) {
    lines.push("## Draft quote-prep packet", "");
    lines.push(`Lead: ${report.quotePacket.lead}`);
    lines.push(`Readiness: ${report.quotePacket.readiness}`);
    lines.push(`Source proof: ${compactFieldValue(report.quotePacket.sourceProof, "latestProof")}`);
    lines.push("");
    lines.push("Known facts:");
    for (const fact of report.quotePacket.knownFacts) lines.push(`- ${safeText(fact, 110)}`);
    lines.push("");
    lines.push("Missing facts:");
    for (const fact of report.quotePacket.missingFacts.length ? report.quotePacket.missingFacts : ["none obvious from lead row"]) lines.push(`- ${safeText(fact, 100)}`);
    lines.push("");
    lines.push("Quote-prep checklist:");
    for (const item of report.quotePacket.quotePrepChecklist) lines.push(`- ${safeText(item, 130)}`);
    lines.push("");
    lines.push("Dry-run Xero payload shape: local template only; createOrSendXeroQuote=false.");
    lines.push("");
  }

  lines.push("## Guardrail footer", "");
  for (const guardrail of sections.guardrails) lines.push(`- ${safeText(guardrail, 150)}`);
  if (report.noWriteProof) {
    lines.push(`- No-write count check: ${report.noWriteProof.status}${report.noWriteProof.changes.length ? ` (${report.noWriteProof.changes.length} changed)` : ""}.`);
  } else {
    lines.push("- No-write count check: not run; pass --verify-counts with Supabase env to verify before/after row counts.");
  }

  if (report.errors.length) {
    lines.push("", "## Read Limitations", "");
    for (const error of report.errors) lines.push(`- ${safeText(error, 180)}`);
  }

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  let data;
  let source;
  let beforeCounts = null;
  let afterCounts = null;
  const errors = [];

  if (options.fixture) {
    data = fixtureData();
    source = "fixture";
    beforeCounts = data.counts;
    afterCounts = data.counts;
  } else {
    const supabase = supabaseConfig();
    if (!supabase) {
      throw new Error("Supabase env not configured. Use --fixture for local static output, or set Supabase URL/key env.");
    }

    if (options.verifyCounts) beforeCounts = await readCounts(supabase);
    const [leads, quoteRequestsResult, counts] = await Promise.all([
      readLeads(supabase, options.limit),
      readQuoteRequests(supabase, options.limit),
      options.verifyCounts ? Promise.resolve(beforeCounts) : readCounts(supabase),
    ]);
    if (quoteRequestsResult.error) errors.push(quoteRequestsResult.error);
    let quotePacketLead = null;
    if (options.quotePacketLeadId) {
      quotePacketLead = leads.find((lead) => lead.id === options.quotePacketLeadId) || (await readOneLead(supabase, options.quotePacketLeadId));
      if (!quotePacketLead) errors.push(`No lead found for --quote-packet ${stableId(options.quotePacketLeadId)}`);
    }
    afterCounts = options.verifyCounts ? await readCounts(supabase) : null;
    data = { leads, quoteRequests: quoteRequestsResult.rows, counts, quotePacketLead };
    source = "supabase";
  }

  const sections = buildSections({ leads: data.leads, quoteRequests: data.quoteRequests, counts: data.counts, options });
  const packetLead = data.quotePacketLead || (options.quotePacketLeadId ? data.leads.find((lead) => lead.id === options.quotePacketLeadId) : null);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "read-only/dry-run",
    source,
    ownerBrief: options.ownerBrief,
    limit: options.limit,
    counts: data.counts,
    sections,
    quotePacket: packetLead ? buildQuotePacket(packetLead, options, sections.quoteSpineEmpty) : null,
    noWriteProof: beforeCounts && afterCounts ? {
      status: countsChanged(beforeCounts, afterCounts).length ? "changed-counts-detected" : "unchanged",
      changes: countsChanged(beforeCounts, afterCounts),
      tablesChecked: COUNT_TABLES,
    } : null,
    errors,
  };

  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderMarkdown(report));
  }
}

main().catch((err) => {
  console.error(`lead-to-quote-control-strip failed: ${redact(err instanceof Error ? err.message : String(err))}`);
  process.exit(1);
});
