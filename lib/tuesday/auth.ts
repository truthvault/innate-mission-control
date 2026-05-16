export const AUTH_COOKIE_NAME = "innate-auth";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function sessionSecret() {
  return process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD || "";
}

export async function createAuthCookieValue(now = Date.now()) {
  const secret = sessionSecret();
  if (!secret) throw new Error("Auth secret is not configured");
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

export async function isValidAuthCookie(value: string | undefined | null, now = Date.now()) {
  if (!value) return false;
  const secret = sessionSecret();
  if (!secret) return false;
  const [version, expiresAtRaw, signature] = value.split(".");
  if (version !== "v1" || !expiresAtRaw || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = await hmac(`v1.${expiresAtRaw}`, secret);
  return signature === expected;
}

export const AUTH_COOKIE_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;
