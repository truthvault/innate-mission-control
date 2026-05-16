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
};

const AIRTABLE_API_URL = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "apphs7DnsHiLGdNbc";
const DEFAULT_TABLE_ID = "tbl1OixNuxTBFWMsd";

function airtableConfig() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID;
  const tableId = process.env.AIRTABLE_FREIGHT_QUOTES_TABLE_ID || DEFAULT_TABLE_ID;
  if (!apiKey || !baseId || !tableId) return null;
  return { apiKey, baseId, tableId };
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

function airtableFields(event: FreightQuoteLogEvent) {
  const timestamp = event.timestamp || new Date().toISOString();
  const result = event.result || {};
  const totals = result.totals && typeof result.totals === "object" ? (result.totals as Record<string, unknown>) : {};
  const destination = event.destination || {};
  const addressEntered = event.addressEntered || destination.formattedAddress || [destination.suburb, destination.city, destination.postCode].filter(Boolean).join(", ");

  return {
    "Event ID": eventId(event, timestamp),
    Timestamp: timestamp,
    Status: truncate(event.status, 80),
    "Product Handle": truncate(event.productHandle, 255),
    "Variant Title": truncate(event.variantTitle, 255),
    "Variant ID": truncate(event.variantId, 80),
    "Table Length mm": numberOrUndefined(event.tableLengthMm),
    "Table Width mm": numberOrUndefined(event.tableWidthMm),
    "Bench Count": numberOrUndefined(event.benchCount),
    "Address Entered": truncate(addressEntered, 2000),
    Suburb: truncate(destination.suburb, 255),
    City: truncate(destination.city, 255),
    Postcode: truncate(destination.postCode, 40),
    "Estimate Incl GST": numberOrUndefined(result.estimateInclGst),
    "Raw Mainfreight Incl GST": numberOrUndefined(result.rawMainfreightInclGst),
    "Manual Check Offered": booleanOrFalse(result.manualCheckOffered),
    "Package Items": numberOrUndefined(totals.items),
    "Total Cubic Metres": numberOrUndefined(totals.cubicMetres),
    "Total Weight kg": numberOrUndefined(totals.weightKg),
    Source: truncate(event.source, 255),
    "Page URL": truncate(event.pageUrl, 2000),
    Referer: truncate(event.referer, 2000),
    "User Agent": truncate(event.userAgent, 2000),
    "Package Summary": truncate(packageSummaryFromResult(result), 2000),
    "Result JSON": truncate(JSON.stringify(result), 8000),
  };
}

function compactFields(fields: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}

export async function writeQuoteEvent(event: FreightQuoteLogEvent) {
  const config = airtableConfig();
  if (!config) {
    console.warn("[freight] quote-event Airtable logging skipped: missing config");
    return { ok: false, skipped: true, reason: "missing_airtable_config" };
  }

  try {
    const response = await fetch(`${AIRTABLE_API_URL}/${config.baseId}/${config.tableId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: compactFields(airtableFields({ timestamp: new Date().toISOString(), ...event })) }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[freight] quote-event Airtable write failed: HTTP ${response.status} ${text.slice(0, 500)}`);
      return { ok: false, status: response.status };
    }

    const body = (await response.json()) as { id?: string };
    return { ok: true, id: body.id };
  } catch (err) {
    console.warn("[freight] quote-event Airtable write failed", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
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

function rowFromRecord(record: { id: string; fields?: Record<string, unknown> }): FreightQuoteRow {
  const f = record.fields || {};
  return {
    id: record.id,
    timestamp: asString(f.Timestamp),
    status: asString(f.Status),
    productHandle: asString(f["Product Handle"]),
    variantTitle: asString(f["Variant Title"]),
    variantId: asString(f["Variant ID"]),
    tableLengthMm: asNumber(f["Table Length mm"]),
    tableWidthMm: asNumber(f["Table Width mm"]),
    benchCount: asNumber(f["Bench Count"]),
    addressEntered: asString(f["Address Entered"]),
    suburb: asString(f.Suburb),
    city: asString(f.City),
    postCode: asString(f.Postcode),
    estimateInclGst: asNumber(f["Estimate Incl GST"]),
    rawMainfreightInclGst: asNumber(f["Raw Mainfreight Incl GST"]),
    manualCheckOffered: asBool(f["Manual Check Offered"]),
    packageItems: asNumber(f["Package Items"]),
    totalCubicMetres: asNumber(f["Total Cubic Metres"]),
    totalWeightKg: asNumber(f["Total Weight kg"]),
    source: asString(f.Source),
    pageUrl: asString(f["Page URL"]),
    referer: asString(f.Referer),
    userAgent: asString(f["User Agent"]),
    packageSummary: asString(f["Package Summary"]),
  };
}

export async function listQuoteEvents(limit = 50): Promise<{ rows: FreightQuoteRow[]; error?: string }> {
  const config = airtableConfig();
  if (!config) return { rows: [], error: "Missing Airtable quote log config" };

  const params = new URLSearchParams({
    maxRecords: String(Math.max(1, Math.min(limit, 100))),
    pageSize: String(Math.max(1, Math.min(limit, 100))),
    "sort[0][field]": "Timestamp",
    "sort[0][direction]": "desc",
  });

  try {
    const response = await fetch(`${AIRTABLE_API_URL}/${config.baseId}/${config.tableId}?${params}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      return { rows: [], error: `Airtable read failed: HTTP ${response.status} ${text.slice(0, 300)}` };
    }

    const body = (await response.json()) as { records?: Array<{ id: string; fields?: Record<string, unknown> }> };
    return { rows: (body.records || []).map(rowFromRecord) };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}
