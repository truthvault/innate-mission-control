import {
  BENCHTOP_FREIGHT_PRICING_RULES,
  buildBenchtopFreightPackages,
  roundCustomerFreightEstimate,
  shouldOfferManualFreightCheck,
  type BenchtopPanelInput,
} from "@/lib/benchtops/benchtopFreightPackages";
import {
  hasMainfreightRateConfig,
  requestMainfreightRate,
  type MainfreightDestinationAddress,
} from "@/lib/freight/mainfreightRate";
import { assertFreightRequestAllowed, freightCorsHeaders } from "@/lib/freight/publicAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EstimateBody = {
  panels?: unknown;
  destination?: unknown;
  dryRun?: unknown;
  formattedAddress?: unknown;
  source?: unknown;
};

const PINPOINT_LOCAL_DELIVERY_AREAS = [
  { area: "Area 4", label: "Outer Canterbury local delivery", customerPriceInclGst: 290, places: ["rakaia", "methven", "hororata", "darfield", "sheffield", "oxford", "amberley"] },
  { area: "Area 3", label: "Canterbury local delivery", customerPriceInclGst: 210, places: ["diamond harbour", "southbridge", "south bridge", "leeston", "west melton", "kirwee", "cust", "leithfield"] },
  { area: "Area 2", label: "Greater Christchurch local delivery", customerPriceInclGst: 170, places: ["lyttelton", "lyttleton", "corsair bay", "corsia bay", "cass bay", "rapaki", "governors bay", "governers bay", "tai tapu", "lincoln", "rolleston", "ohoka", "rangiora", "pegasus", "kaiapoi"] },
] as const;
const PINPOINT_CHRISTCHURCH_METRO = { area: "Area 1", label: "Christchurch metro local delivery", customerPriceInclGst: 150 } as const;

function normaliseLocation(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function getPinpointLocalDelivery(destination: MainfreightDestinationAddress) {
  const haystack = normaliseLocation(`${destination.suburb || ""} ${destination.city || ""} ${destination.postCode || ""}`);
  for (const localArea of PINPOINT_LOCAL_DELIVERY_AREAS) {
    if (localArea.places.some((place) => haystack.includes(normaliseLocation(place)))) return localArea;
  }
  const postcode = destination.postCode ? Number(destination.postCode) : NaN;
  if (haystack.includes("christchurch") || (Number.isFinite(postcode) && postcode >= 8000 && postcode <= 8099)) return PINPOINT_CHRISTCHURCH_METRO;
  return undefined;
}

function asObject(value: unknown, field = "value"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function parseDestination(value: unknown): MainfreightDestinationAddress {
  const obj = asObject(value, "destination");
  const suburb = typeof obj.suburb === "string" ? obj.suburb.trim() : "";
  const city = typeof obj.city === "string" ? obj.city.trim() : "";
  const postCode = typeof obj.postCode === "string" ? obj.postCode.trim() : "";
  if (!suburb && !city && !postCode) throw new Error("destination suburb, city, or postCode is required");
  return { suburb: suburb || city, city: city || suburb, postCode: postCode || undefined, countryCode: "NZ" };
}

function parsePanels(value: unknown): BenchtopPanelInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("panels must be a non-empty array");
  return value.map((raw) => {
    const obj = asObject(raw, "panel");
    return {
      length: Number(obj.length),
      width: Number(obj.width),
      thickness: obj.thickness === undefined ? undefined : Number(obj.thickness),
      quantity: obj.quantity === undefined ? 1 : Number(obj.quantity),
    };
  });
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "POST, OPTIONS") });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "POST, OPTIONS") });
}

export async function POST(request: Request) {
  try {
    assertFreightRequestAllowed(request);
    const body = (await request.json()) as EstimateBody;
    const destination = parseDestination(body.destination);
    const panels = parsePanels(body.panels);
    const dryRun = body.dryRun === true;
    const packages = buildBenchtopFreightPackages(panels);
    const local = getPinpointLocalDelivery(destination);

    if (local) {
      const estimateInclGst = Math.max(BENCHTOP_FREIGHT_PRICING_RULES.minimumDeliveryInclGst, local.customerPriceInclGst);
      return jsonResponse(request, {
        ok: true,
        source: "pinpoint-local",
        label: local.label,
        estimateInclGst,
        currency: "NZD",
        manualCheckOffered: shouldOfferManualFreightCheck(estimateInclGst),
        destination,
        packageLines: packages.lines,
        packageTotals: packages.totals,
        pricingRules: packages.pricingRules,
        notes: packages.notes,
      });
    }

    if (dryRun || !hasMainfreightRateConfig()) {
      return jsonResponse(request, {
        ok: dryRun,
        source: "mainfreight-dry-run",
        label: "Mainfreight 2 Home estimate",
        estimateInclGst: null,
        currency: "NZD",
        manualCheckOffered: false,
        destination,
        packageLines: packages.lines,
        packageTotals: packages.totals,
        pricingRules: packages.pricingRules,
        notes: [...packages.notes, dryRun ? "Dry run only: package mapping shown without calling Mainfreight." : "MAINFREIGHT_RATE_API_KEY is not configured for this deployment."],
      }, dryRun ? 200 : 503);
    }

    const rate = await requestMainfreightRate({ destination, lines: packages.lines });
    if (!rate.ok || rate.totalIncludingGst === undefined) {
      return jsonResponse(request, { ok: false, error: "Mainfreight rate unavailable", status: rate.status, destination, packageLines: packages.lines, packageTotals: packages.totals }, 502);
    }

    const estimateInclGst = roundCustomerFreightEstimate(rate.totalIncludingGst, false);
    return jsonResponse(request, {
      ok: true,
      source: "mainfreight-m2h",
      label: "Estimated Mainfreight 2 Home delivery",
      estimateInclGst,
      currency: "NZD",
      rawMainfreightInclGst: rate.totalIncludingGst,
      rawMainfreightExGst: rate.totalExcludingGst,
      manualCheckOffered: shouldOfferManualFreightCheck(estimateInclGst),
      minimumApplied: estimateInclGst === BENCHTOP_FREIGHT_PRICING_RULES.minimumDeliveryInclGst,
      destination,
      packageLines: packages.lines,
      packageTotals: packages.totals,
      pricingRules: packages.pricingRules,
    });
  } catch (err) {
    return jsonResponse(request, { ok: false, error: err instanceof Error ? err.message : "Invalid freight request" }, 400);
  }
}
