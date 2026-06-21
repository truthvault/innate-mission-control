export type CostingSourceType = "xero_bill" | "xero_invoice" | "drive_sheet" | "supplier_pdf" | "gmail" | "manual_note" | "calculator" | "supabase" | "other";
export type CostingConfidence = "high" | "medium" | "low" | "unknown";
export type CostingPriceStatus = "fresh" | "stale" | "needs_review" | "conflict" | "missing_source";

export type CostingMaterialRow = {
  id: string;
  name: string;
  supplierId: string | null;
  latestObservationId: string | null;
  currentPriceId: string | null;
  sourceLinkId: string | null;
  internalCode: string | null;
  supplierCode: string | null;
  category: string | null;
  supplierName: string | null;
  supplierType: string | null;
  supplierXeroContactId: string | null;
  supplierWebsiteUrl: string | null;
  supplierNotes: string | null;
  unit: string | null;
  isActive: boolean;
  currentApprovedUnitCostExGst: number | null;
  currentApprovedAt: string | null;
  currentApprovedBy: string | null;
  currentApprovalNote: string | null;
  currentPriceStatus: string | null;
  latestObservedUnitCostExGst: number | null;
  latestObservedAt: string | null;
  latestObservedQuantity: number | null;
  latestObservedLineCostExGst: number | null;
  latestObservedGstAmount: number | null;
  latestObservedCurrency: string | null;
  latestObservedSupplierItemLabel: string | null;
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
  sourceExternalId: string | null;
  sourceCapturedBy: string | null;
  sourceCapturedAt: string | null;
  lastCheckedAt: string | null;
  confidence: CostingConfidence;
  notes: string | null;
  materialNotes: string | null;
  blocker: string | null;
};

export type ProductCostingSheetRow = {
  id: string;
  latestVersionId: string | null;
  sourceLinkId: string | null;
  productName: string;
  productCode: string | null;
  productFamily: string | null;
  defaultVariant: string | null;
  status: string;
  sourceType: CostingSourceType | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  sourceExternalId: string | null;
  sourceCapturedBy: string | null;
  sourceCapturedAt: string | null;
  versionLabel: string | null;
  lastImportedAt: string | null;
  importedBy: string | null;
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
  approvalStatus: string | null;
  notes: string | null;
  sheetNotes: string | null;
  blocker: string | null;
  lines: ProductCostingLineRow[];
};

export type ProductCostingLineRow = {
  id: string;
  productSheetId: string;
  versionId: string;
  materialId: string | null;
  sourceObservationId: string | null;
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function materialRow(record: Record<string, unknown>): CostingMaterialRow {
  return {
    id: asString(record.id) || asString(record.material_id) || asString(record.name) || "unknown",
    name: asString(record.name) || "Unnamed material or service",
    supplierId: asString(record.supplier_id),
    latestObservationId: asString(record.latest_observation_id),
    currentPriceId: asString(record.current_price_id),
    sourceLinkId: asString(record.source_link_id),
    internalCode: asString(record.internal_code),
    supplierCode: asString(record.supplier_code),
    category: asString(record.category),
    supplierName: asString(record.supplier_name),
    supplierType: asString(record.supplier_type),
    supplierXeroContactId: asString(record.supplier_xero_contact_id),
    supplierWebsiteUrl: asString(record.supplier_website_url),
    supplierNotes: asString(record.supplier_notes),
    unit: asString(record.unit),
    isActive: asBoolean(record.is_active) ?? true,
    currentApprovedUnitCostExGst: asNumber(record.current_approved_unit_cost_ex_gst),
    currentApprovedAt: asString(record.current_approved_at),
    currentApprovedBy: asString(record.current_approved_by),
    currentApprovalNote: asString(record.current_approval_note),
    currentPriceStatus: asString(record.current_price_status),
    latestObservedUnitCostExGst: asNumber(record.latest_observed_unit_cost_ex_gst),
    latestObservedAt: asString(record.latest_observed_at) || asString(record.last_checked_at),
    latestObservedQuantity: asNumber(record.latest_observed_quantity),
    latestObservedLineCostExGst: asNumber(record.latest_observed_line_cost_ex_gst),
    latestObservedGstAmount: asNumber(record.latest_observed_gst_amount),
    latestObservedCurrency: asString(record.latest_observed_currency),
    latestObservedSupplierItemLabel: asString(record.latest_observed_supplier_item_label),
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
    sourceExternalId: asString(record.source_external_id),
    sourceCapturedBy: asString(record.source_captured_by),
    sourceCapturedAt: asString(record.source_captured_at),
    lastCheckedAt: asString(record.last_checked_at),
    confidence: (asString(record.confidence) as CostingConfidence | null) || "unknown",
    notes: asString(record.notes),
    materialNotes: asString(record.material_notes),
    blocker: asString(record.blocker),
  };
}

function productRow(record: Record<string, unknown>): ProductCostingSheetRow {
  return {
    id: asString(record.id) || asString(record.product_name) || "unknown",
    latestVersionId: asString(record.latest_version_id),
    sourceLinkId: asString(record.source_link_id),
    productName: asString(record.product_name) || "Unnamed product costing sheet",
    productCode: asString(record.product_code),
    productFamily: asString(record.product_family),
    defaultVariant: asString(record.default_variant),
    status: asString(record.status) || "needs_review",
    sourceType: asString(record.source_type) as CostingSourceType | null,
    sourceLabel: asString(record.source_label),
    sourceUrl: asString(record.source_url),
    sourceExternalId: asString(record.source_external_id),
    sourceCapturedBy: asString(record.source_captured_by),
    sourceCapturedAt: asString(record.source_captured_at),
    versionLabel: asString(record.version_label),
    lastImportedAt: asString(record.last_imported_at),
    importedBy: asString(record.imported_by),
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
    approvalStatus: asString(record.approval_status),
    notes: asString(record.notes),
    sheetNotes: asString(record.sheet_notes),
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
      materialId: asString(record.material_id),
      sourceObservationId: asString(record.source_observation_id),
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
    `product_costing_versions?select=id,sheet_id&sheet_id=in.(${ids.join(",")})&order=imported_at.desc&order=created_at.desc&limit=500`,
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
    `product_costing_lines?select=id,version_id,material_id,source_observation_id,line_type,line_label,quantity,unit,unit_cost_ex_gst,total_cost_ex_gst,source_line_reference,freshness_status,confidence,notes,blocker&version_id=in.(${versionIds.join(",")})&order=line_type.asc&order=line_label.asc&limit=1000`,
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

type MaterialBaseRecord = {
  id: string;
  supplier_id?: string | null;
  is_active?: boolean | null;
  notes?: string | null;
  costing_suppliers?: {
    id?: string | null;
    supplier_type?: string | null;
    xero_contact_id?: string | null;
    website_url?: string | null;
    notes?: string | null;
  } | null;
};

function materialBaseRow(record: Record<string, unknown>): MaterialBaseRecord | null {
  const id = asString(record.id);
  if (!id) return null;
  const supplier = record.costing_suppliers && typeof record.costing_suppliers === "object" && !Array.isArray(record.costing_suppliers)
    ? record.costing_suppliers as Record<string, unknown>
    : null;
  return {
    id,
    supplier_id: asString(record.supplier_id),
    is_active: asBoolean(record.is_active),
    notes: asString(record.notes),
    costing_suppliers: supplier ? {
      id: asString(supplier.id),
      supplier_type: asString(supplier.supplier_type),
      xero_contact_id: asString(supplier.xero_contact_id),
      website_url: asString(supplier.website_url),
      notes: asString(supplier.notes),
    } : null,
  };
}

function latestObservationRow(record: Record<string, unknown>) {
  const id = asString(record.id);
  const materialId = asString(record.material_id);
  if (!id || !materialId) return null;
  return { ...record, id, materialId };
}

function currentPriceRow(record: Record<string, unknown>) {
  const id = asString(record.id);
  const materialId = asString(record.material_id);
  if (!id || !materialId) return null;
  return { ...record, id, materialId };
}

async function enrichMaterials(
  supabase: { url: string; serviceKey: string },
  materials: CostingMaterialRow[]
): Promise<{ rows: CostingMaterialRow[]; error?: string }> {
  const ids = materials.map((row) => row.id).filter((id) => id !== "unknown");
  if (ids.length === 0) return { rows: materials };

  const [bases, observations, currentPrices] = await Promise.all([
    readTable(
      supabase,
      `costing_materials?select=id,supplier_id,is_active,notes,costing_suppliers(id,supplier_type,xero_contact_id,website_url,notes)&id=in.(${ids.join(",")})&limit=500`,
      materialBaseRow
    ),
    readTable(
      supabase,
      `costing_price_observations?select=id,material_id,supplier_id,source_link_id,observed_at,supplier_item_label,unit,quantity,unit_cost_ex_gst,line_cost_ex_gst,gst_amount,currency,source_type,source_label,source_url,xero_bill_number,xero_bill_date,xero_line_description,inbound_freight_ex_gst,customer_delivery_charge_ex_gst,confidence,review_status,notes,blocker&material_id=in.(${ids.join(",")})&order=observed_at.desc&order=created_at.desc&limit=1500`,
      latestObservationRow
    ),
    readTable(
      supabase,
      `costing_current_prices?select=id,material_id,approved_unit_cost_ex_gst,unit,source_observation_id,approved_at,approved_by,approval_note,status&material_id=in.(${ids.join(",")})&status=eq.approved&order=approved_at.desc&limit=500`,
      currentPriceRow
    ),
  ]);

  const baseById = new Map(bases.rows.flatMap((row) => row ? [[row.id, row] as const] : []));
  const latestObservationByMaterial = new Map<string, Record<string, unknown> & { id: string; materialId: string }>();
  for (const observation of observations.rows) {
    if (!observation || latestObservationByMaterial.has(observation.materialId)) continue;
    latestObservationByMaterial.set(observation.materialId, observation);
  }
  const currentPriceByMaterial = new Map<string, Record<string, unknown> & { id: string; materialId: string }>();
  for (const price of currentPrices.rows) {
    if (!price || currentPriceByMaterial.has(price.materialId)) continue;
    currentPriceByMaterial.set(price.materialId, price);
  }

  const sourceLinkIds = Array.from(new Set([
    ...Array.from(latestObservationByMaterial.values()).map((row) => asString(row.source_link_id)),
  ].filter((id): id is string => Boolean(id))));
  const sourceLinks = sourceLinkIds.length
    ? await readTable(
        supabase,
        `costing_source_links?select=id,external_id,captured_by,captured_at&id=in.(${sourceLinkIds.join(",")})&limit=500`,
        (record) => ({ id: asString(record.id), externalId: asString(record.external_id), capturedBy: asString(record.captured_by), capturedAt: asString(record.captured_at) })
      )
    : { rows: [] as Array<{ id: string | null; externalId: string | null; capturedBy: string | null; capturedAt: string | null }> };
  const sourceById = new Map(sourceLinks.rows.flatMap((row) => row.id ? [[row.id, row] as const] : []));

  return {
    rows: materials.map((material) => {
      const base = baseById.get(material.id);
      const supplier = base?.costing_suppliers;
      const observation = latestObservationByMaterial.get(material.id);
      const current = currentPriceByMaterial.get(material.id);
      const sourceLinkId = asString(observation?.source_link_id) || material.sourceLinkId;
      const source = sourceLinkId ? sourceById.get(sourceLinkId) : null;
      return {
        ...material,
        supplierId: asString(observation?.supplier_id) || base?.supplier_id || material.supplierId,
        latestObservationId: observation?.id || material.latestObservationId,
        currentPriceId: current?.id || material.currentPriceId,
        sourceLinkId,
        supplierType: supplier?.supplier_type || material.supplierType,
        supplierXeroContactId: supplier?.xero_contact_id || material.supplierXeroContactId,
        supplierWebsiteUrl: supplier?.website_url || material.supplierWebsiteUrl,
        supplierNotes: supplier?.notes || material.supplierNotes,
        isActive: base?.is_active ?? material.isActive,
        materialNotes: base?.notes || material.materialNotes,
        currentApprovedBy: asString(current?.approved_by) || material.currentApprovedBy,
        currentApprovalNote: asString(current?.approval_note) || material.currentApprovalNote,
        currentPriceStatus: asString(current?.status) || material.currentPriceStatus,
        latestObservedAt: asString(observation?.observed_at) || material.latestObservedAt,
        latestObservedQuantity: asNumber(observation?.quantity) ?? material.latestObservedQuantity,
        latestObservedLineCostExGst: asNumber(observation?.line_cost_ex_gst) ?? material.latestObservedLineCostExGst,
        latestObservedGstAmount: asNumber(observation?.gst_amount) ?? material.latestObservedGstAmount,
        latestObservedCurrency: asString(observation?.currency) || material.latestObservedCurrency,
        latestObservedSupplierItemLabel: asString(observation?.supplier_item_label) || material.latestObservedSupplierItemLabel,
        sourceExternalId: source?.externalId || material.sourceExternalId,
        sourceCapturedBy: source?.capturedBy || material.sourceCapturedBy,
        sourceCapturedAt: source?.capturedAt || material.sourceCapturedAt,
      };
    }),
    error: [bases.error, observations.error, currentPrices.error, sourceLinks.error].filter(Boolean).join(" | ") || undefined,
  };
}

function productVersionDetailRow(record: Record<string, unknown>) {
  const id = asString(record.id);
  const sheetId = asString(record.sheet_id);
  if (!id || !sheetId) return null;
  return { ...record, id, sheetId };
}

async function enrichProducts(
  supabase: { url: string; serviceKey: string },
  products: ProductCostingSheetRow[]
): Promise<{ rows: ProductCostingSheetRow[]; error?: string }> {
  const ids = products.map((row) => row.id).filter((id) => id !== "unknown");
  if (ids.length === 0) return { rows: products };

  const versions = await readTable(
    supabase,
    `product_costing_versions?select=id,sheet_id,version_label,imported_at,imported_by,source_link_id,stale_source_line_count,total_materials_ex_gst,total_labour_hours,total_labour_cost_ex_gst,other_costs_ex_gst,total_cost_ex_gst,sell_price_ex_gst,sell_price_incl_gst,gross_profit_ex_gst,gross_margin_percent,markup_percent,ready_to_quote_status,approval_status,notes,blocker&sheet_id=in.(${ids.join(",")})&order=imported_at.desc&order=created_at.desc&limit=500`,
    productVersionDetailRow
  );
  const latestBySheet = new Map<string, Record<string, unknown> & { id: string; sheetId: string }>();
  for (const version of versions.rows) {
    if (!version || latestBySheet.has(version.sheetId)) continue;
    latestBySheet.set(version.sheetId, version);
  }
  const sourceLinkIds = Array.from(new Set([
    ...products.map((row) => row.sourceLinkId),
    ...Array.from(latestBySheet.values()).map((row) => asString(row.source_link_id)),
  ].filter((id): id is string => Boolean(id))));
  const sourceLinks = sourceLinkIds.length
    ? await readTable(
        supabase,
        `costing_source_links?select=id,external_id,captured_by,captured_at&id=in.(${sourceLinkIds.join(",")})&limit=500`,
        (record) => ({ id: asString(record.id), externalId: asString(record.external_id), capturedBy: asString(record.captured_by), capturedAt: asString(record.captured_at) })
      )
    : { rows: [] as Array<{ id: string | null; externalId: string | null; capturedBy: string | null; capturedAt: string | null }> };
  const sourceById = new Map(sourceLinks.rows.flatMap((row) => row.id ? [[row.id, row] as const] : []));

  return {
    rows: products.map((product) => {
      const version = latestBySheet.get(product.id);
      const sourceLinkId = asString(version?.source_link_id) || product.sourceLinkId;
      const source = sourceLinkId ? sourceById.get(sourceLinkId) : null;
      return {
        ...product,
        latestVersionId: version?.id || product.latestVersionId,
        sourceLinkId,
        versionLabel: asString(version?.version_label) || product.versionLabel,
        importedBy: asString(version?.imported_by) || product.importedBy,
        approvalStatus: asString(version?.approval_status) || product.approvalStatus,
        sheetNotes: product.sheetNotes || null,
        sourceExternalId: source?.externalId || product.sourceExternalId,
        sourceCapturedBy: source?.capturedBy || product.sourceCapturedBy,
        sourceCapturedAt: source?.capturedAt || product.sourceCapturedAt,
      };
    }),
    error: [versions.error, sourceLinks.error].filter(Boolean).join(" | ") || undefined,
  };
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
  const enrichedMaterials = materials.rows.length ? await enrichMaterials(supabase, materials.rows) : { rows: materials.rows };
  const enrichedProducts = products.rows.length ? await enrichProducts(supabase, products.rows) : { rows: products.rows };
  const productLines: { linesByProductId: Map<string, ProductCostingLineRow[]>; error?: string } = enrichedProducts.rows.length
    ? await readProductLinesForLatestVersions(supabase, products.rows)
    : { linesByProductId: new Map<string, ProductCostingLineRow[]>() };
  const productsWithLines = enrichedProducts.rows.map((product) => ({
    ...product,
    lines: productLines.linesByProductId.get(product.id) || [],
  }));

  return {
    materials: enrichedMaterials.rows,
    products: productsWithLines,
    syncedAt,
    source: "supabase",
    errors: [materials.error, products.error, enrichedMaterials.error, enrichedProducts.error, productLines.error].filter((error): error is string => Boolean(error)),
  };
}
