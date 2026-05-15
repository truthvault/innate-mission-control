import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  buildDiningFreightPackages,
  roundCustomerFreightEstimate,
  shouldOfferManualFreightCheck,
  type DiningBaseFamily,
} from "@/lib/freight/diningFreightPackages";
import {
  hasMainfreightRateConfig,
  requestMainfreightRate,
  type MainfreightDestinationAddress,
} from "@/lib/freight/mainfreightRate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://innatefurniture.co.nz",
  "https://www.innatefurniture.co.nz",
  "https://innate-furniture.myshopify.com",
]);

const LOG_DIR = path.join(process.cwd(), "data", "freight-estimates");
const LOG_PATH = path.join(LOG_DIR, "quote-events.jsonl");

type EstimateRequestBody = {
  productHandle?: unknown;
  tableLengthMm?: unknown;
  tableWidthMm?: unknown;
  benchCount?: unknown;
  baseFamily?: unknown;
  destination?: unknown;
  dryRun?: unknown;
  pageUrl?: unknown;
  variantId?: unknown;
  variantTitle?: unknown;
  source?: unknown;
};

type EstimateResult = {
  status: number;
  body: Record<string, unknown>;
};

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(request: Request, result: EstimateResult) {
  return Response.json(result.body, {
    status: result.status,
    headers: corsHeaders(request),
  });
}

function javascriptResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function assertAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    throw new Error("Origin is not allowed for freight preview requests");
  }
}

function asPositiveNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return number;
}

function asNonNegativeInteger(value: unknown, field: string): number {
  if (value === undefined || value === null || value === "") return 0;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return number;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBaseFamily(value: unknown): DiningBaseFamily | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "steel_legs" || value === "asterix_crossroads" || value === "tabletop_only") return value;
  throw new Error("baseFamily must be steel_legs, asterix_crossroads, or tabletop_only");
}

function parseDestination(value: unknown): MainfreightDestinationAddress {
  if (!value || typeof value !== "object") {
    throw new Error("destination must be an object with at least suburb");
  }

  const raw = value as Record<string, unknown>;
  return {
    suburb: asString(raw.suburb, "destination.suburb"),
    postCode: optionalString(raw.postCode),
    city: optionalString(raw.city),
    countryCode: "NZ",
  };
}

function isChristchurchDestination(destination: MainfreightDestinationAddress): boolean {
  const haystack = `${destination.city || ""} ${destination.suburb || ""} ${destination.postCode || ""}`.toLowerCase();
  if (haystack.includes("christchurch")) return true;

  const postcode = destination.postCode ? Number(destination.postCode) : NaN;
  return Number.isFinite(postcode) && postcode >= 8000 && postcode <= 8999;
}

function publicPackageLines(lines: ReturnType<typeof buildDiningFreightPackages>["lines"]) {
  return lines.map((line) => ({
    code: line.code,
    description: line.description,
    quantity: line.quantity,
    packType: line.packType,
    lengthMetres: line.lengthMetres,
    widthMetres: line.widthMetres,
    heightMetres: line.heightMetres,
    cubicMetres: line.cubicMetres,
    weightKg: line.weightKg,
  }));
}

async function logQuoteEvent(event: Record<string, unknown>) {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await fs.appendFile(LOG_PATH, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, "utf8");
  } catch (err) {
    console.warn("[freight] quote-event logging failed", err);
  }
}

async function estimateFromBody(body: EstimateRequestBody, request: Request, started: number): Promise<EstimateResult> {
  const productHandle = asString(body.productHandle, "productHandle");
  const tableLengthMm = asPositiveNumber(body.tableLengthMm, "tableLengthMm");
  const tableWidthMm = body.tableWidthMm === undefined ? undefined : asPositiveNumber(body.tableWidthMm, "tableWidthMm");
  const benchCount = asNonNegativeInteger(body.benchCount, "benchCount");
  const baseFamily = parseBaseFamily(body.baseFamily);
  const destination = parseDestination(body.destination);
  const dryRun = body.dryRun === true || body.dryRun === "true";
  const isChristchurch = isChristchurchDestination(destination);
  const requestMeta = {
    productHandle,
    tableLengthMm,
    tableWidthMm,
    benchCount,
    baseFamily,
    destination,
    source: optionalString(body.source),
    pageUrl: optionalString(body.pageUrl),
    variantId: optionalString(body.variantId),
    variantTitle: optionalString(body.variantTitle),
    userAgent: request.headers.get("user-agent") || undefined,
    referer: request.headers.get("referer") || undefined,
  };

  const packageResult = buildDiningFreightPackages({
    productHandle,
    tableLengthMm,
    tableWidthMm,
    benchCount,
    baseFamily,
  });

  if (dryRun) {
    const result = {
      ok: true,
      dryRun: true,
      label: "Dining freight package preview — Mainfreight not called",
      productHandle,
      destination,
      isChristchurch,
      packageLines: publicPackageLines(packageResult.lines),
      totals: packageResult.totals,
      pricingRules: packageResult.pricingRules,
      elapsedMs: Date.now() - started,
    };
    await logQuoteEvent({ ...requestMeta, status: "dry_run", result });
    return { status: 200, body: result };
  }

  if (!hasMainfreightRateConfig()) {
    const result = {
      ok: false,
      reason: "mainfreight_not_configured",
      message: "Freight estimate is not configured yet. Send us your suburb and selected table size and we’ll confirm the best option.",
      productHandle,
      destination,
      packageLines: publicPackageLines(packageResult.lines),
      totals: packageResult.totals,
      elapsedMs: Date.now() - started,
    };
    await logQuoteEvent({ ...requestMeta, status: "mainfreight_not_configured", result });
    return { status: 503, body: result };
  }

  const mainfreight = await requestMainfreightRate({ destination, lines: packageResult.lines });

  if (!mainfreight.ok || mainfreight.totalIncludingGst === undefined) {
    const result = {
      ok: false,
      reason: "mainfreight_rate_failed",
      message: "This address needs a manual freight check. Send us your suburb and selected table size and we’ll confirm the best option.",
      status: mainfreight.status,
      productHandle,
      destination,
      packageLines: publicPackageLines(packageResult.lines),
      totals: packageResult.totals,
      elapsedMs: Date.now() - started,
    };
    await logQuoteEvent({ ...requestMeta, status: "mainfreight_rate_failed", result });
    return { status: 502, body: result };
  }

  const estimateInclGst = roundCustomerFreightEstimate(mainfreight.totalIncludingGst, benchCount, isChristchurch);
  const manualCheckOffered = shouldOfferManualFreightCheck(estimateInclGst);
  const result = {
    ok: true,
    label: "Estimated Mainfreight 2 Home delivery",
    estimateInclGst,
    currency: "NZD",
    caveat: manualCheckOffered
      ? "This estimate is on the higher side, so you can send it to us for a manual freight check before locking anything in."
      : "Final freight is confirmed before your order is locked in.",
    manualCheckOffered,
    rawMainfreightInclGst: mainfreight.totalIncludingGst,
    rawMainfreightExGst: mainfreight.totalExcludingGst,
    isChristchurch,
    productHandle,
    destination,
    packageLines: publicPackageLines(packageResult.lines),
    totals: packageResult.totals,
    elapsedMs: Date.now() - started,
  };
  await logQuoteEvent({ ...requestMeta, status: "estimated", result });
  return { status: 200, body: result };
}

function bodyFromSearchParams(url: URL): EstimateRequestBody {
  const destination = {
    suburb: url.searchParams.get("suburb") || undefined,
    city: url.searchParams.get("city") || undefined,
    postCode: url.searchParams.get("postCode") || undefined,
  };
  return {
    productHandle: url.searchParams.get("productHandle") || undefined,
    tableLengthMm: url.searchParams.get("tableLengthMm") || undefined,
    tableWidthMm: url.searchParams.get("tableWidthMm") || undefined,
    benchCount: url.searchParams.get("benchCount") || undefined,
    baseFamily: url.searchParams.get("baseFamily") || undefined,
    dryRun: url.searchParams.get("dryRun") || undefined,
    pageUrl: url.searchParams.get("pageUrl") || undefined,
    variantId: url.searchParams.get("variantId") || undefined,
    variantTitle: url.searchParams.get("variantTitle") || undefined,
    source: url.searchParams.get("source") || "shopify_theme_jsonp",
    destination,
  };
}

function safeCallbackName(value: string | null): string {
  const callback = value || "innateFreightEstimateCallback";
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw new Error("callback is not a safe JavaScript function name");
  }
  return callback;
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const started = Date.now();

  try {
    assertAllowedOrigin(request);
    const body = (await request.json()) as EstimateRequestBody;
    return jsonResponse(request, await estimateFromBody(body, request, started));
  } catch (err) {
    return jsonResponse(request, {
      status: 400,
      body: {
        ok: false,
        reason: "bad_request",
        error: err instanceof Error ? err.message : String(err),
        elapsedMs: Date.now() - started,
      },
    });
  }
}

export async function GET(request: Request) {
  const started = Date.now();

  try {
    const url = new URL(request.url);
    const callback = safeCallbackName(url.searchParams.get("callback"));
    const result = await estimateFromBody(bodyFromSearchParams(url), request, started);
    return javascriptResponse(`${callback}(${JSON.stringify(result.body)});`, result.status);
  } catch (err) {
    const callback = "innateFreightEstimateCallback";
    const body = {
      ok: false,
      reason: "bad_request",
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - started,
    };
    return javascriptResponse(`${callback}(${JSON.stringify(body)});`, 400);
  }
}
