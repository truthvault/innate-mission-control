import { assertFreightRequestAllowed, freightCorsHeaders } from "@/lib/freight/publicAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GooglePrediction = {
  place_id?: string;
  description?: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};

function googlePlacesKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

function publicPrediction(prediction: GooglePrediction) {
  return {
    id: prediction.place_id,
    text: prediction.description,
    mainText: prediction.structured_formatting?.main_text || prediction.description,
    secondaryText: prediction.structured_formatting?.secondary_text || "",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    assertFreightRequestAllowed(request, url);
    const q = (url.searchParams.get("q") || url.searchParams.get("input") || "").trim();
    if (q.length < 3) return jsonResponse(request, { predictions: [] });
    const key = googlePlacesKey();
    if (!key) return jsonResponse(request, { error: "Address search not configured", predictions: [] }, 503);

    const params = new URLSearchParams({ input: q, components: "country:nz", key, types: "geocode" });
    const session = url.searchParams.get("session") || url.searchParams.get("sessiontoken");
    if (session) params.set("sessiontoken", session);
    const google = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, { cache: "no-store" });
    const data = (await google.json()) as { status?: string; error_message?: string; predictions?: GooglePrediction[] };
    if (!google.ok || (data.status && !["OK", "ZERO_RESULTS"].includes(data.status))) {
      return jsonResponse(request, { error: data.error_message || data.status || "Autocomplete failed", predictions: [] }, 502);
    }
    return jsonResponse(request, { predictions: (data.predictions || []).slice(0, 5).map(publicPrediction) });
  } catch (err) {
    return jsonResponse(request, { error: err instanceof Error ? err.message : "Autocomplete failed", predictions: [] }, 400);
  }
}
