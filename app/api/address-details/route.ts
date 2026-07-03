import { assertFreightRequestAllowed, freightCorsHeaders } from "@/lib/freight/publicAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AddressComponent = { long_name?: string; short_name?: string; types?: string[] };
type GoogleDetailsResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: AddressComponent[];
};

function googlePlacesKey() {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
}

function component(components: AddressComponent[], type: string) {
  return components.find((item) => item.types?.includes(type));
}

function destinationFromComponents(components: AddressComponent[] = []) {
  const suburb = component(components, "sublocality")?.long_name || component(components, "sublocality_level_1")?.long_name || component(components, "locality")?.long_name || component(components, "postal_town")?.long_name || "";
  const city = component(components, "locality")?.long_name || component(components, "administrative_area_level_2")?.long_name || suburb;
  const postCode = component(components, "postal_code")?.long_name || "";
  return { suburb, city, postCode, countryCode: "NZ" as const };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "GET, OPTIONS") });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    assertFreightRequestAllowed(request, url);
    const placeId = url.searchParams.get("place_id") || url.searchParams.get("placeId") || "";
    if (!placeId) return jsonResponse(request, { error: "place_id required" }, 400);
    const key = googlePlacesKey();
    if (!key) return jsonResponse(request, { error: "Address lookup not configured" }, 503);
    const params = new URLSearchParams({ place_id: placeId, fields: "geometry,formatted_address,address_components", key });
    const session = url.searchParams.get("session") || url.searchParams.get("sessiontoken");
    if (session) params.set("sessiontoken", session);
    const google = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, { cache: "no-store" });
    const data = (await google.json()) as { status?: string; error_message?: string; result?: GoogleDetailsResult };
    const loc = data.result?.geometry?.location;
    if (!google.ok || data.status !== "OK" || loc?.lat == null || loc?.lng == null) {
      return jsonResponse(request, { error: data.error_message || data.status || "Lookup failed" }, 502);
    }
    return jsonResponse(request, {
      lat: loc.lat,
      lng: loc.lng,
      formatted: data.result?.formatted_address || "",
      destination: destinationFromComponents(data.result?.address_components || []),
    });
  } catch (err) {
    return jsonResponse(request, { error: err instanceof Error ? err.message : "Lookup failed" }, 400);
  }
}
