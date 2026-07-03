import {
  buildQuoteScenario,
  buildXeroDraftPayload,
  formatQuoteMarkdown,
  type QuotePriceSnapshot,
  type QuoteScenarioInput,
  type QuoteScenarioResult,
  type XeroDraftPayload,
} from "./engine.ts";

export type QuoteSupabaseStatus = {
  configured: boolean;
  writesEnabled: boolean;
  urlConfigured: boolean;
  keyConfigured: boolean;
  reason?: string;
};

export type QuotePersistResult =
  | { attempted: false; skippedReason: string }
  | {
      attempted: true;
      quoteRequestId: string | null;
      quoteScenarioId: string | null;
      costLineIds: string[];
      xeroDraftPayloadId: string | null;
      auditEventId: string | null;
    };

export type QuoteDraftOutput = {
  ok: true;
  mode: "draft_only";
  result: QuoteScenarioResult;
  markdown: string;
  xeroDraftPayload: XeroDraftPayload | null;
  supabase: QuoteSupabaseStatus & { persist?: QuotePersistResult };
};

type SupabaseConfig = { url: string; serviceKey: string };

type PersistOptions = {
  persist?: boolean;
  includeXero?: boolean;
  actor?: string;
  sourceChannel?: string;
};

type IdRow = { id?: string };

const PRICE_SOURCE_TYPES = new Set(["supplier_email", "supplier_pdf", "supplier_api", "calculator", "xero", "website", "manual", "other"]);

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function quoteWritesEnabled() {
  return process.env.QUOTE_SPINE_WRITES_ENABLED === "true";
}

export function getQuoteSupabaseStatus(): QuoteSupabaseStatus {
  const urlConfigured = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const keyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  const configured = Boolean(supabaseConfig());
  const writesEnabled = configured && quoteWritesEnabled();
  return {
    configured,
    writesEnabled,
    urlConfigured,
    keyConfigured,
    reason: configured ? (writesEnabled ? undefined : "QUOTE_SPINE_WRITES_ENABLED is not true, so draft persistence is disabled.") : "Supabase URL/service key is not configured.",
  };
}

function safeText(value: string | undefined | null, max = 4000): string | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function stableStatus(result: QuoteScenarioResult) {
  return result.readyToQuote ? "draft_ready_for_review" : "blocked";
}

function sourceType(value: string | undefined) {
  return value && PRICE_SOURCE_TYPES.has(value) ? value : "other";
}

function supplierTypeFor(snapshot: QuotePriceSnapshot) {
  const type = sourceType(snapshot.sourceType);
  const name = (snapshot.supplierName || "").toLowerCase();
  if (type === "calculator" || type === "website" || name.includes("website")) return "website";
  if (name.includes("freight") || name.includes("mainfreight")) return "freight";
  if (name.includes("precision") || name.includes("cnc") || name.includes("machining")) return "machining";
  if (name.includes("xero")) return "finance";
  if (name.includes("innate")) return "internal";
  if (name.includes("timber") || name.includes("westimber")) return "timber";
  return "other";
}

function slugFromName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "unknown-supplier";
}

async function supabaseRequest<T>(path: string, init: RequestInit): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured for the quote spine.");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase quote spine request failed: ${response.status} ${body.slice(0, 700)}`);
  }
  return (await response.json()) as T;
}

async function insertOne<T extends IdRow>(table: string, row: Record<string, unknown>): Promise<T> {
  const rows = await supabaseRequest<T[]>(table, { method: "POST", body: JSON.stringify(row) });
  return rows[0] || ({} as T);
}

async function upsertOne<T extends IdRow>(table: string, onConflict: string, row: Record<string, unknown>): Promise<T> {
  const rows = await supabaseRequest<T[]>(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return rows[0] || ({} as T);
}

async function upsertSupplierFor(snapshot: QuotePriceSnapshot): Promise<string | null> {
  if (!snapshot.supplierName) return null;
  const supplier = await upsertOne<IdRow>("quote_suppliers", "slug", {
    slug: slugFromName(snapshot.supplierName),
    name: snapshot.supplierName,
    supplier_type: supplierTypeFor(snapshot),
    notes: "Auto-created from quote price snapshot.",
    metadata: { source: "quote_spine_persist" },
  });
  return supplier.id || null;
}

async function upsertPriceSnapshot(snapshot: QuotePriceSnapshot): Promise<string | null> {
  const supplierId = await upsertSupplierFor(snapshot);
  const row = await upsertOne<IdRow>("quote_supplier_price_snapshots", "price_code", {
    supplier_id: supplierId,
    price_code: snapshot.priceCode,
    description: snapshot.description,
    unit: snapshot.unit || "each",
    unit_cost_ex_gst: snapshot.unitCostExGst,
    currency: "NZD",
    source_type: sourceType(snapshot.sourceType),
    source_label: snapshot.sourceLabel || "Unlabelled quote source",
    source_url: snapshot.sourceUrl || null,
    source_captured_at: snapshot.sourceCapturedAt || null,
    freshness_days: snapshot.freshnessDays || 30,
    confidence: snapshot.confidence || "unknown",
    status: snapshot.status || "active",
    evidence: {
      supplierName: snapshot.supplierName || null,
      sourceLabel: snapshot.sourceLabel || null,
      sourceUrl: snapshot.sourceUrl || null,
    },
  });
  return row.id || null;
}

export async function persistQuoteDraft(input: QuoteScenarioInput, result: QuoteScenarioResult, xeroDraftPayload: XeroDraftPayload | null, options: PersistOptions = {}): Promise<QuotePersistResult> {
  const status = getQuoteSupabaseStatus();
  if (!options.persist) return { attempted: false, skippedReason: "persist option was false" };
  if (!status.configured) return { attempted: false, skippedReason: status.reason || "Supabase is not configured" };
  if (!status.writesEnabled) return { attempted: false, skippedReason: status.reason || "quote writes disabled" };

  const request = await insertOne<IdRow>("quote_requests", {
    request_name: input.requestName,
    customer_name: safeText(input.customerName, 240),
    source_channel: options.sourceChannel || "hermes",
    product_area: input.productArea || "other",
    status: stableStatus(result),
    raw_request: safeText(input.customerSummary, 4000),
    captured_facts: {
      scenarioName: input.scenarioName || null,
      assumptions: input.assumptions || [],
      xero: input.xero || null,
    },
    owner: options.actor || "hermes_quote_worker",
    metadata: { quoteSpineVersion: "v1", dryRunOnly: true },
  });
  const quoteRequestId = request.id || null;

  const scenario = await insertOne<IdRow>("quote_scenarios", {
    quote_request_id: quoteRequestId,
    scenario_name: result.scenarioName,
    status: stableStatus(result),
    ready_to_quote: result.readyToQuote,
    target_gross_margin_percent: result.targetGrossMarginPercent,
    gst_rate: result.gstRate,
    subtotal_cost_ex_gst: result.subtotalCostExGst,
    sell_price_ex_gst: result.sellPriceExGst,
    sell_price_incl_gst: result.sellPriceInclGst,
    gross_profit_ex_gst: result.grossProfitExGst,
    gross_margin_percent: result.grossMarginPercent,
    payment_terms: result.paymentTerms,
    lead_time_terms: result.leadTimeTerms,
    customer_summary: result.customerSummary,
    assumptions: result.assumptions,
    warnings: result.warnings,
    blockers: result.blockers,
    calculated_at: new Date().toISOString(),
    metadata: { requestName: result.requestName, dryRunOnly: true },
  });
  const quoteScenarioId = scenario.id || null;

  const costLineIds: string[] = [];
  for (const [index, line] of result.costLines.entries()) {
    const inputLine = input.costLines[index];
    const priceSnapshotId = inputLine?.sourceSnapshot ? await upsertPriceSnapshot(inputLine.sourceSnapshot) : null;
    const costLine = await insertOne<IdRow>("quote_cost_lines", {
      quote_scenario_id: quoteScenarioId,
      supplier_price_snapshot_id: priceSnapshotId,
      label: line.label,
      line_type: line.lineType,
      quantity: line.quantity,
      unit: line.unit,
      unit_cost_ex_gst: line.unitCostExGst,
      line_cost_ex_gst: line.lineCostExGst,
      source_price_code: line.sourcePriceCode || null,
      source_label: line.sourceLabel || null,
      source_url: line.sourceUrl || null,
      freshness_status: line.freshnessStatus,
      account_code: line.accountCode,
      tax_type: line.taxType,
      notes: line.notes || null,
      sort_order: index + 1,
    });
    if (costLine.id) costLineIds.push(costLine.id);
    if (line.sourceLabel || line.sourceUrl || line.sourcePriceCode) {
      await insertOne("quote_source_links", {
        quote_request_id: quoteRequestId,
        quote_scenario_id: quoteScenarioId,
        quote_cost_line_id: costLine.id || null,
        supplier_price_snapshot_id: priceSnapshotId,
        source_type: "price_snapshot",
        label: line.sourceLabel || line.sourcePriceCode || line.label,
        url: line.sourceUrl || null,
        external_id: line.sourcePriceCode || null,
        metadata: { freshnessStatus: line.freshnessStatus, ageDays: line.ageDays ?? null },
      });
    }
  }

  const xeroDraft = xeroDraftPayload
    ? await insertOne<IdRow>("quote_xero_draft_payloads", {
        quote_scenario_id: quoteScenarioId,
        dry_run_only: true,
        status: "dry_run",
        xero_payload: xeroDraftPayload,
        validation: xeroDraftPayload.validation,
        created_by: options.actor || "hermes_quote_worker",
      })
    : null;

  const audit = await insertOne<IdRow>("quote_audit_events", {
    quote_request_id: quoteRequestId,
    quote_scenario_id: quoteScenarioId,
    actor: options.actor || "hermes_quote_worker",
    event_type: result.readyToQuote ? "draft_created" : "draft_blocked",
    event_summary: result.readyToQuote ? "Quote draft calculated for Guido review." : "Quote draft calculated but blocked before quoting.",
    payload: { blockers: result.blockers, warnings: result.warnings, dryRunOnly: true },
  });

  return {
    attempted: true,
    quoteRequestId,
    quoteScenarioId,
    costLineIds,
    xeroDraftPayloadId: xeroDraft?.id || null,
    auditEventId: audit.id || null,
  };
}

export async function createQuoteDraft(input: QuoteScenarioInput, options: PersistOptions = {}): Promise<QuoteDraftOutput> {
  const result = buildQuoteScenario(input);
  const includeXero = options.includeXero ?? true;
  const xeroDraftPayload = includeXero ? buildXeroDraftPayload(input, result) : null;
  const persist = await persistQuoteDraft(input, result, xeroDraftPayload, options);
  return {
    ok: true,
    mode: "draft_only",
    result,
    markdown: formatQuoteMarkdown(result),
    xeroDraftPayload,
    supabase: { ...getQuoteSupabaseStatus(), persist },
  };
}
