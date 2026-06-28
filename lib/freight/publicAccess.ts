const ALLOWED_ORIGINS = new Set([
  "https://innatefurniture.co.nz",
  "https://www.innatefurniture.co.nz",
  "https://innate-furniture.myshopify.com",
]);

const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX = 90;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function freightCorsHeaders(request: Request, methods: string): HeadersInit {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, X-Innate-Freight-Token",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function requestOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  const referer = request.headers.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function isAllowedStorefrontRequest(request: Request): boolean {
  const origin = requestOrigin(request);
  return Boolean(origin && ALLOWED_ORIGINS.has(origin));
}

function configuredPublicToken() {
  return process.env.FREIGHT_PUBLIC_ACCESS_TOKEN || process.env.FREIGHT_PUBLIC_REQUEST_TOKEN || "";
}

function requestToken(request: Request, url: URL) {
  return request.headers.get("x-innate-freight-token") || url.searchParams.get("freightToken") || url.searchParams.get("freight_token") || "";
}

function timingSafeEqualText(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export function assertFreightPublicAccess(request: Request, url = new URL(request.url)) {
  const expectedToken = configuredPublicToken();
  const suppliedToken = requestToken(request, url);
  const tokenOk = expectedToken ? timingSafeEqualText(suppliedToken, expectedToken) : false;
  const storefrontOk = isAllowedStorefrontRequest(request);

  if (expectedToken) {
    if (!storefrontOk) throw new Error("Origin or referer is not allowed for freight requests");
    if (!tokenOk) throw new Error("Freight request token is missing or invalid");
    return;
  }

  // Backwards-compatible fallback for preview/local work before the website theme
  // carries the public token. Production should set FREIGHT_PUBLIC_ACCESS_TOKEN.
  if (!storefrontOk) {
    throw new Error("Origin or referer is not allowed for freight requests");
  }
}

function clientKeyFromRequest(request: Request) {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const origin = requestOrigin(request) || "unknown-origin";
  return cfIp || realIp || forwardedFor || origin;
}

function rateLimitMax() {
  const value = Number(process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 600) : DEFAULT_RATE_LIMIT_MAX;
}

export function assertFreightRateLimit(request: Request) {
  if (process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED === "true") return;

  const now = Date.now();
  const key = clientKeyFromRequest(request);
  const existing = rateBuckets.get(key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + DEFAULT_RATE_LIMIT_WINDOW_MS };
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  // Opportunistic cleanup for long-running local/server processes.
  if (rateBuckets.size > 1000) {
    for (const [bucketKey, value] of Array.from(rateBuckets.entries())) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  if (bucket.count > rateLimitMax()) throw new Error("Freight request rate limit exceeded");
}

export function assertFreightRequestAllowed(request: Request, url = new URL(request.url)) {
  assertFreightPublicAccess(request, url);
  assertFreightRateLimit(request);
}

export function getFreightPublicAccessStatus() {
  return {
    tokenConfigured: Boolean(configuredPublicToken()),
    rateLimitEnabled: process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED !== "true",
    allowedOrigins: Array.from(ALLOWED_ORIGINS),
  };
}
