import { NextRequest, NextResponse } from "next/server";
import { kelvenPanelExample, jamesShedShopExample, missingCostExample, stalePriceExample } from "@/lib/quoting/examples";
import { quoteRuleSummaryForHermes } from "@/lib/quoting/innateDefaults";
import { createQuoteDraft, getQuoteSupabaseStatus } from "@/lib/quoting/supabase";
import type { QuoteScenarioInput } from "@/lib/quoting/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXAMPLES = {
  kelven: kelvenPanelExample,
  james: jamesShedShopExample,
  stale: stalePriceExample,
  missing: missingCostExample,
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Quote draft failed";
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/apikey\s*[:=]\s*[^\s,}]+/gi, "apikey=[REDACTED]")
    .replace(/service[_-]?role[_-]?key\s*[:=]\s*[^\s,}]+/gi, "service_role_key=[REDACTED]")
    .slice(0, 700);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function validateQuoteInput(value: unknown): QuoteScenarioInput {
  if (!isObject(value)) throw new Error("Quote draft body must be an object.");
  if (typeof value.requestName !== "string" || !value.requestName.trim()) throw new Error("requestName is required.");
  if (!Array.isArray(value.costLines) || value.costLines.length === 0) throw new Error("At least one cost line is required.");
  return value as QuoteScenarioInput;
}

export async function GET(request: NextRequest) {
  const exampleName = request.nextUrl.searchParams.get("example") as keyof typeof EXAMPLES | null;
  if (exampleName && EXAMPLES[exampleName]) {
    const draft = await createQuoteDraft(EXAMPLES[exampleName](), { includeXero: true, persist: false, actor: "api_example" });
    return NextResponse.json(draft);
  }
  return NextResponse.json({
    ok: true,
    mode: "quote_spine_v1",
    draftOnly: true,
    supabase: getQuoteSupabaseStatus(),
    ruleSummary: quoteRuleSummaryForHermes(),
    examples: Object.keys(EXAMPLES),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as unknown;
    if (!isObject(body)) throw new Error("Quote draft body must be an object.");
    const input = validateQuoteInput(body.input || body);
    const draft = await createQuoteDraft(input, {
      includeXero: cleanBoolean(body.includeXero, true),
      persist: cleanBoolean(body.persist, false),
      actor: typeof body.actor === "string" ? body.actor.slice(0, 80) : "hermes_quote_worker",
      sourceChannel: typeof body.sourceChannel === "string" ? body.sourceChannel.slice(0, 80) : "hermes",
    });
    return NextResponse.json(draft, { status: draft.result.readyToQuote ? 200 : 422 });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "draft_only", error: safeError(error) }, { status: 400 });
  }
}
