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

  return {
    materials: materials.rows,
    products: products.rows,
    syncedAt,
    source: "supabase",
    errors: [materials.error, products.error].filter((error): error is string => Boolean(error)),
  };
}
