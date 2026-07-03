import { listCostings, type CostingMaterialRow, type ProductCostingSheetRow } from "./fetch-costings";

type CostingTargetKind =
  | "supplier"
  | "material"
  | "observation"
  | "currentPrice"
  | "sourceLink"
  | "productSheet"
  | "productVersion"
  | "productLine";

export type CostingUpdatePayload = {
  kind?: unknown;
  id?: unknown;
  fields?: unknown;
};

type SupabaseConfig = {
  url: string;
  serviceKey: string;
};

type FieldType = "text" | "requiredText" | "number" | "date" | "datetime" | "boolean" | "enum";
type FieldSpec = {
  column: string;
  type: FieldType;
  max?: number;
  values?: readonly string[];
  nullable?: boolean;
};

type TargetSpec = {
  table: string;
  entityType: "supplier" | "material" | "price_observation" | "current_price" | "source_link" | "product_sheet" | "product_version" | "product_line";
  fields: Record<string, FieldSpec>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_TYPES = ["xero_bill", "xero_invoice", "drive_sheet", "supplier_pdf", "gmail", "manual_note", "calculator", "supabase", "other"] as const;
const CONFIDENCE = ["high", "medium", "low", "unknown"] as const;
const PRICE_STATUS = ["fresh", "stale", "needs_review", "conflict", "missing_source", "approved", "rejected"] as const;
const LINE_FRESHNESS = ["fresh", "stale", "needs_review", "conflict", "missing_source"] as const;
const SUPPLIER_TYPES = ["supplier", "freight_carrier", "labour", "finish", "hardware", "steel", "timber", "service", "other"] as const;
const MATERIAL_CATEGORIES = ["timber", "sheet_material", "finish", "hardware", "steel_base", "freight", "labour", "machining", "packaging", "power", "service", "other", "uncategorised"] as const;
const CURRENT_PRICE_STATUS = ["approved", "superseded", "rejected"] as const;
const PRODUCT_STATUS = ["active", "draft", "needs_review", "archived"] as const;
const READY_STATUS = ["ready", "blocked", "needs_review"] as const;
const APPROVAL_STATUS = ["unapproved", "approved", "superseded", "rejected"] as const;
const LINE_TYPES = ["material", "labour", "freight", "finish", "hardware", "steel", "machining", "service", "other"] as const;

const TARGETS: Record<CostingTargetKind, TargetSpec> = {
  supplier: {
    table: "costing_suppliers",
    entityType: "supplier",
    fields: {
      name: { column: "name", type: "requiredText", max: 180 },
      supplierType: { column: "supplier_type", type: "enum", values: SUPPLIER_TYPES },
      xeroContactId: { column: "xero_contact_id", type: "text", max: 160, nullable: true },
      websiteUrl: { column: "website_url", type: "text", max: 500, nullable: true },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
    },
  },
  material: {
    table: "costing_materials",
    entityType: "material",
    fields: {
      name: { column: "name", type: "requiredText", max: 220 },
      internalCode: { column: "internal_code", type: "text", max: 120, nullable: true },
      supplierCode: { column: "supplier_code", type: "text", max: 160, nullable: true },
      category: { column: "category", type: "enum", values: MATERIAL_CATEGORIES },
      unit: { column: "unit", type: "text", max: 60, nullable: true },
      isActive: { column: "is_active", type: "boolean" },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
    },
  },
  observation: {
    table: "costing_price_observations",
    entityType: "price_observation",
    fields: {
      observedAt: { column: "observed_at", type: "datetime" },
      sourceType: { column: "source_type", type: "enum", values: SOURCE_TYPES },
      sourceLabel: { column: "source_label", type: "requiredText", max: 300 },
      sourceUrl: { column: "source_url", type: "text", max: 800, nullable: true },
      supplierItemLabel: { column: "supplier_item_label", type: "text", max: 300, nullable: true },
      unit: { column: "unit", type: "text", max: 60, nullable: true },
      quantity: { column: "quantity", type: "number", nullable: true },
      unitCostExGst: { column: "unit_cost_ex_gst", type: "number", nullable: true },
      lineCostExGst: { column: "line_cost_ex_gst", type: "number", nullable: true },
      gstAmount: { column: "gst_amount", type: "number", nullable: true },
      currency: { column: "currency", type: "requiredText", max: 12 },
      xeroBillNumber: { column: "xero_bill_number", type: "text", max: 120, nullable: true },
      xeroBillDate: { column: "xero_bill_date", type: "date", nullable: true },
      xeroLineDescription: { column: "xero_line_description", type: "text", max: 500, nullable: true },
      inboundFreightExGst: { column: "inbound_freight_ex_gst", type: "number", nullable: true },
      customerDeliveryChargeExGst: { column: "customer_delivery_charge_ex_gst", type: "number", nullable: true },
      confidence: { column: "confidence", type: "enum", values: CONFIDENCE },
      reviewStatus: { column: "review_status", type: "enum", values: PRICE_STATUS },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
      blocker: { column: "blocker", type: "text", max: 1000, nullable: true },
    },
  },
  currentPrice: {
    table: "costing_current_prices",
    entityType: "current_price",
    fields: {
      approvedUnitCostExGst: { column: "approved_unit_cost_ex_gst", type: "number" },
      unit: { column: "unit", type: "text", max: 60, nullable: true },
      approvedAt: { column: "approved_at", type: "datetime" },
      approvedBy: { column: "approved_by", type: "text", max: 120, nullable: true },
      approvalNote: { column: "approval_note", type: "text", max: 1000, nullable: true },
      status: { column: "status", type: "enum", values: CURRENT_PRICE_STATUS },
    },
  },
  sourceLink: {
    table: "costing_source_links",
    entityType: "source_link",
    fields: {
      sourceType: { column: "source_type", type: "enum", values: SOURCE_TYPES },
      sourceLabel: { column: "source_label", type: "requiredText", max: 300 },
      sourceUrl: { column: "source_url", type: "text", max: 800, nullable: true },
      externalId: { column: "external_id", type: "text", max: 300, nullable: true },
      capturedAt: { column: "captured_at", type: "datetime" },
      capturedBy: { column: "captured_by", type: "text", max: 120, nullable: true },
    },
  },
  productSheet: {
    table: "product_costing_sheets",
    entityType: "product_sheet",
    fields: {
      productName: { column: "product_name", type: "requiredText", max: 260 },
      productCode: { column: "product_code", type: "text", max: 120, nullable: true },
      productFamily: { column: "product_family", type: "text", max: 160, nullable: true },
      defaultVariant: { column: "default_variant", type: "text", max: 180, nullable: true },
      status: { column: "status", type: "enum", values: PRODUCT_STATUS },
      sourceType: { column: "source_type", type: "enum", values: SOURCE_TYPES, nullable: true },
      sourceLabel: { column: "source_label", type: "text", max: 300, nullable: true },
      sourceUrl: { column: "source_url", type: "text", max: 800, nullable: true },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
      blocker: { column: "blocker", type: "text", max: 1000, nullable: true },
    },
  },
  productVersion: {
    table: "product_costing_versions",
    entityType: "product_version",
    fields: {
      versionLabel: { column: "version_label", type: "text", max: 180, nullable: true },
      importedAt: { column: "imported_at", type: "datetime" },
      importedBy: { column: "imported_by", type: "text", max: 120, nullable: true },
      staleSourceLineCount: { column: "stale_source_line_count", type: "number", nullable: true },
      totalMaterialsExGst: { column: "total_materials_ex_gst", type: "number", nullable: true },
      totalLabourHours: { column: "total_labour_hours", type: "number", nullable: true },
      totalLabourCostExGst: { column: "total_labour_cost_ex_gst", type: "number", nullable: true },
      otherCostsExGst: { column: "other_costs_ex_gst", type: "number", nullable: true },
      totalCostExGst: { column: "total_cost_ex_gst", type: "number", nullable: true },
      sellPriceExGst: { column: "sell_price_ex_gst", type: "number", nullable: true },
      sellPriceInclGst: { column: "sell_price_incl_gst", type: "number", nullable: true },
      grossProfitExGst: { column: "gross_profit_ex_gst", type: "number", nullable: true },
      grossMarginPercent: { column: "gross_margin_percent", type: "number", nullable: true },
      markupPercent: { column: "markup_percent", type: "number", nullable: true },
      readyToQuoteStatus: { column: "ready_to_quote_status", type: "enum", values: READY_STATUS },
      approvalStatus: { column: "approval_status", type: "enum", values: APPROVAL_STATUS },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
      blocker: { column: "blocker", type: "text", max: 1000, nullable: true },
    },
  },
  productLine: {
    table: "product_costing_lines",
    entityType: "product_line",
    fields: {
      lineType: { column: "line_type", type: "enum", values: LINE_TYPES },
      lineLabel: { column: "line_label", type: "requiredText", max: 300 },
      quantity: { column: "quantity", type: "number", nullable: true },
      unit: { column: "unit", type: "text", max: 60, nullable: true },
      unitCostExGst: { column: "unit_cost_ex_gst", type: "number", nullable: true },
      totalCostExGst: { column: "total_cost_ex_gst", type: "number", nullable: true },
      sourceLineReference: { column: "source_line_reference", type: "text", max: 300, nullable: true },
      freshnessStatus: { column: "freshness_status", type: "enum", values: LINE_FRESHNESS },
      confidence: { column: "confidence", type: "enum", values: CONFIDENCE },
      notes: { column: "notes", type: "text", max: 2000, nullable: true },
      blocker: { column: "blocker", type: "text", max: 1000, nullable: true },
    },
  },
};

export function validateCostingUpdatePayload(payload: CostingUpdatePayload) {
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  if (!isTargetKind(kind)) return { ok: false as const, error: "Unknown costing edit target." };
  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!UUID_RE.test(id)) return { ok: false as const, error: "Invalid costing row id." };
  if (!payload.fields || typeof payload.fields !== "object" || Array.isArray(payload.fields)) {
    return { ok: false as const, error: "Missing costing edit fields." };
  }
  const spec = TARGETS[kind];
  const input = payload.fields as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  const changed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    const fieldSpec = spec.fields[field];
    if (!fieldSpec) return { ok: false as const, error: `Field is not editable here: ${field}` };
    const parsed = cleanValue(value, fieldSpec);
    if (!parsed.ok) return { ok: false as const, error: `${field}: ${parsed.error}` };
    update[fieldSpec.column] = parsed.value;
    changed[field] = parsed.value;
  }
  if (Object.keys(update).length === 0) return { ok: false as const, error: "No costing fields to save." };
  if (kind === "productLine" && (Object.prototype.hasOwnProperty.call(update, "quantity") || Object.prototype.hasOwnProperty.call(update, "unit_cost_ex_gst")) && !Object.prototype.hasOwnProperty.call(update, "total_cost_ex_gst")) {
    const qty = typeof update.quantity === "number" ? update.quantity : null;
    const unit = typeof update.unit_cost_ex_gst === "number" ? update.unit_cost_ex_gst : null;
    if (qty !== null && unit !== null) {
      update.total_cost_ex_gst = roundMoney(qty * unit);
      changed.totalCostExGst = update.total_cost_ex_gst;
    }
  }
  return { ok: true as const, kind, id, spec, update, changed };
}

export async function updateCosting(payload: CostingUpdatePayload) {
  const validated = validateCostingUpdatePayload(payload);
  if (!validated.ok) return validated;
  const supabase = supabaseConfig();
  if (!supabase) return { ok: false as const, error: "Supabase env is not configured for Costings writes." };

  const before = await readOne(supabase, validated.spec.table, validated.id);
  if (!before) return { ok: false as const, error: "Costing row was not found." };
  const saved = await patchOne(supabase, validated.spec.table, validated.id, withUpdatedAt(validated.spec.table, validated.update));

  const versionId = validated.kind === "productLine" ? asString(saved.version_id) : validated.kind === "productVersion" ? validated.id : null;
  if (versionId && validated.kind === "productLine") await recomputeVersionTotals(supabase, versionId);
  if (validated.kind === "productVersion") await recomputeDerivedVersionFields(supabase, validated.id);

  await writeAuditEvent(supabase, {
    eventType: auditEventType(validated.kind, validated.changed),
    entityType: validated.spec.entityType,
    entityId: validated.id,
    label: `Tuesday Costings ${validated.kind} edit`,
    details: {
      changed: validated.changed,
      before: pickChangedBefore(before, validated.update),
      recomputedVersionId: versionId,
    },
  });

  const result = await listCostings();
  const material = findMaterialForSavedRow(result.materials, validated.kind, validated.id, saved);
  const product = findProductForSavedRow(result.products, validated.kind, validated.id, saved, versionId);
  return { ok: true as const, material, product, syncedAt: result.syncedAt };
}

function isTargetKind(value: string): value is CostingTargetKind {
  return Object.prototype.hasOwnProperty.call(TARGETS, value);
}

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function cleanValue(value: unknown, spec: FieldSpec): { ok: true; value: unknown } | { ok: false; error: string } {
  if ((value === "" || value === null) && spec.nullable) return { ok: true, value: null };
  if (spec.type === "text" || spec.type === "requiredText") {
    if (typeof value !== "string") return { ok: false, error: "must be text" };
    const text = value.trim();
    if (spec.type === "requiredText" && !text) return { ok: false, error: "cannot be blank" };
    if (!text && spec.nullable) return { ok: true, value: null };
    if (spec.max && text.length > spec.max) return { ok: false, error: `is too long (max ${spec.max})` };
    return { ok: true, value: text };
  }
  if (spec.type === "number") {
    if (value === "" || value === null) {
      if (spec.nullable) return { ok: true, value: null };
      return { ok: false, error: "cannot be blank" };
    }
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
    if (!Number.isFinite(number)) return { ok: false, error: "must be a valid number" };
    if (number < 0 && spec.column !== "gross_profit_ex_gst" && spec.column !== "gross_margin_percent" && spec.column !== "markup_percent") return { ok: false, error: "cannot be negative" };
    return { ok: true, value: roundDecimal(number) };
  }
  if (spec.type === "boolean") {
    if (typeof value !== "boolean") return { ok: false, error: "must be true or false" };
    return { ok: true, value };
  }
  if (spec.type === "enum") {
    if ((value === "" || value === null) && spec.nullable) return { ok: true, value: null };
    if (typeof value !== "string" || !spec.values?.includes(value)) return { ok: false, error: "is not an allowed value" };
    return { ok: true, value };
  }
  if (spec.type === "date" || spec.type === "datetime") {
    if ((value === "" || value === null) && spec.nullable) return { ok: true, value: null };
    if (typeof value !== "string" || !value.trim()) return { ok: false, error: "must be a date" };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { ok: false, error: "must be a valid date" };
    if (spec.type === "date") return { ok: true, value: value.slice(0, 10) };
    return { ok: true, value: date.toISOString() };
  }
  return { ok: false, error: "has unsupported type" };
}

function roundDecimal(value: number) {
  return Math.round(value * 10000) / 10000;
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function withUpdatedAt(table: string, update: Record<string, unknown>) {
  if (table === "costing_suppliers" || table === "costing_materials" || table === "product_costing_sheets") {
    return { ...update, updated_at: new Date().toISOString() };
  }
  return update;
}

async function supabaseFetch(supabase: SupabaseConfig, path: string, init?: RequestInit) {
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabase.serviceKey,
      Authorization: `Bearer ${supabase.serviceKey}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase Costings write failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return response;
}

async function readOne(supabase: SupabaseConfig, table: string, id: string) {
  const response = await supabaseFetch(supabase, `${table}?select=*&id=eq.${id}&limit=1`);
  const rows = await response.json() as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function patchOne(supabase: SupabaseConfig, table: string, id: string, update: Record<string, unknown>) {
  const response = await supabaseFetch(supabase, `${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(update),
  });
  const rows = await response.json() as Record<string, unknown>[];
  return rows[0] ?? {};
}

async function recomputeVersionTotals(supabase: SupabaseConfig, versionId: string) {
  const response = await supabaseFetch(supabase, `product_costing_lines?select=line_type,quantity,total_cost_ex_gst&version_id=eq.${versionId}&limit=2000`);
  const lines = await response.json() as Array<{ line_type?: string | null; quantity?: number | string | null; total_cost_ex_gst?: number | string | null }>;
  let materials = 0;
  let labourCost = 0;
  let labourHours = 0;
  let other = 0;
  let hasMaterials = false;
  let hasLabourCost = false;
  let hasLabourHours = false;
  let hasOther = false;
  for (const line of lines) {
    const total = asNumber(line.total_cost_ex_gst);
    if (line.line_type === "material") {
      if (total !== null) {
        materials += total;
        hasMaterials = true;
      }
    } else if (line.line_type === "labour") {
      const qty = asNumber(line.quantity);
      if (qty !== null) {
        labourHours += qty;
        hasLabourHours = true;
      }
      if (total !== null) {
        labourCost += total;
        hasLabourCost = true;
      }
    } else if (total !== null) {
      other += total;
      hasOther = true;
    }
  }
  const totalCost = (hasMaterials ? materials : 0) + (hasLabourCost ? labourCost : 0) + (hasOther ? other : 0);
  await patchOne(supabase, "product_costing_versions", versionId, {
    total_materials_ex_gst: hasMaterials ? roundMoney(materials) : null,
    total_labour_hours: hasLabourHours ? roundDecimal(labourHours) : null,
    total_labour_cost_ex_gst: hasLabourCost ? roundMoney(labourCost) : null,
    other_costs_ex_gst: hasOther ? roundMoney(other) : null,
    total_cost_ex_gst: hasMaterials || hasLabourCost || hasOther ? roundMoney(totalCost) : null,
    ...await derivedVersionFields(supabase, versionId, hasMaterials || hasLabourCost || hasOther ? roundMoney(totalCost) : null),
  });
}

async function recomputeDerivedVersionFields(supabase: SupabaseConfig, versionId: string) {
  const current = await readOne(supabase, "product_costing_versions", versionId);
  if (!current) return;
  await patchOne(supabase, "product_costing_versions", versionId, await derivedVersionFields(supabase, versionId));
}

async function derivedVersionFields(supabase: SupabaseConfig, versionId: string, totalOverride?: number | null) {
  const current = await readOne(supabase, "product_costing_versions", versionId);
  if (!current) return {};
  const total = totalOverride !== undefined ? totalOverride : asNumber(current.total_cost_ex_gst);
  const sell = asNumber(current.sell_price_ex_gst);
  const sellIncl = asNumber(current.sell_price_incl_gst);
  const next: Record<string, unknown> = {};
  if (sell !== null && total !== null) {
    const profit = sell - total;
    next.gross_profit_ex_gst = roundMoney(profit);
    next.gross_margin_percent = sell === 0 ? null : roundDecimal((profit / sell) * 100);
    next.markup_percent = total === 0 ? null : roundDecimal((profit / total) * 100);
  }
  if (sell !== null && sellIncl === null) next.sell_price_incl_gst = roundMoney(sell * 1.15);
  return next;
}

async function writeAuditEvent(
  supabase: SupabaseConfig,
  event: {
    eventType: "approval" | "override" | "blocker" | "review";
    entityType: TargetSpec["entityType"];
    entityId: string;
    label: string;
    details: Record<string, unknown>;
  }
) {
  await supabaseFetch(supabase, "costing_audit_events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_type: event.eventType,
      entity_type: event.entityType,
      entity_id: event.entityId,
      event_label: event.label,
      event_status: "succeeded",
      actor: "Tuesday",
      details: event.details,
    }),
  });
}

function auditEventType(kind: CostingTargetKind, changed: Record<string, unknown>) {
  if (kind === "currentPrice" || changed.approvalStatus === "approved" || changed.status === "approved") return "approval" as const;
  if (Object.prototype.hasOwnProperty.call(changed, "blocker")) return "blocker" as const;
  if (Object.prototype.hasOwnProperty.call(changed, "reviewStatus") || Object.prototype.hasOwnProperty.call(changed, "readyToQuoteStatus")) return "review" as const;
  return "override" as const;
}

function pickChangedBefore(before: Record<string, unknown>, update: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(update).filter((key) => key !== "updated_at").map((key) => [key, before[key] ?? null]));
}

function findMaterialForSavedRow(materials: CostingMaterialRow[], kind: CostingTargetKind, id: string, saved: Record<string, unknown>) {
  if (kind === "material") return materials.find((row) => row.id === id) ?? null;
  if (kind === "supplier") return materials.find((row) => row.supplierId === id) ?? null;
  if (kind === "observation") return materials.find((row) => row.latestObservationId === id || row.id === asString(saved.material_id)) ?? null;
  if (kind === "currentPrice") return materials.find((row) => row.currentPriceId === id || row.id === asString(saved.material_id)) ?? null;
  if (kind === "sourceLink") return materials.find((row) => row.sourceLinkId === id) ?? null;
  return null;
}

function findProductForSavedRow(products: ProductCostingSheetRow[], kind: CostingTargetKind, id: string, saved: Record<string, unknown>, versionId: string | null) {
  if (kind === "productSheet") return products.find((row) => row.id === id) ?? null;
  if (kind === "productVersion") return products.find((row) => row.latestVersionId === id || row.id === asString(saved.sheet_id)) ?? null;
  if (kind === "productLine") return products.find((row) => row.latestVersionId === versionId || row.lines.some((line) => line.id === id)) ?? null;
  if (kind === "sourceLink") return products.find((row) => row.sourceLinkId === id) ?? null;
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
