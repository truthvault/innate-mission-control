#!/usr/bin/env node

const helper = await import("../lib/freight/publicAccess.ts");

const {
  assertFreightPublicAccess,
  assertFreightRequestAllowed,
  getFreightPublicAccessStatus,
} = helper;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function request(origin, extraHeaders = {}) {
  return new Request("https://innate-mission-control.test/api/freight/dining-estimate", {
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...extraHeaders,
    },
  });
}

function expectPass(label, fn) {
  try {
    fn();
    return `${label}: pass`;
  } catch (err) {
    throw new Error(`${label}: expected pass, got ${err instanceof Error ? err.message : String(err)}`);
  }
}

function expectFail(label, fn, expectedText) {
  try {
    fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert(message.includes(expectedText), `${label}: wrong error "${message}"`);
    return `${label}: rejected`;
  }
  throw new Error(`${label}: expected rejection`);
}

const previousToken = process.env.FREIGHT_PUBLIC_ACCESS_TOKEN;
const previousRequestToken = process.env.FREIGHT_PUBLIC_REQUEST_TOKEN;
const previousRateLimitDisabled = process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED;
const previousRateLimitMax = process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX;

try {
  delete process.env.FREIGHT_PUBLIC_ACCESS_TOKEN;
  delete process.env.FREIGHT_PUBLIC_REQUEST_TOKEN;
  delete process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED;
  delete process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX;

  const status = getFreightPublicAccessStatus();
  assert(Array.isArray(status.allowedOrigins), "allowedOrigins is not an array");
  assert(!status.allowedOrigins.includes("*"), "freight public allowlist must not contain *");
  assert(status.allowedOrigins.includes("https://innatefurniture.co.nz"), "production origin missing");
  assert(status.allowedOrigins.includes("https://www.innatefurniture.co.nz"), "www production origin missing");
  assert(status.allowedOrigins.includes("https://innate-furniture.myshopify.com"), "myshopify origin missing");

  const results = [];
  results.push(expectPass("production Origin", () => assertFreightPublicAccess(request("https://innatefurniture.co.nz"))));
  results.push(expectPass("www Origin", () => assertFreightPublicAccess(request("https://www.innatefurniture.co.nz"))));
  results.push(expectPass("myshopify Origin", () => assertFreightPublicAccess(request("https://innate-furniture.myshopify.com"))));
  results.push(expectPass("allowed Referer fallback", () =>
    assertFreightPublicAccess(request(undefined, { Referer: "https://innatefurniture.co.nz/products/custom-crossroads-dining-table" })),
  ));
  results.push(expectFail("random Origin", () => assertFreightPublicAccess(request("https://example.invalid")), "Origin or referer"));
  results.push(expectFail("missing Origin", () => assertFreightPublicAccess(request(undefined)), "Origin or referer"));

  process.env.FREIGHT_PUBLIC_ACCESS_TOKEN = "stage1-public-token";
  results.push(expectFail("token mode rejects missing token", () =>
    assertFreightPublicAccess(request("https://innatefurniture.co.nz")),
  "missing or invalid"));
  results.push(expectPass("token mode accepts header token", () =>
    assertFreightPublicAccess(request("https://innatefurniture.co.nz", { "X-Innate-Freight-Token": "stage1-public-token" })),
  ));
  results.push(expectPass("token mode accepts query token", () =>
    assertFreightPublicAccess(
      request("https://innatefurniture.co.nz"),
      new URL("https://innate-mission-control.test/api/freight/dining-estimate?freightToken=stage1-public-token"),
    ),
  ));
  results.push(expectFail("token mode rejects valid token from random Origin", () =>
    assertFreightPublicAccess(request("https://example.invalid", { "X-Innate-Freight-Token": "stage1-public-token" })),
  "Origin or referer"));
  results.push(expectFail("token mode rejects valid token with missing Origin", () =>
    assertFreightPublicAccess(request(undefined, { "X-Innate-Freight-Token": "stage1-public-token" })),
  "Origin or referer"));
  results.push(expectFail("token mode rejects wrong token", () =>
    assertFreightPublicAccess(request("https://innatefurniture.co.nz", { "X-Innate-Freight-Token": "wrong" })),
  "missing or invalid"));

  process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX = "1";
  results.push(expectPass("rate guard accepts first allowed request", () =>
    assertFreightRequestAllowed(request("https://innatefurniture.co.nz", {
      "X-Innate-Freight-Token": "stage1-public-token",
      "X-Forwarded-For": "203.0.113.42",
    })),
  ));
  results.push(expectFail("rate guard rejects second request for same client", () =>
    assertFreightRequestAllowed(request("https://innatefurniture.co.nz", {
      "X-Innate-Freight-Token": "stage1-public-token",
      "X-Forwarded-For": "203.0.113.42",
    })),
  "rate limit exceeded"));

  console.log("Freight public access check OK");
  for (const result of results) console.log(`- ${result}`);
} finally {
  if (previousToken === undefined) delete process.env.FREIGHT_PUBLIC_ACCESS_TOKEN;
  else process.env.FREIGHT_PUBLIC_ACCESS_TOKEN = previousToken;

  if (previousRequestToken === undefined) delete process.env.FREIGHT_PUBLIC_REQUEST_TOKEN;
  else process.env.FREIGHT_PUBLIC_REQUEST_TOKEN = previousRequestToken;

  if (previousRateLimitDisabled === undefined) delete process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED;
  else process.env.FREIGHT_PUBLIC_RATE_LIMIT_DISABLED = previousRateLimitDisabled;

  if (previousRateLimitMax === undefined) delete process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX;
  else process.env.FREIGHT_PUBLIC_RATE_LIMIT_MAX = previousRateLimitMax;
}
