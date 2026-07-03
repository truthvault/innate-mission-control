import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const AUTH_COOKIE_NAME = "innate-auth";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createAuthCookieValue(now = Date.now()) {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD || "";
  if (!secret) throw new Error("AUTH_SESSION_SECRET or SITE_PASSWORD is required to call the protected app endpoint.");
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = base64Url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${signature}`;
}

function endpointUrl() {
  const base = process.env.ORDER_INTAKE_BASE_URL || process.env.TUESDAY_BASE_URL || process.argv[2];
  if (!base) throw new Error("Set ORDER_INTAKE_BASE_URL to the Tuesday app URL, or pass the base URL as the first argument.");
  return new URL("/api/production/order-intake/reconcile", base).toString();
}

loadLocalEnv();

const url = endpointUrl();
const response = await fetch(url, {
  method: "POST",
  headers: {
    Accept: "application/json",
    Cookie: `${AUTH_COOKIE_NAME}=${createAuthCookieValue()}`,
  },
});
const bodyText = await response.text();
let body;
try {
  body = bodyText ? JSON.parse(bodyText) : {};
} catch {
  body = { raw: bodyText.slice(0, 500) };
}
const summary = {
  ok: response.ok && body.ok !== false,
  status: response.status,
  scanned: body.scanned ?? null,
  accepted: body.accepted ?? null,
  ignored: body.ignored ?? null,
  createdOrUpdated: body.createdOrUpdated ?? null,
  intakeItems: Array.isArray(body.items) ? body.items.length : null,
  warnings: Array.isArray(body.warnings) ? body.warnings.length : null,
  error: body.error || null,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exit(1);
