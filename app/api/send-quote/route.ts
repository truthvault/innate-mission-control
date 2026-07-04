import { formatDispatchWeek } from "@/lib/benchtops/dispatchDate";
import { freightCorsHeaders } from "@/lib/freight/publicAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SharePath = "self" | "workshop" | "other";
type ContactMethod = "email" | "phone";
type Customer = { name: string; email: string; phone?: string; notes?: string; additionalEmail?: string; contactMethod?: ContactMethod; bestTimeToCall?: string };
type Recipient = { name: string; email: string; noteToRecipient?: string };
type PayloadPanel = { length: number; width: number; thickness: number; quantity: number; rotationDeg?: 0 | 90; orientation?: string; label?: string; cutouts: Array<{ widthMm: number; depthMm: number; pos: number; cross: number }> };
type SendQuotePayload = {
  path: SharePath;
  honeypot?: string;
  dryRun?: boolean;
  customer: Customer;
  recipient?: Recipient;
  quote: { species: string; finish: string; colour: string; panels: PayloadPanel[] };
  quoteNo: string;
  totals: { grand: number; leadTimeWeeks: number; shipping: { cost: number; label: string } };
  quoteHash: string;
};

const LOGO_URL = "https://innatefurniture.co.nz/cdn/shop/files/Innate_Logo_Concept_1.png?width=360";
const LIMITS = { name: 120, email: 200, phone: 30, notes: 2000, recipNote: 1000, panelLabel: 80, quoteNo: 40, species: 80, shippingLabel: 120, quoteHash: 8000, bestTimeToCall: 200 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hits = new Map<string, number[]>();

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function nzd(n: number) { return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(n); }
function tooLong(s: string | undefined, max: number) { return !!s && s.length > max; }
function isEmail(s: string) { return EMAIL_RE.test(s.trim()); }
function phoneDigits(s: string) { return (s || "").replace(/\D/g, ""); }
function isPhone(s: string) { return phoneDigits(s).length >= 7; }
function colourLabel(c: string) { return c === "bark" ? "Country bark" : c === "darkwash" ? "Darkwash" : "Clear"; }
function finishLabel(f: string) { return f === "oiled" ? "Sanded & oiled" : "Raw"; }
function greetFirstName(name: string) { const first = name.trim().split(/\s+/)[0] || ""; return /\p{L}/u.test(first) ? first : "there"; }

function allow(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 5) { hits.set(ip, arr); return false; }
  arr.push(now); hits.set(ip, arr); return true;
}
function decodeQuoteHash(hash: string): { shipping?: { kind?: string; formattedAddress?: string; destination?: { suburb?: string; city?: string; postCode?: string } } } | null {
  try {
    const b64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as { shipping?: { kind?: string; formattedAddress?: string; destination?: { suburb?: string; city?: string; postCode?: string } } } : null;
  } catch { return null; }
}
function destinationText(payload: SendQuotePayload) {
  const shipping = decodeQuoteHash(payload.quoteHash)?.shipping;
  if (!shipping) return "";
  if (shipping.formattedAddress?.trim()) return shipping.formattedAddress.trim();
  const d = shipping.destination;
  return [d?.suburb, d?.city, d?.postCode].filter(Boolean).join(", ");
}
function validate(payload: SendQuotePayload | null): string | null {
  if (!payload || typeof payload !== "object") return "Invalid payload";
  if (typeof payload.honeypot === "string" && payload.honeypot.trim()) return "Invalid submission";
  if (!["self", "workshop", "other"].includes(payload.path)) return "Invalid path";
  if (!payload.customer?.name?.trim()) return "Name required";
  if (tooLong(payload.customer.name, LIMITS.name)) return "Name too long";
  if (!isEmail(payload.customer?.email || "")) return "Valid email required";
  if (tooLong(payload.customer.email, LIMITS.email)) return "Email too long";
  if (payload.path === "workshop") {
    const method = payload.customer.contactMethod;
    if (method && method !== "email" && method !== "phone") return "Invalid contact method";
    if (method === "phone" && !isPhone(payload.customer.phone || "")) return "A phone number is required when you've asked for a call";
    if (payload.customer.additionalEmail && !isEmail(payload.customer.additionalEmail)) return "Additional email is not valid";
  }
  if (tooLong(payload.customer.phone, LIMITS.phone) || tooLong(payload.customer.notes, LIMITS.notes) || tooLong(payload.customer.bestTimeToCall, LIMITS.bestTimeToCall)) return "Customer details too long";
  if (payload.path === "other") {
    if (!payload.recipient?.name?.trim()) return "Recipient name required";
    if (!isEmail(payload.recipient?.email || "")) return "Valid recipient email required";
    if (tooLong(payload.recipient.noteToRecipient, LIMITS.recipNote)) return "Note too long";
  }
  if (!payload.quoteNo?.trim() || tooLong(payload.quoteNo, LIMITS.quoteNo)) return "Quote number invalid";
  if (!payload.quoteHash?.trim() || tooLong(payload.quoteHash, LIMITS.quoteHash)) return "Quote payload invalid";
  if (!payload.quote?.panels?.length || payload.quote.panels.length > 20) return "Missing panel data";
  if (tooLong(payload.quote.species, LIMITS.species) || tooLong(payload.totals?.shipping?.label, LIMITS.shippingLabel)) return "Quote details invalid";
  for (const panel of payload.quote.panels) if (tooLong(panel.label, LIMITS.panelLabel)) return "Panel label too long";
  return null;
}
function buildShareUrl(request: Request, quoteHash: string) {
  const origin = request.headers.get("origin") || "https://innatefurniture.co.nz";
  return `${origin}/pages/timber-panels#q=${quoteHash}`;
}
function panelRows(q: SendQuotePayload["quote"]) {
  return q.panels.map((p, i) => `${i + 1}. ${p.label || "Panel"} · ${p.length} × ${p.width} × ${p.thickness} mm · qty ${p.quantity}${p.cutouts?.length ? ` · ${p.cutouts.length} cutout${p.cutouts.length > 1 ? "s" : ""}` : ""}`).join("\n");
}
function textBody(payload: SendQuotePayload, shareUrl: string) {
  const dispatchWeek = formatDispatchWeek(new Date(), payload.totals.leadTimeWeeks);
  const destination = destinationText(payload);
  const intro = payload.path === "self" ? `Hi ${greetFirstName(payload.customer.name)},\n\nHere's your benchtop quote from Innate Furniture.` : payload.path === "other" ? `${payload.customer.name} has shared a benchtop quote with you from Innate Furniture.` : `New benchtop lead from ${payload.customer.name}.`;
  return [intro, "", shareUrl, "", `Quote ${payload.quoteNo}`, `Timber: ${payload.quote.species}`, `Finish: ${finishLabel(payload.quote.finish)}`, `Colour: ${colourLabel(payload.quote.colour)}`, "Panels:", panelRows(payload.quote), `Delivery: ${payload.totals.shipping.label}${payload.totals.shipping.cost > 0 ? ` · ${nzd(payload.totals.shipping.cost)}` : ""}`, destination ? `Deliver to: ${destination}` : "", `Dispatch: Estimated ${dispatchWeek}`, `Total: ${nzd(payload.totals.grand)} incl GST`, "", "— Innate Furniture · Ōtautahi Christchurch"].filter(Boolean).join("\n");
}
function htmlBody(payload: SendQuotePayload, shareUrl: string) {
  const dispatchWeek = formatDispatchWeek(new Date(), payload.totals.leadTimeWeeks);
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f5ef;color:#141210;line-height:1.55"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px"><img src="${LOGO_URL}" alt="Innate Furniture" width="180" style="display:block;border:0;height:auto;width:180px;max-width:100%;margin-bottom:12px"><h1 style="font-size:20px">Benchtop quote · ${esc(payload.quoteNo)}</h1><p>${payload.path === "workshop" ? `New benchtop lead from <strong>${esc(payload.customer.name)}</strong>.` : `Hi ${esc(greetFirstName(payload.customer.name))}, here's your benchtop quote.`}</p><p><a href="${esc(shareUrl)}" style="display:inline-block;padding:12px 20px;background:#22201a;color:#f5f3ee;text-decoration:none;border-radius:6px;font-weight:600">Open interactive quote</a></p><table style="width:100%;border-collapse:collapse;font-size:14px"><tr><td>Timber</td><td>${esc(payload.quote.species)}</td></tr><tr><td>Finish</td><td>${esc(finishLabel(payload.quote.finish))}</td></tr><tr><td>Colour</td><td>${esc(colourLabel(payload.quote.colour))}</td></tr><tr><td>Delivery</td><td>${esc(payload.totals.shipping.label)}${payload.totals.shipping.cost > 0 ? ` · ${esc(nzd(payload.totals.shipping.cost))}` : ""}</td></tr><tr><td>Dispatch</td><td>Estimated ${esc(dispatchWeek)}</td></tr><tr><td>Total</td><td><strong>${esc(nzd(payload.totals.grand))} incl GST</strong></td></tr></table><pre style="white-space:pre-wrap;font-family:inherit">${esc(panelRows(payload.quote))}</pre><p style="color:#14121099;font-size:12px">Innate Furniture · 281 Queen Elizabeth II Drive, Christchurch</p></div></body></html>`;
}
function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: freightCorsHeaders(request, "POST, OPTIONS") });
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: freightCorsHeaders(request, "POST, OPTIONS") });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!allow(ip)) return jsonResponse(request, { ok: false, error: "Too many requests" }, 429);
  const payload = await request.json().catch(() => null) as SendQuotePayload | null;
  const err = validate(payload);
  if (err || !payload) return jsonResponse(request, { ok: false, error: err || "Invalid JSON" }, 400);

  const shareUrl = buildShareUrl(request, payload.quoteHash);
  const text = textBody(payload, shareUrl);
  const html = htmlBody(payload, shareUrl);
  if (payload.dryRun || request.headers.get("x-innate-dry-run") === "true") {
    return jsonResponse(request, { ok: true, dryRun: true, subject: subjectLine(payload), textPreview: text.slice(0, 500), htmlBytes: html.length });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME || "Innate Furniture";
  const innate = process.env.INNATE_EMAIL || "hello@innatefurniture.co.nz";
  if (!apiKey || !fromEmail) return jsonResponse(request, { ok: false, error: "Email service not configured" }, 503);

  const primaryTo = payload.path === "self" ? payload.customer.email : payload.path === "workshop" ? innate : payload.recipient!.email;
  const cc = payload.path === "workshop" ? [payload.customer.email, payload.customer.additionalEmail].filter((v): v is string => !!v && v !== innate) : undefined;
  const result = await sendResendEmail(apiKey, { from: `${fromName} <${fromEmail}>`, to: [primaryTo], cc, reply_to: payload.path === "other" ? payload.customer.email : innate, subject: subjectLine(payload), text, html });
  if (!result.ok) return jsonResponse(request, { ok: false, error: result.error || "Email send failed" }, 502);

  if (payload.path !== "workshop") {
    await sendResendEmail(apiKey, { from: `${fromName} <${fromEmail}>`, to: [innate], reply_to: payload.customer.email, subject: workshopSubject(payload), text, html });
  }
  return jsonResponse(request, { ok: true });
}

function subjectLine(payload: SendQuotePayload) {
  const first = payload.quote.panels[0];
  const dim = `${first.length}×${first.width}×${first.thickness}`;
  if (payload.path === "self") return `Your benchtop quote · ${payload.quoteNo}`;
  if (payload.path === "workshop") return `[ACTION] ${payload.quoteNo} · ${payload.quote.species} ${dim} · ${payload.customer.name}`;
  return `${payload.customer.name} shared a benchtop quote with you · ${payload.quoteNo}`;
}
function workshopSubject(payload: SendQuotePayload) {
  const first = payload.quote.panels[0];
  return `[FYI] ${payload.quoteNo} · ${payload.quote.species} ${first.length}×${first.width}×${first.thickness} · ${payload.customer.name}`;
}
async function sendResendEmail(apiKey: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
  return { ok: response.ok && !data.error, error: data.error?.message || data.message };
}
