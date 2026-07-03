import { NextRequest, NextResponse } from "next/server";
import { listCategoryPricingPolicies, setCategoryPricingPolicyStatus } from "@/lib/quoting/policyStore";
import type { QuotePolicyApprovalStatus } from "@/lib/quoting/categoryPolicies";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set(["draft", "needs_review", "approved", "archived"]);

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Quote policy request failed";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/apikey\s*[:=]\s*[^\s,}]+/gi, "apikey=[REDACTED]")
    .replace(/service[_-]?role[_-]?key\s*[:=]\s*[^\s,}]+/gi, "service_role_key=[REDACTED]")
    .slice(0, 700);
}

export async function GET() {
  const result = await listCategoryPricingPolicies();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { categoryKey?: unknown; status?: unknown; actor?: unknown };
    if (typeof body.categoryKey !== "string" || !body.categoryKey.trim()) throw new Error("categoryKey is required");
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) throw new Error("status must be draft, needs_review, approved, or archived");
    const actor = typeof body.actor === "string" && body.actor.trim() ? body.actor.trim().slice(0, 80) : "Guido";
    await setCategoryPricingPolicyStatus(body.categoryKey, body.status as QuotePolicyApprovalStatus, actor);
    const result = await listCategoryPricingPolicies();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: safeError(error) }, { status: 400 });
  }
}
