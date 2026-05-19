import { sendEnquiryEmails } from "@/lib/freight/enquiryEmails";
import { assertFreightRequestAllowed, freightCorsHeaders } from "@/lib/freight/publicAccess";
import { writeQuoteEvent } from "@/lib/freight/quoteLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EnquiryRequestBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  preferredContact?: unknown;
  productHandle?: unknown;
  productTitle?: unknown;
  variantId?: unknown;
  variantTitle?: unknown;
  tableLengthMm?: unknown;
  tableWidthMm?: unknown;
  benchCount?: unknown;
  addressEntered?: unknown;
  destination?: unknown;
  estimate?: unknown;
  pageUrl?: unknown;
  source?: unknown;
};

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "GET, POST, OPTIONS") });
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

function safeCallbackName(value: string | null): string {
  const callback = value || "innateDiningEnquiryCallback";
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)) {
    throw new Error("callback is not a safe JavaScript function name");
  }
  return callback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function parseDestination(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    suburb: optionalString(raw.suburb),
    city: optionalString(raw.city),
    postCode: optionalString(raw.postCode),
    countryCode: "NZ",
    formattedAddress: optionalString(raw.formattedAddress),
  };
}

function dollars(value: unknown): string | undefined {
  const amount = optionalNumber(value);
  if (amount === undefined) return undefined;
  return `$${amount.toLocaleString("en-NZ", { maximumFractionDigits: 0 })}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function bodyFromSearchParams(url: URL): EnquiryRequestBody {
  return {
    name: url.searchParams.get("name") || undefined,
    email: url.searchParams.get("email") || undefined,
    phone: url.searchParams.get("phone") || undefined,
    message: url.searchParams.get("message") || undefined,
    preferredContact: url.searchParams.get("preferredContact") || undefined,
    productHandle: url.searchParams.get("productHandle") || undefined,
    productTitle: url.searchParams.get("productTitle") || undefined,
    variantId: url.searchParams.get("variantId") || undefined,
    variantTitle: url.searchParams.get("variantTitle") || undefined,
    tableLengthMm: url.searchParams.get("tableLengthMm") || undefined,
    tableWidthMm: url.searchParams.get("tableWidthMm") || undefined,
    benchCount: url.searchParams.get("benchCount") || undefined,
    addressEntered: url.searchParams.get("addressEntered") || undefined,
    pageUrl: url.searchParams.get("pageUrl") || undefined,
    source: url.searchParams.get("source") || "shopify_dining_enquiry_jsonp",
    destination: {
      suburb: url.searchParams.get("suburb") || undefined,
      city: url.searchParams.get("city") || undefined,
      postCode: url.searchParams.get("postCode") || undefined,
      formattedAddress: url.searchParams.get("formattedAddress") || undefined,
    },
    estimate: {
      estimateInclGst: optionalNumber(url.searchParams.get("estimateInclGst")),
      currency: url.searchParams.get("currency") || "NZD",
      caveat: url.searchParams.get("caveat") || undefined,
      manualCheckOffered: url.searchParams.get("manualCheckOffered") === "true",
      label: url.searchParams.get("estimateLabel") || undefined,
    },
  };
}

async function submitEnquiry(body: EnquiryRequestBody, request: Request) {
  const name = requiredString(body.name, "name");
  const email = optionalString(body.email);
  const phone = optionalString(body.phone);
  if (!email && !phone) throw new Error("email or phone is required");

  const destination = parseDestination(body.destination);
  const estimate = body.estimate && typeof body.estimate === "object" ? (body.estimate as Record<string, unknown>) : {};
  const result = {
    ok: true,
    enquirySubmitted: true,
    contact: {
      name,
      email,
      phone,
      preferredContact: optionalString(body.preferredContact),
      message: optionalString(body.message),
    },
    productTitle: optionalString(body.productTitle),
    estimateInclGst: optionalNumber(estimate.estimateInclGst),
    currency: optionalString(estimate.currency) || "NZD",
    caveat: optionalString(estimate.caveat),
    manualCheckOffered: estimate.manualCheckOffered === true,
    label: optionalString(estimate.label) || "Dining table freight enquiry",
  };

  const logResult = await writeQuoteEvent({
    // Keep Status inside the existing Airtable single-select values so the
    // storefront submit cannot fail because of a new schema option.
    status: "estimated",
    productHandle: requiredString(body.productHandle, "productHandle"),
    tableLengthMm: optionalNumber(body.tableLengthMm),
    tableWidthMm: optionalNumber(body.tableWidthMm),
    benchCount: optionalNumber(body.benchCount),
    destination,
    addressEntered: optionalString(body.addressEntered) || destination.formattedAddress,
    source: optionalString(body.source) || "shopify_dining_enquiry",
    pageUrl: optionalString(body.pageUrl),
    variantId: optionalString(body.variantId),
    variantTitle: optionalString(body.variantTitle),
    userAgent: request.headers.get("user-agent") || undefined,
    referer: request.headers.get("referer") || undefined,
    result,
  });

  if (!logResult.ok && !logResult.skipped) {
    throw new Error(logResult.skipped ? `logging skipped: ${logResult.reason}` : "logging failed");
  }

  const estimateText = dollars(result.estimateInclGst);
  const selectedOptions = optionalString(body.variantTitle) || "Selected dining table options";
  const deliveryAddress = optionalString(body.addressEntered) || destination.formattedAddress || [destination.suburb, destination.city, destination.postCode].filter(Boolean).join(", ");
  const productTitle = optionalString(body.productTitle) || "your dining table";
  const source = optionalString(body.source) || "shopify_dining_enquiry";
  const pageUrl = optionalString(body.pageUrl);
  const estimateLabel = estimateText ? `${estimateText} estimated freight` : "Freight not checked yet";

  const emailResult = await sendEnquiryEmails({
    logId: logResult.ok ? logResult.id : undefined,
    name,
    email,
    phone,
    preferredContact: optionalString(body.preferredContact),
    message: optionalString(body.message),
    productTitle,
    selectedOptions,
    deliveryAddress: deliveryAddress || "Not supplied",
    estimateText: estimateLabel,
    pageUrl,
    source,
  });

  return {
    ok: true,
    mode: emailResult.mode === "live" ? "live_email_mode" : emailResult.mode === "test_to_guido" ? "preview_test_email_mode" : "preview_log_only",
    message: "Thanks — we’ve got your table enquiry.",
    submessage: "We’ll check the details and come back with the best next step. No order or payment has been placed.",
    logId: logResult.ok ? logResult.id : undefined,
    customerEmailSent: emailResult.customer.sent,
    internalEmailSent: emailResult.internal.sent,
    email: emailResult,
    logging: logResult.ok ? { ok: true, store: logResult.store, id: logResult.id } : { ok: false, skipped: true, reason: logResult.reason },
    confirmation: {
      heading: "Thanks — we’ve got your table enquiry.",
      intro: `Thanks ${firstName(name)}. We’ll check the freight/details and come back to you shortly.`,
      productTitle,
      selectedOptions,
      deliveryAddress: deliveryAddress || "Not supplied",
      estimate: estimateLabel,
      nextStep: "We’ll confirm the best freight option, timing, and any details before anything goes ahead.",
      note: emailResult.mode === "test_to_guido" ? "Preview mode: test emails are sent only to the configured test recipient." : emailResult.mode === "live" ? "We’ve sent a copy of this enquiry to Innate. If you entered an email address, you’ll also receive a copy." : "This has been logged for Innate review. Customer-facing confirmation emails are not enabled yet.",
    },
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "GET, POST, OPTIONS") });
}

export async function POST(request: Request) {
  try {
    assertFreightRequestAllowed(request);
    const body = (await request.json()) as EnquiryRequestBody;
    return jsonResponse(request, await submitEnquiry(body, request));
  } catch (err) {
    return jsonResponse(request, { ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callback = safeCallbackName(url.searchParams.get("callback"));
  try {
    assertFreightRequestAllowed(request, url);
    const result = await submitEnquiry(bodyFromSearchParams(url), request);
    return javascriptResponse(`${callback}(${JSON.stringify(result)});`);
  } catch (err) {
    return javascriptResponse(`${callback}(${JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })});`);
  }
}
