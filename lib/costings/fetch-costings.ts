export type CostingSourceType = "xero_bill" | "xero_invoice" | "drive_sheet" | "supplier_pdf" | "gmail" | "manual_note" | "calculator" | "supabase" | "other";
export type CostingConfidence = "high" | "medium" | "low" | "unknown";
export type CostingPriceStatus = "fresh" | "stale" | "needs_review" | "conflict" | "missing_source";

export type CostingMaterialRow = {
  id: string;
  name: string;
  internalCode: string | null;
  supplierCode: string | null;
  category: string | null;
  supplierName: string | null;
  unit: string | null;
  currentApprovedUnitCostExGst: number | null;
  currentApprovedAt: string | null;
  latestObservedUnitCostExGst: number | null;
  priceStatus: CostingPriceStatus;
  latestXeroBillNumber: string | null;
  latestXeroBillDate: string | null;
  latestXeroLineDescription: string | null;
  averageInboundFreightExGst: number | null;
  averageInboundFreightSampleCount: number | null;
  latestInboundFreightExGst: number | null;
  customerDeliveryChargeExGst: number | null;
  sourceType: CostingSourceType | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  lastCheckedAt: string | null;
  confidence: CostingConfidence;
  notes: string | null;
  blocker: string | null;
};

export type ProductCostingSheetRow = {
  id: string;
  productName: string;
  productCode: string | null;
  productFamily: string | null;
  defaultVariant: string | null;
  status: string;
  sourceType: CostingSourceType | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  lastImportedAt: string | null;
  staleSourceLineCount: number | null;
  totalMaterialsExGst: number | null;
  totalLabourHours: number | null;
  totalLabourCostExGst: number | null;
  otherCostsExGst: number | null;
  totalCostExGst: number | null;
  sellPriceExGst: number | null;
  sellPriceInclGst: number | null;
  grossProfitExGst: number | null;
  grossMarginPercent: number | null;
  markupPercent: number | null;
  readyToQuoteStatus: string;
  notes: string | null;
  blocker: string | null;
  lines: ProductCostingLineRow[];
};

export type ProductCostingLineRow = {
  id: string;
  productSheetId: string;
  versionId: string;
  lineType: string;
  lineLabel: string;
  quantity: number | null;
  unit: string | null;
  unitCostExGst: number | null;
  totalCostExGst: number | null;
  sourceLineReference: string | null;
  freshnessStatus: CostingPriceStatus;
  confidence: CostingConfidence;
  notes: string | null;
  blocker: string | null;
};

export type CostingsResult = {
  materials: CostingMaterialRow[];
  products: ProductCostingSheetRow[];
  syncedAt: string;
  source: "supabase" | "none";
  errors: string[];
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function materialRow(record: Record<string, unknown>): CostingMaterialRow {
  return {
    id: asString(record.id) || asString(record.material_id) || asString(record.name) || "unknown",
    name: asString(record.name) || "Unnamed material or service",
    internalCode: asString(record.internal_code),
    supplierCode: asString(record.supplier_code),
    category: asString(record.category),
    supplierName: asString(record.supplier_name),
    unit: asString(record.unit),
    currentApprovedUnitCostExGst: asNumber(record.current_approved_unit_cost_ex_gst),
    currentApprovedAt: asString(record.current_approved_at),
    latestObservedUnitCostExGst: asNumber(record.latest_observed_unit_cost_ex_gst),
    priceStatus: (asString(record.price_status) as CostingPriceStatus | null) || "missing_source",
    latestXeroBillNumber: asString(record.latest_xero_bill_number),
    latestXeroBillDate: asString(record.latest_xero_bill_date),
    latestXeroLineDescription: asString(record.latest_xero_line_description),
    averageInboundFreightExGst: asNumber(record.average_inbound_freight_ex_gst),
    averageInboundFreightSampleCount: asNumber(record.average_inbound_freight_sample_count),
    latestInboundFreightExGst: asNumber(record.latest_inbound_freight_ex_gst),
    customerDeliveryChargeExGst: asNumber(record.customer_delivery_charge_ex_gst),
    sourceType: asString(record.source_type) as CostingSourceType | null,
    sourceLabel: asString(record.source_label),
    sourceUrl: asString(record.source_url),
    lastCheckedAt: asString(record.last_checked_at),
    confidence: (asString(record.confidence) as CostingConfidence | null) || "unknown",
    notes: asString(record.notes),
    blocker: asString(record.blocker),
  };
}

function productRow(record: Record<string, unknown>): ProductCostingSheetRow {
  return {
    id: asString(record.id) || asString(record.product_name) || "unknown",
    productName: asString(record.product_name) || "Unnamed product costing sheet",
    productCode: asString(record.product_code),
    productFamily: asString(record.product_family),
    defaultVariant: asString(record.default_variant),
    status: asString(record.status) || "needs_review",
    sourceType: asString(record.source_type) as CostingSourceType | null,
    sourceLabel: asString(record.source_label),
    sourceUrl: asString(record.source_url),
    lastImportedAt: asString(record.last_imported_at),
    staleSourceLineCount: asNumber(record.stale_source_line_count),
    totalMaterialsExGst: asNumber(record.total_materials_ex_gst),
    totalLabourHours: asNumber(record.total_labour_hours),
    totalLabourCostExGst: asNumber(record.total_labour_cost_ex_gst),
    otherCostsExGst: asNumber(record.other_costs_ex_gst),
    totalCostExGst: asNumber(record.total_cost_ex_gst),
    sellPriceExGst: asNumber(record.sell_price_ex_gst),
    sellPriceInclGst: asNumber(record.sell_price_incl_gst),
    grossProfitExGst: asNumber(record.gross_profit_ex_gst),
    grossMarginPercent: asNumber(record.gross_margin_percent),
    markupPercent: asNumber(record.markup_percent),
    readyToQuoteStatus: asString(record.ready_to_quote_status) || "blocked",
    notes: asString(record.notes),
    blocker: asString(record.blocker),
    lines: [],
  };
}

type ProductCostingVersionRecord = {
  id: string;
  sheetId: string;
};

function productVersionRow(record: Record<string, unknown>): ProductCostingVersionRecord | null {
  const id = asString(record.id);
  const sheetId = asString(record.sheet_id);
  if (!id || !sheetId) return null;
  return { id, sheetId };
}

function productLineRow(versionToSheet: Map<string, string>) {
  return (record: Record<string, unknown>): ProductCostingLineRow => {
    const versionId = asString(record.version_id) || "unknown";
    return {
      id: asString(record.id) || `${versionId}-${asString(record.line_label) || "line"}`,
      productSheetId: versionToSheet.get(versionId) || "unknown",
      versionId,
      lineType: asString(record.line_type) || "other",
      lineLabel: asString(record.line_label) || "Unnamed costing line",
      quantity: asNumber(record.quantity),
      unit: asString(record.unit),
      unitCostExGst: asNumber(record.unit_cost_ex_gst),
      totalCostExGst: asNumber(record.total_cost_ex_gst),
      sourceLineReference: asString(record.source_line_reference),
      freshnessStatus: (asString(record.freshness_status) as CostingPriceStatus | null) || "missing_source",
      confidence: (asString(record.confidence) as CostingConfidence | null) || "unknown",
      notes: asString(record.notes),
      blocker: asString(record.blocker),
    };
  };
}

async function readTable<T>(supabase: { url: string; serviceKey: string }, path: string, mapper: (row: Record<string, unknown>) => T): Promise<{ rows: T[]; error?: string }> {
  try {
    const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text();
      return { rows: [], error: `Supabase read failed for ${path.split("?")[0]}: HTTP ${response.status} ${text.slice(0, 220)}` };
    }
    const body = (await response.json()) as Record<string, unknown>[];
    return { rows: body.map(mapper) };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

async function readProductLinesForLatestVersions(
  supabase: { url: string; serviceKey: string },
  products: ProductCostingSheetRow[]
): Promise<{ linesByProductId: Map<string, ProductCostingLineRow[]>; error?: string }> {
  const ids = products.map((product) => product.id).filter((id) => id !== "unknown");
  const linesByProductId = new Map<string, ProductCostingLineRow[]>();
  if (ids.length === 0) return { linesByProductId };

  const versions = await readTable(
    supabase,
    `product_costing_versions?select=id,sheet_id&sheet_id=in.(${ids.join(",")})&order=imported_at.desc&limit=500`,
    productVersionRow
  );
  if (versions.error) return { linesByProductId, error: versions.error };

  const latestBySheet = new Map<string, ProductCostingVersionRecord>();
  for (const version of versions.rows) {
    if (!version) continue;
    if (!latestBySheet.has(version.sheetId)) latestBySheet.set(version.sheetId, version);
  }
  const versionToSheet = new Map<string, string>();
  for (const version of latestBySheet.values()) versionToSheet.set(version.id, version.sheetId);
  const versionIds = Array.from(versionToSheet.keys());
  if (versionIds.length === 0) return { linesByProductId };

  const lines = await readTable(
    supabase,
    `product_costing_lines?select=id,version_id,line_type,line_label,quantity,unit,unit_cost_ex_gst,total_cost_ex_gst,source_line_reference,freshness_status,confidence,notes,blocker&version_id=in.(${versionIds.join(",")})&order=line_type.asc&order=line_label.asc&limit=1000`,
    productLineRow(versionToSheet)
  );
  if (lines.error) return { linesByProductId, error: lines.error };

  for (const line of lines.rows) {
    const current = linesByProductId.get(line.productSheetId) || [];
    current.push(line);
    linesByProductId.set(line.productSheetId, current);
  }
  return { linesByProductId };
}

export async function listCostings(): Promise<CostingsResult> {
  const syncedAt = new Date().toISOString();
  const supabase = supabaseConfig();
  if (!supabase) {
    return { materials: [], products: [], syncedAt, source: "none", errors: ["Supabase env is not configured for Costings reads."] };
  }

  const [materials, products] = await Promise.all([
    readTable(
      supabase,
      "costing_material_summary?select=*&order=name.asc&limit=500",
      materialRow
    ),
    readTable(
      supabase,
      "product_costing_sheet_summary?select=*&order=product_name.asc&limit=250",
      productRow
    ),
  ]);
  const productLines: { linesByProductId: Map<string, ProductCostingLineRow[]>; error?: string } = products.rows.length
    ? await readProductLinesForLatestVersions(supabase, products.rows)
    : { linesByProductId: new Map<string, ProductCostingLineRow[]>() };
  const productsWithLines = products.rows.map((product) => ({
    ...product,
    lines: productLines.linesByProductId.get(product.id) || [],
  }));

  return {
    materials: materials.rows,
    products: productsWithLines,
    syncedAt,
    source: "supabase",
    errors: [materials.error, products.error, productLines.error].filter((error): error is string => Boolean(error)),
  };
}
