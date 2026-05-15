export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ORIGINS = new Set([
  "https://innatefurniture.co.nz",
  "https://www.innatefurniture.co.nz",
  "https://innate-furniture.myshopify.com",
]);

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GooglePlaceDetailsResult = {
  place_id?: string;
  formatted_address?: string;
  address_components?: AddressComponent[];
};

function googlePlacesKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  );
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function safeCallbackName(value: string | null): string {
  const callback = value || "innateAddressDetailsCallback";
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw new Error("callback is not a safe JavaScript function name");
  }
  return callback;
}

function javascriptResponse(callback: string, body: Record<string, unknown>, status = 200) {
  return new Response(`${callback}(${JSON.stringify(body)});`, {
    status,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

function component(components: AddressComponent[], type: string) {
  return components.find((item) => item.types?.includes(type));
}

function parseDestination(result: GooglePlaceDetailsResult) {
  const components = result.address_components || [];
  const streetNumber = component(components, "street_number")?.long_name;
  const route = component(components, "route")?.long_name;
  const sublocality =
    component(components, "sublocality") ||
    component(components, "sublocality_level_1") ||
    component(components, "neighborhood");
  const locality = component(components, "locality") || component(components, "postal_town");
  const adminArea = component(components, "administrative_area_level_1");
  const postalCode = component(components, "postal_code")?.long_name;

  const street = [streetNumber, route].filter(Boolean).join(" ");
  const suburb = sublocality?.long_name || locality?.long_name || result.formatted_address || "";
  const city = locality?.long_name || adminArea?.long_name || suburb;

  return {
    formattedAddress: result.formatted_address,
    street,
    suburb,
    city,
    postCode: postalCode || "",
    countryCode: "NZ",
  };
}

async function placeDetails(placeId: string) {
  const key = googlePlacesKey();
  if (!key) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: "google_places_not_configured",
        message: "Address autocomplete is not configured yet.",
      },
    };
  }

  if (!placeId.trim()) {
    return { status: 400, body: { ok: false, reason: "missing_place_id", message: "placeId is required" } };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId.trim());
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");
  url.searchParams.set("fields", "place_id,formatted_address,address_components");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    result?: GooglePlaceDetailsResult;
  };

  if (!response.ok || data.status !== "OK" || !data.result) {
    return {
      status: 502,
      body: {
        ok: false,
        reason: "google_place_details_failed",
        googleStatus: data.status,
        message: "Selected address could not be loaded right now.",
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      placeId: data.result.place_id,
      destination: parseDestination(data.result),
    },
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback");

  try {
    const result = await placeDetails(url.searchParams.get("placeId") || "");
    if (callback) return javascriptResponse(safeCallbackName(callback), result.body, result.status);
    return jsonResponse(request, result.body, result.status);
  } catch (err) {
    const body = {
      ok: false,
      reason: "bad_request",
      message: err instanceof Error ? err.message : String(err),
    };
    if (callback) return javascriptResponse("innateAddressDetailsCallback", body, 400);
    return jsonResponse(request, body, 400);
  }
}
