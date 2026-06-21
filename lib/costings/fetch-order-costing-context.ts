import type { UiOrder } from "@/lib/monday/mapping";

type RawProductSheet = {
  id: string;
  product_name?: string | null;
  product_code?: string | null;
  source_label?: string | null;
  source_url?: string | null;
  status?: string | null;
};

type RawProductVersion = {
  id: string;
  sheet_id?: string | null;
  imported_at?: string | null;
  ready_to_quote_status?: string | null;
  approval_status?: string | null;
  total_cost_ex_gst?: number | string | null;
  gross_margin_percent?: number | string | null;
  source_hash?: string | null;
};

export type OrderCostingStatus = "verified_attached" | "verified_needs_review" | "needs_match" | "costings_unavailable";

export type OrderCostingMatch = {
  orderId: number;
  status: OrderCostingStatus;
  label: string;
  detail: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  totalCostExGst: number | null;
  grossMarginPercent: number | null;
  matchedBy: string | null;
  readyToQuoteStatus: string | null;
  approvalStatus: string | null;
};

export type OrderCostingContext = {
  matches: Record<number, OrderCostingMatch>;
  activeVerifiedCount: number;
  needsMatchCount: number;
  syncedAt: string;
  errors: string[];
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function normalize(value: string | null | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function token(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, "-");
}

async function readTable<T>(supabase: { url: string; serviceKey: string }, path: string): Promise<{ rows: T[]; error?: string }> {
  try {
    const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
      headers: {
        apikey: supabase.serviceKey,
        Authorization: `Bearer ${supabase.serviceKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text();
      return { rows: [], error: `Costing read failed for ${path.split("?")[0]}: HTTP ${response.status} ${body.slice(0, 180)}` };
    }
    return { rows: (await response.json()) as T[] };
  } catch (error) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function emptyMatch(order: UiOrder, status: OrderCostingStatus, detail: string): OrderCostingMatch {
  return {
    orderId: order.id,
    status,
    label: status === "costings_unavailable" ? "Costings unavailable" : "Needs costing match",
    detail,
    sourceLabel: null,
    sourceUrl: null,
    totalCostExGst: null,
    grossMarginPercent: null,
    matchedBy: null,
    readyToQuoteStatus: null,
    approvalStatus: null,
  };
}

type VerifiedProductCosting = {
  sheet: RawProductSheet;
  version: RawProductVersion;
};

function matchOrder(order: UiOrder, products: VerifiedProductCosting[]): OrderCostingMatch | null {
  const invoiceToken = token(order.xeroInvoiceNumber);
  const rawItemToken = token(order.rawMondayItem);
  const customerText = normalize(order.customer);
  const direct = products.find(({ sheet }) => {
    const code = token(sheet.product_code);
    return Boolean(code && (code === invoiceToken || code === rawItemToken));
  });
  const customerCandidates = customerText.length >= 5
    ? products.filter(({ sheet }) => {
        const productName = normalize(sheet.product_name);
        const sourceLabel = normalize(sheet.source_label);
        return productName.includes(customerText) || sourceLabel.includes(customerText);
      })
    : [];
  const match = direct || (customerCandidates.length === 1 ? customerCandidates[0] : null);
  if (!match) return null;
  const matchedBy = direct ? "exact product code" : "unique approved customer/project source label";
  const approvedReady = match.version.approval_status === "approved" && match.version.ready_to_quote_status === "ready";
  return {
    orderId: order.id,
    status: approvedReady ? "verified_attached" : "verified_needs_review",
    label: approvedReady ? "Verified costing attached" : "Verified costing needs approval",
    detail: match.sheet.product_name || "Source-verified product costing sheet",
    sourceLabel: text(match.sheet.source_label),
    sourceUrl: text(match.sheet.source_url),
    totalCostExGst: number(match.version.total_cost_ex_gst),
    grossMarginPercent: number(match.version.gross_margin_percent),
    matchedBy,
    readyToQuoteStatus: text(match.version.ready_to_quote_status),
    approvalStatus: text(match.version.approval_status),
  };
}

export async function getOrderCostingContext(orders: UiOrder[]): Promise<OrderCostingContext> {
  const syncedAt = new Date().toISOString();
  const supabase = supabaseConfig();
  if (!supabase) {
    const matches = Object.fromEntries(orders.map((order) => [order.id, emptyMatch(order, "costings_unavailable", "Supabase Costings env is not configured.")]));
    return { matches, activeVerifiedCount: 0, needsMatchCount: orders.length, syncedAt, errors: ["Supabase env is not configured for order costing context."] };
  }

  const [sheets, versions] = await Promise.all([
    readTable<RawProductSheet>(supabase, "product_costing_sheets?select=id,product_name,product_code,source_label,source_url,status&status=eq.active&limit=500"),
    readTable<RawProductVersion>(supabase, "product_costing_versions?select=id,sheet_id,imported_at,ready_to_quote_status,approval_status,total_cost_ex_gst,gross_margin_percent,source_hash&approval_status=neq.rejected&source_hash=not.is.null&order=imported_at.desc&limit=500"),
  ]);
  const errors = [sheets.error, versions.error].filter((error): error is string => Boolean(error));
  if (errors.length) {
    const matches = Object.fromEntries(orders.map((order) => [order.id, emptyMatch(order, "costings_unavailable", "Costings could not be read. Use the Costings tab before relying on order margins.")]));
    return { matches, activeVerifiedCount: 0, needsMatchCount: orders.length, syncedAt, errors };
  }

  const sheetById = new Map(sheets.rows.map((sheet) => [sheet.id, sheet]));
  const latestVersionBySheet = new Map<string, RawProductVersion>();
  for (const version of versions.rows) {
    const sheetId = text(version.sheet_id);
    if (sheetId && !latestVersionBySheet.has(sheetId)) latestVersionBySheet.set(sheetId, version);
  }
  const verifiedProducts = Array.from(latestVersionBySheet.entries())
    .map(([sheetId, version]) => {
      const sheet = sheetById.get(sheetId);
      return sheet ? { sheet, version } : null;
    })
    .filter((value): value is VerifiedProductCosting => Boolean(value));

  const matches: Record<number, OrderCostingMatch> = {};
  for (const order of orders) {
    matches[order.id] = matchOrder(order, verifiedProducts) || emptyMatch(order, "needs_match", "No source-verified product costing is explicitly attached to this order.");
  }
  const activeVerifiedCount = Object.values(matches).filter((match) => match.status === "verified_attached" || match.status === "verified_needs_review").length;
  return {
    matches,
    activeVerifiedCount,
    needsMatchCount: orders.length - activeVerifiedCount,
    syncedAt,
    errors,
  };
}
