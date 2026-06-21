export type StockBalanceRow = {
  stockItemId: string;
  itemCode: string | null;
  name: string;
  category: string | null;
  speciesOrMaterial: string | null;
  dimensions: string | null;
  defaultUnit: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  approvedUnitCostExGst: number | null;
  stockValueExGst: number | null;
  lastMovementAt: string | null;
  isActive: boolean;
};

export type StockExceptionRow = {
  id: string;
  exceptionType: string;
  severity: string;
  stockItemId: string | null;
  sourceLinkId: string | null;
  title: string;
  detail: string | null;
  status: string;
  assignedTo: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string | null;
};

export type StockMappingRuleRow = {
  id: string;
  ruleType: string;
  supplierId: string | null;
  supplierName: string | null;
  matchPattern: string;
  stockItemId: string;
  stockItemName: string | null;
  unit: string | null;
  confidence: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string | null;
};

export type StockDashboardResult = {
  source: "supabase" | "none";
  syncedAt: string;
  errors: string[];
  balances: StockBalanceRow[];
  exceptions: StockExceptionRow[];
  mappingRules: StockMappingRuleRow[];
  summary: {
    stockItems: number;
    activeStockItems: number;
    quantityOnHand: number;
    quantityReserved: number;
    quantityAvailable: number;
    stockValueExGst: number;
    openExceptions: number;
    unmappedBillLines: number;
    activeMappingRules: number;
  };
};

type SupabaseConfig = { url: string; serviceKey: string };

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asBoolean(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

async function supabaseRead<T>(cfg: SupabaseConfig, pathname: string): Promise<{ rows: T[]; error?: string }> {
  try {
    const response = await fetch(`${cfg.url}/rest/v1/${pathname}`, {
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
      },
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) return { rows: [], error: `Supabase ${pathname} HTTP ${response.status}: ${body.slice(0, 220)}` };
    return { rows: body ? JSON.parse(body) as T[] : [] };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function balanceRow(record: Record<string, unknown>): StockBalanceRow {
  return {
    stockItemId: asString(record.stock_item_id) || "unknown",
    itemCode: asString(record.item_code),
    name: asString(record.name) || "Unnamed stock item",
    category: asString(record.category),
    speciesOrMaterial: asString(record.species_or_material),
    dimensions: asString(record.dimensions),
    defaultUnit: asString(record.default_unit),
    quantityOnHand: asNumber(record.quantity_on_hand),
    quantityReserved: asNumber(record.quantity_reserved),
    quantityAvailable: asNumber(record.quantity_available),
    approvedUnitCostExGst: asNullableNumber(record.approved_unit_cost_ex_gst),
    stockValueExGst: asNullableNumber(record.stock_value_ex_gst),
    lastMovementAt: asString(record.last_movement_at),
    isActive: asBoolean(record.is_active),
  };
}

function exceptionRow(record: Record<string, unknown>): StockExceptionRow {
  return {
    id: asString(record.id) || "unknown",
    exceptionType: asString(record.exception_type) || "other",
    severity: asString(record.severity) || "medium",
    stockItemId: asString(record.stock_item_id),
    sourceLinkId: asString(record.source_link_id),
    title: asString(record.title) || "Stock exception",
    detail: asString(record.detail),
    status: asString(record.status) || "open",
    assignedTo: asString(record.assigned_to),
    resolvedAt: asString(record.resolved_at),
    resolutionNote: asString(record.resolution_note),
    createdAt: asString(record.created_at),
  };
}

function mappingRuleRow(record: Record<string, unknown>, stockItemNames: Map<string, string>, supplierNames: Map<string, string>): StockMappingRuleRow {
  const stockItemId = asString(record.stock_item_id) || "unknown";
  const supplierId = asString(record.supplier_id);
  return {
    id: asString(record.id) || "unknown",
    ruleType: asString(record.rule_type) || "description_keyword",
    supplierId,
    supplierName: supplierId ? supplierNames.get(supplierId) || null : null,
    matchPattern: asString(record.match_pattern) || "",
    stockItemId,
    stockItemName: stockItemNames.get(stockItemId) || null,
    unit: asString(record.unit),
    confidence: asString(record.confidence) || "medium",
    isActive: asBoolean(record.is_active),
    notes: asString(record.notes),
    createdAt: asString(record.created_at),
  };
}

export async function fetchStockDashboard(): Promise<StockDashboardResult> {
  const syncedAt = new Date().toISOString();
  const cfg = supabaseConfig();
  if (!cfg) {
    return {
      source: "none",
      syncedAt,
      errors: ["Supabase is not configured"],
      balances: [],
      exceptions: [],
      mappingRules: [],
      summary: { stockItems: 0, activeStockItems: 0, quantityOnHand: 0, quantityReserved: 0, quantityAvailable: 0, stockValueExGst: 0, openExceptions: 0, unmappedBillLines: 0, activeMappingRules: 0 },
    };
  }

  const [balancesResult, exceptionsResult, rulesResult, itemsResult, suppliersResult] = await Promise.all([
    supabaseRead<Record<string, unknown>>(cfg, "stock_item_balances?select=*&order=name.asc&limit=500"),
    supabaseRead<Record<string, unknown>>(cfg, "stock_exceptions?select=*&status=in.(open,in_review)&order=created_at.desc&limit=200"),
    supabaseRead<Record<string, unknown>>(cfg, "stock_mapping_rules?select=*&order=created_at.desc&limit=500"),
    supabaseRead<Record<string, unknown>>(cfg, "stock_items?select=id,name,is_active&limit=1000"),
    supabaseRead<Record<string, unknown>>(cfg, "costing_suppliers?select=id,name&limit=1000"),
  ]);

  const errors = [balancesResult.error, exceptionsResult.error, rulesResult.error, itemsResult.error, suppliersResult.error].filter(Boolean) as string[];
  const stockItemNames = new Map((itemsResult.rows || []).map((row) => [asString(row.id) || "", asString(row.name) || "Unnamed stock item"]));
  const supplierNames = new Map((suppliersResult.rows || []).map((row) => [asString(row.id) || "", asString(row.name) || "Unnamed supplier"]));
  const balances = balancesResult.rows.map(balanceRow);
  const exceptions = exceptionsResult.rows.map(exceptionRow);
  const mappingRules = rulesResult.rows.map((row) => mappingRuleRow(row, stockItemNames, supplierNames));
  const openExceptions = exceptions.filter((row) => row.status === "open" || row.status === "in_review").length;
  const unmappedBillLines = exceptions.filter((row) => row.exceptionType === "unmapped_xero_bill_line").length;
  const activeMappingRules = mappingRules.filter((row) => row.isActive).length;

  return {
    source: errors.length ? "none" : "supabase",
    syncedAt,
    errors,
    balances,
    exceptions,
    mappingRules,
    summary: {
      stockItems: balances.length,
      activeStockItems: balances.filter((row) => row.isActive).length,
      quantityOnHand: balances.reduce((sum, row) => sum + row.quantityOnHand, 0),
      quantityReserved: balances.reduce((sum, row) => sum + row.quantityReserved, 0),
      quantityAvailable: balances.reduce((sum, row) => sum + row.quantityAvailable, 0),
      stockValueExGst: balances.reduce((sum, row) => sum + (row.stockValueExGst || 0), 0),
      openExceptions,
      unmappedBillLines,
      activeMappingRules,
    },
  };
}
