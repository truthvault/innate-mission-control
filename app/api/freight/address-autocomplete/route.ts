import { assertFreightRequestAllowed, freightCorsHeaders } from "@/lib/freight/publicAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GoogleAutocompletePrediction = {
  place_id?: string;
  description?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  terms?: Array<{ value?: string }>;
  types?: string[];
};

function googlePlacesKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  );
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

function safeCallbackName(value: string | null): string {
  const callback = value || "innateAddressAutocompleteCallback";
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw new Error("callback is not a safe JavaScript function name");
  }
  return callback;
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

function publicPrediction(prediction: GoogleAutocompletePrediction) {
  return {
    placeId: prediction.place_id,
    description: prediction.description,
    mainText: prediction.structured_formatting?.main_text || prediction.terms?.[0]?.value || prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text,
    types: prediction.types || [],
  };
}

async function autocomplete(input: string) {
  const key = googlePlacesKey();
  if (!key) {
    return {
      status: 503,
      body: {
        ok: false,
        reason: "google_places_not_configured",
        message: "Address autocomplete is not configured yet.",
        suggestions: [],
      },
    };
  }

  if (input.trim().length < 3) {
    return { status: 200, body: { ok: true, suggestions: [] } };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", input.trim());
  url.searchParams.set("key", key);
  url.searchParams.set("components", "country:nz");
  url.searchParams.set("language", "en");
  url.searchParams.set("types", "geocode");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    predictions?: GoogleAutocompletePrediction[];
  };

  if (!response.ok || (data.status && !["OK", "ZERO_RESULTS"].includes(data.status))) {
    return {
      status: 502,
      body: {
        ok: false,
        reason: "google_places_autocomplete_failed",
        googleStatus: data.status,
        message: "Address suggestions could not be loaded right now.",
        suggestions: [],
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      suggestions: (data.predictions || []).slice(0, 5).map(publicPrediction),
    },
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = url.searchParams.get("callback");

  try {
    assertFreightRequestAllowed(request, url);
    const result = await autocomplete(url.searchParams.get("input") || "");
    if (callback) return javascriptResponse(safeCallbackName(callback), result.body, result.status);
    return jsonResponse(request, result.body, result.status);
  } catch (err) {
    const body = {
      ok: false,
      reason: "bad_request",
      message: err instanceof Error ? err.message : String(err),
      suggestions: [],
    };
    if (callback) return javascriptResponse("innateAddressAutocompleteCallback", body, 400);
    return jsonResponse(request, body, 400);
  }
}
