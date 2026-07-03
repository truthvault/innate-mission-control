import { createHash } from "node:crypto";

export type FreightQuoteLogStatus =
  | "estimated"
  | "dry_run"
  | "mainfreight_rate_failed"
  | "mainfreight_not_configured"
  | "bad_request";

export type FreightQuoteLogEvent = {
  timestamp?: string;
  status?: FreightQuoteLogStatus | string;
  productHandle?: string;
  tableLengthMm?: number;
  tableWidthMm?: number;
  benchCount?: number;
  baseFamily?: string;
  destination?: {
    suburb?: string;
    city?: string;
    postCode?: string;
    countryCode?: string;
    formattedAddress?: string;
  };
  addressEntered?: string;
  source?: string;
  pageUrl?: string;
  variantId?: string;
  variantTitle?: string;
  userAgent?: string;
  referer?: string;
  clientIp?: string;
  internalTestMarker?: string;
  result?: Record<string, unknown>;
};

export type FreightQuoteRow = {
  id: string;
  timestamp: string;
  status: string;
  productHandle: string;
  variantTitle: string;
  variantId: string;
  tableLengthMm?: number;
  tableWidthMm?: number;
  benchCount?: number;
  addressEntered: string;
  suburb: string;
  city: string;
  postCode: string;
  estimateInclGst?: number;
  rawMainfreightInclGst?: number;
  manualCheckOffered: boolean;
  packageItems?: number;
  totalCubicMetres?: number;
  totalWeightKg?: number;
  source: string;
  pageUrl: string;
  referer: string;
  userAgent: string;
  packageSummary: string;
  isInternalTest?: boolean;
  internalTestReasons?: string[];
  clientIpHash?: string;
};

const DEFAULT_LOG_TIMEOUT_MS = 1500;

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function freightQuoteLoggingEnabled() {
  return process.env.FREIGHT_QUOTE_LOGGING_ENABLED === "true";
}

function quoteLogTimeoutMs() {
  const value = Number(process.env.FREIGHT_QUOTE_LOG_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5000) : DEFAULT_LOG_TIMEOUT_MS;
}

async function fetchQuoteLog(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), quoteLogTimeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function getFreightQuoteLogStatus() {
  return {
    loggingEnabled: freightQuoteLoggingEnabled(),
    supabaseConfigured: Boolean(supabaseConfig()),
  };
}

function truncate(value: unknown, max = 8000): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function normaliseIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

function hashClientIp(value: string | undefined): string | undefined {
  const ip = normaliseIp(value);
  const salt = process.env.FREIGHT_IP_HASH_SALT;
  if (!ip || !salt) return undefined;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function configuredInternalIpHashes(): Set<string> {
  return new Set(
    (process.env.FREIGHT_INTERNAL_IP_HASHES || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function internalTestReasons(event: FreightQuoteLogEvent, clientIpHash: string | undefined): string[] {
  const reasons: string[] = [];
  const source = (event.source || "").toLowerCase();
  const marker = (event.internalTestMarker || "").toLowerCase();
  const pageUrl = (event.pageUrl || "").toLowerCase();
  const status = (event.status || "").toLowerCase();

  if (clientIpHash && configuredInternalIpHashes().has(clientIpHash)) reasons.push("internal_ip_hash");
  if (marker && marker === process.env.FREIGHT_INTERNAL_TEST_TOKEN?.toLowerCase()) reasons.push("internal_test_token");
  if (/internal|test|debug|preview/.test(source)) reasons.push("source_marker");
  if (/freighttest=|internaltest=|testfreight=/.test(pageUrl)) reasons.push("url_test_marker");
  if (/[?&](tracking_test|cache_check|calc-update-check|shape-ref-check|freight-tracking-check|freight-tracking-visual|freight-live-inspect)=/.test(pageUrl)) reasons.push("url_test_marker");
  if (/[?&](__ab|_fd|_sc)=/.test(pageUrl)) reasons.push("cache_bust_marker");
  if (status === "dry_run") reasons.push("dry_run");

  return Array.from(new Set(reasons));
}

function packageSummaryFromResult(result: Record<string, unknown> | undefined): string | undefined {
  const lines = Array.isArray(result?.packageLines) ? result.packageLines : [];
  if (!lines.length) return undefined;
  return lines
    .map((line) => {
      if (!line || typeof line !== "object") return "";
      const item = line as Record<string, unknown>;
      const code = truncate(item.code, 30) || "PKG";
      const qty = numberOrUndefined(item.quantity) || 1;
      const cube = numberOrUndefined(item.cubicMetres);
      const kg = numberOrUndefined(item.weightKg);
      return `${qty} × ${code}${cube !== undefined ? ` (${cube}m³` : ""}${kg !== undefined ? `, ${kg}kg` : ""}${cube !== undefined ? ")" : ""}`;
    })
    .filter(Boolean)
    .join("; ");
}

function productArea(event: FreightQuoteLogEvent): string {
  const handle = (event.productHandle || "").toLowerCase();
  const page = (event.pageUrl || event.referer || "").toLowerCase();
  const source = (event.source || "").toLowerCase();
  if (/bench|benchtop|panel/.test(handle) || /bench|benchtop|panel/.test(page) || /bench|benchtop|panel/.test(source)) return "benchtop";
  if (/dining|table|crossroads|asterix|homestead|oval/.test(handle) || /dining/.test(source)) return "dining";
  if (/outdoor|alfresco/.test(handle) || /outdoor|alfresco/.test(page)) return "outdoor";
  return "unknown";
}

function jsonOrNull(value: unknown): unknown | null {
  return value === undefined ? null : value;
}

function supabaseRow(event: FreightQuoteLogEvent) {
  const result = event.result || {};
  const totals = result.totals && typeof result.totals === "object" ? (result.totals as Record<string, unknown>) : {};
  const destination = event.destination || {};
  const clientIpHash = hashClientIp(event.clientIp);
  const reasons = internalTestReasons(event, clientIpHash);
  const addressEntered = event.addressEntered || destination.formattedAddress || [destination.suburb, destination.city, destination.postCode].filter(Boolean).join(", ");

  return {
    created_at: event.timestamp || new Date().toISOString(),
    status: event.status || null,
    product_area: productArea(event),
    configurator_type: result.configuratorType || null,
    product_handle: event.productHandle || null,
    variant_title: event.variantTitle || null,
    variant_id: event.variantId || null,
    table_length_mm: numberOrUndefined(event.tableLengthMm) ?? null,
    table_width_mm: numberOrUndefined(event.tableWidthMm) ?? null,
    bench_count: numberOrUndefined(event.benchCount) ?? null,
    base_family: event.baseFamily || null,
    address_entered: addressEntered || null,
    suburb: destination.suburb || null,
    city: destination.city || null,
    postcode: destination.postCode || null,
    country_code: destination.countryCode || "NZ",
    client_ip_hash: clientIpHash || null,
    is_internal_test: reasons.length > 0,
    internal_test_reasons: reasons,
    source: event.source || null,
    page_url: event.pageUrl || null,
    referer: event.referer || null,
    user_agent: event.userAgent || null,
    estimate_incl_gst: numberOrUndefined(result.estimateInclGst) ?? null,
    raw_mainfreight_incl_gst: numberOrUndefined(result.rawMainfreightInclGst) ?? null,
    raw_mainfreight_ex_gst: numberOrUndefined(result.rawMainfreightExGst) ?? null,
    manual_check_offered: booleanOrFalse(result.manualCheckOffered),
    package_items: numberOrUndefined(totals.items) ?? null,
    total_cubic_metres: numberOrUndefined(totals.cubicMetres) ?? null,
    total_weight_kg: numberOrUndefined(totals.weightKg) ?? null,
    package_summary: packageSummaryFromResult(result) || null,
    package_lines: Array.isArray(result.packageLines) ? result.packageLines : null,
    selected_options_json: jsonOrNull(result.selectedOptions),
    destination_json: destination,
    result_json: result,
    raw_carrier_quote_json: jsonOrNull(result.rawCarrierQuote),
    source_system: "mission_control",
  };
}

function eventId(event: FreightQuoteLogEvent, timestamp: string) {
  const pieces = [
    timestamp,
    event.productHandle || "product",
    event.variantId || event.variantTitle || "variant",
    event.destination?.suburb || event.addressEntered || "destination",
  ];
  const safe = pieces.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return safe.slice(0, 180);
}

function compactFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}

export async function writeQuoteEvent(event: FreightQuoteLogEvent) {
  if (!freightQuoteLoggingEnabled()) {
    return { ok: false, skipped: true, reason: "freight_quote_logging_disabled" };
  }

  const stampedEvent = { timestamp: new Date().toISOString(), ...event };
  const supabase = supabaseConfig();
  if (!supabase) {
    console.warn("[freight] quote-event logging skipped: missing Supabase config");
    return { ok: false, skipped: true, reason: "missing_quote_log_config" };
  }

  try {
    const response = await fetchQuoteLog(`${supabase.url}/rest/v1/freight_quote_events`, {
      method: "POST",
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(supabaseRow(stampedEvent)),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[freight] quote-event Supabase write failed: HTTP ${response.status} ${text.slice(0, 500)}`);
      return { ok: false, status: response.status, store: "supabase" };
    }

    const body = (await response.json()) as Array<{ id?: string }>;
    return { ok: true, id: body[0]?.id, store: "supabase" };
  } catch (err) {
    console.warn("[freight] quote-event Supabase write failed", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err), store: "supabase" };
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function rowFromSupabase(record: Record<string, unknown>): FreightQuoteRow {
  return {
    id: asString(record.id),
    timestamp: asString(record.created_at),
    status: asString(record.status),
    productHandle: asString(record.product_handle),
    variantTitle: asString(record.variant_title),
    variantId: asString(record.variant_id),
    tableLengthMm: asNumber(record.table_length_mm),
    tableWidthMm: asNumber(record.table_width_mm),
    benchCount: asNumber(record.bench_count),
    addressEntered: asString(record.address_entered),
    suburb: asString(record.suburb),
    city: asString(record.city),
    postCode: asString(record.postcode),
    estimateInclGst: asNumber(record.estimate_incl_gst),
    rawMainfreightInclGst: asNumber(record.raw_mainfreight_incl_gst),
    manualCheckOffered: asBool(record.manual_check_offered),
    packageItems: asNumber(record.package_items),
    totalCubicMetres: asNumber(record.total_cubic_metres),
    totalWeightKg: asNumber(record.total_weight_kg),
    source: asString(record.source),
    pageUrl: asString(record.page_url),
    referer: asString(record.referer),
    userAgent: asString(record.user_agent),
    packageSummary: asString(record.package_summary),
    isInternalTest: asBool(record.is_internal_test),
    internalTestReasons: Array.isArray(record.internal_test_reasons) ? record.internal_test_reasons.map(String) : [],
    clientIpHash: asString(record.client_ip_hash),
  };
}

export async function listQuoteEvents(
  limit = 50,
  options: { includeInternal?: boolean; productArea?: string } = {},
): Promise<{ rows: FreightQuoteRow[]; error?: string }> {
  const supabase = supabaseConfig();
  if (!supabase) return { rows: [], error: "Missing Supabase quote log config" };

  const params = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 100))),
  });
  if (!options.includeInternal) params.set("is_internal_test", "eq.false");
  if (options.productArea) params.set("product_area", `eq.${options.productArea}`);

  try {
    const response = await fetch(`${supabase.url}/rest/v1/freight_quote_events?${params}`, {
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      return { rows: [], error: `Supabase read failed: HTTP ${response.status} ${text.slice(0, 300)}` };
    }
    const body = (await response.json()) as Record<string, unknown>[];
    return { rows: body.map(rowFromSupabase) };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}
