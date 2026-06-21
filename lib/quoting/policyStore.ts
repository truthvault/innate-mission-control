import { QUOTE_CATEGORY_POLICIES, quotePolicyByKey, type QuoteCategoryPolicy, type QuotePolicyApprovalStatus } from "./categoryPolicies.ts";

type SupabaseConfig = { url: string; serviceKey: string };

type QuoteCategoryPolicyRow = {
  id?: string;
  category_key: string;
  category_name?: string;
  product_area?: QuoteCategoryPolicy["productArea"];
  sort_order?: number;
  approval_status?: QuotePolicyApprovalStatus;
  target_gross_margin_percent?: number;
  pricing_formula?: string;
  policy_payload?: Partial<QuoteCategoryPolicy>;
  approved_by?: string | null;
  approved_at?: string | null;
  notes?: string | null;
};

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env not configured for quote policy store");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Quote policy Supabase request failed: ${response.status} ${text.slice(0, 600)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

function rowToPolicy(row: QuoteCategoryPolicyRow, base: QuoteCategoryPolicy): QuoteCategoryPolicy {
  const payload = row.policy_payload || {};
  return {
    ...base,
    ...payload,
    categoryKey: row.category_key || base.categoryKey,
    categoryName: row.category_name || payload.categoryName || base.categoryName,
    productArea: row.product_area || payload.productArea || base.productArea,
    sortOrder: row.sort_order ?? payload.sortOrder ?? base.sortOrder,
    approvalStatus: row.approval_status || payload.approvalStatus || base.approvalStatus,
    suggestedTargetGrossMarginPercent: Number(row.target_gross_margin_percent ?? payload.suggestedTargetGrossMarginPercent ?? base.suggestedTargetGrossMarginPercent),
    pricingFormula: row.pricing_formula || payload.pricingFormula || base.pricingFormula,
    approvedBy: row.approved_by ?? payload.approvedBy ?? base.approvedBy ?? null,
    approvedAt: row.approved_at ?? payload.approvedAt ?? base.approvedAt ?? null,
    notes: row.notes ?? payload.notes ?? base.notes ?? null,
  };
}

function policyToRow(policy: QuoteCategoryPolicy, status = policy.approvalStatus, actor?: string): Record<string, unknown> {
  const approvedAt = status === "approved" ? new Date().toISOString() : policy.approvedAt || null;
  const approvedBy = status === "approved" ? actor || policy.approvedBy || "Guido" : policy.approvedBy || null;
  return {
    category_key: policy.categoryKey,
    category_name: policy.categoryName,
    product_area: policy.productArea,
    sort_order: policy.sortOrder,
    approval_status: status,
    target_gross_margin_percent: policy.suggestedTargetGrossMarginPercent,
    pricing_formula: policy.pricingFormula,
    policy_payload: { ...policy, approvalStatus: status, approvedAt, approvedBy },
    approved_by: approvedBy,
    approved_at: approvedAt,
    notes: policy.notes || null,
  };
}

export async function listCategoryPricingPolicies(): Promise<{ policies: QuoteCategoryPolicy[]; source: "supabase" | "defaults"; error?: string }> {
  const defaults = [...QUOTE_CATEGORY_POLICIES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (!supabaseConfig()) return { policies: defaults, source: "defaults", error: "Supabase env is not configured" };
  try {
    const rows = await supabaseRequest<QuoteCategoryPolicyRow[]>("quote_category_pricing_policies?select=*&order=sort_order.asc");
    const byKey = new Map(rows.map((row) => [row.category_key, row]));
    const merged = defaults.map((policy) => {
      const row = byKey.get(policy.categoryKey);
      return row ? rowToPolicy(row, policy) : policy;
    });
    return { policies: merged, source: "supabase" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load quote category policies";
    return { policies: defaults, source: "defaults", error: message };
  }
}

export async function upsertCategoryPricingPolicy(policy: QuoteCategoryPolicy, status = policy.approvalStatus, actor = "Hermes"): Promise<void> {
  await supabaseRequest("quote_category_pricing_policies?on_conflict=category_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(policyToRow(policy, status, actor)),
  });
}

export async function syncDefaultCategoryPricingPolicies(actor = "quote_spine_sync"): Promise<void> {
  const existing = await listCategoryPricingPolicies();
  for (const policy of QUOTE_CATEGORY_POLICIES) {
    const current = existing.policies.find((item) => item.categoryKey === policy.categoryKey);
    await upsertCategoryPricingPolicy({ ...policy, approvedAt: current?.approvedAt, approvedBy: current?.approvedBy }, current?.approvalStatus || policy.approvalStatus, actor);
  }
}

export async function setCategoryPricingPolicyStatus(categoryKey: string, status: QuotePolicyApprovalStatus, actor = "Guido"): Promise<void> {
  const policy = quotePolicyByKey(categoryKey);
  if (!policy) throw new Error(`Unknown quote category policy: ${categoryKey}`);
  await upsertCategoryPricingPolicy(policy, status, actor);
  await supabaseRequest("quote_audit_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      actor,
      event_type: `category_policy_${status}`,
      event_summary: `${policy.categoryName} pricing policy marked ${status}.`,
      payload: { categoryKey, status, targetGrossMarginPercent: policy.suggestedTargetGrossMarginPercent, dryRunOnly: true },
    }),
  });
}
