#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = process.env.SMOKE_FREIGHT_ORIGIN || "https://innatefurniture.co.nz";
const freightToken = process.env.SMOKE_FREIGHT_TOKEN || "";

function withFreightToken(url) {
  if (freightToken) url.searchParams.set("freightToken", freightToken);
  return url;
}

function freightHeaders(extra = {}) {
  return {
    ...extra,
    ...(freightToken ? { "X-Innate-Freight-Token": freightToken } : {}),
  };
}

async function readJson(response, label) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    throw new Error(`${label} returned non-JSON content-type ${contentType}: ${text.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${label} returned invalid JSON: ${err instanceof Error ? err.message : String(err)} ${text.slice(0, 240)}`);
  }
}

function assertControlledErrorPayload(json, label) {
  const text = JSON.stringify(json);
  if (text.includes(" at ") || text.includes(".ts:") || text.includes("node:internal")) {
    throw new Error(`${label} exposed stack-like internals: ${text.slice(0, 240)}`);
  }
}

function baseEstimateBody(overrides = {}) {
  return {
    productHandle: "custom-crossroads-dining-table",
    tableLengthMm: 2200,
    tableWidthMm: 1000,
    benchCount: 0,
    baseFamily: "asterix_crossroads",
    dryRun: true,
    source: "smoke_test",
    internalTestMarker: "stage1_freight_smoke",
    destination: {
      suburb: "Mairehau",
      city: "Christchurch",
      postCode: "8013",
    },
    ...overrides,
  };
}

async function expectAddressAutocompleteJson() {
  const url = new URL(`${baseUrl}/api/freight/address-autocomplete`);
  url.searchParams.set("input", "Mairehau Christchurch");
  const response = await fetch(withFreightToken(url), {
    headers: freightHeaders({ Origin: origin, Accept: "application/json" }),
  });
  const json = await readJson(response, "address-autocomplete allowed-origin");
  if (response.status !== 200 || json.ok !== true || !Array.isArray(json.suggestions)) {
    throw new Error(`address-autocomplete allowed-origin failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return `address-autocomplete allowed-origin JSON: ${response.status}`;
}

async function expectJsonPost() {
  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: freightHeaders({
      "Content-Type": "application/json",
      Origin: origin,
    }),
    body: JSON.stringify(baseEstimateBody()),
  });
  const json = await readJson(response, "dining-estimate POST dry-run");
  if (response.status !== 200 || json.ok !== true || json.dryRun !== true) {
    throw new Error(`dining-estimate POST dry-run failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  if (!Array.isArray(json.packageLines) || json.packageLines.length === 0) {
    throw new Error("dining-estimate POST dry-run returned no package lines");
  }
  return `dining-estimate POST dry-run: ${response.status}`;
}

async function expectJsonpGet() {
  const url = new URL(`${baseUrl}/api/freight/dining-estimate`);
  url.searchParams.set("callback", "innateFreightEstimateSmoke");
  url.searchParams.set("productHandle", "custom-crossroads-dining-table");
  url.searchParams.set("tableLengthMm", "2200");
  url.searchParams.set("tableWidthMm", "1000");
  url.searchParams.set("benchCount", "0");
  url.searchParams.set("baseFamily", "asterix_crossroads");
  url.searchParams.set("dryRun", "true");
  url.searchParams.set("suburb", "Mairehau");
  url.searchParams.set("city", "Christchurch");
  url.searchParams.set("postCode", "8013");
  url.searchParams.set("source", "smoke_test_jsonp");
  url.searchParams.set("internalTest", "stage1_freight_smoke");
  const response = await fetch(withFreightToken(url), { headers: freightHeaders({ Origin: origin }) });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (
    response.status !== 200 ||
    !contentType.includes("application/javascript") ||
    !text.startsWith("innateFreightEstimateSmoke(") ||
    !text.includes('"dryRun":true')
  ) {
    throw new Error(`dining-estimate GET JSONP failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return `dining-estimate GET JSONP: ${response.status}`;
}

async function expectDisallowedOrigin() {
  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: freightHeaders({
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
    }),
    body: JSON.stringify(baseEstimateBody()),
  });
  const json = await readJson(response, "dining-estimate disallowed-origin guard");
  assertControlledErrorPayload(json, "dining-estimate disallowed-origin guard");
  const expectedMessage = "Origin or referer";
  if (response.status !== 400 || json.ok !== false || !JSON.stringify(json).includes(expectedMessage)) {
    throw new Error(`dining-estimate disallowed-origin guard failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return freightToken ? `dining-estimate bad-origin-with-token guard: ${response.status}` : `dining-estimate disallowed-origin guard: ${response.status}`;
}

async function expectNoOriginGuard() {
  const url = new URL(`${baseUrl}/api/freight/dining-estimate`);
  url.searchParams.set("callback", "innateFreightNoOriginSmoke");
  url.searchParams.set("productHandle", "custom-crossroads-dining-table");
  url.searchParams.set("tableLengthMm", "2200");
  url.searchParams.set("dryRun", "true");
  url.searchParams.set("suburb", "Mairehau");
  url.searchParams.set("internalTest", "stage1_freight_smoke");
  const response = await fetch(url);
  const text = await response.text();
  const expectedMessage = "Origin or referer";
  if (response.status !== 400 || !text.includes(expectedMessage) || text.includes(" at ") || text.includes(".ts:")) {
    throw new Error(`dining-estimate no-origin guard failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return `dining-estimate no-origin guard: ${response.status}`;
}

async function expectNoOriginWithTokenGuard() {
  if (!freightToken) return null;

  const url = withFreightToken(new URL(`${baseUrl}/api/freight/dining-estimate`));
  url.searchParams.set("callback", "innateFreightNoOriginWithTokenSmoke");
  url.searchParams.set("productHandle", "custom-crossroads-dining-table");
  url.searchParams.set("tableLengthMm", "2200");
  url.searchParams.set("dryRun", "true");
  url.searchParams.set("suburb", "Mairehau");
  url.searchParams.set("internalTest", "stage2_freight_smoke");
  const response = await fetch(url, { headers: freightHeaders() });
  const text = await response.text();
  if (response.status !== 400 || !text.includes("Origin or referer") || text.includes(" at ") || text.includes(".ts:")) {
    throw new Error(`dining-estimate no-origin-with-token guard failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return `dining-estimate no-origin-with-token guard: ${response.status}`;
}

async function expectAllowedOriginWithoutTokenGuard() {
  if (!freightToken) return null;

  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(baseEstimateBody()),
  });
  const json = await readJson(response, "dining-estimate allowed-origin missing-token guard");
  assertControlledErrorPayload(json, "dining-estimate allowed-origin missing-token guard");
  if (response.status !== 400 || json.ok !== false || !JSON.stringify(json).includes("missing or invalid")) {
    throw new Error(`dining-estimate allowed-origin missing-token guard failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return `dining-estimate allowed-origin missing-token guard: ${response.status}`;
}

async function expectAutocompleteNoOriginGuard() {
  const url = new URL(`${baseUrl}/api/freight/address-autocomplete`);
  url.searchParams.set("input", "Mairehau Christchurch");
  const response = await fetch(url);
  const json = await readJson(response, "address-autocomplete no-origin guard");
  assertControlledErrorPayload(json, "address-autocomplete no-origin guard");
  const expectedMessage = "Origin or referer";
  if (response.status !== 400 || json.ok !== false || !JSON.stringify(json).includes(expectedMessage)) {
    throw new Error(`address-autocomplete no-origin guard failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return `address-autocomplete no-origin guard: ${response.status}`;
}

async function expectInvalidInputControlledError() {
  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: freightHeaders({
      "Content-Type": "application/json",
      Origin: origin,
    }),
    body: JSON.stringify(baseEstimateBody({ tableLengthMm: -1 })),
  });
  const json = await readJson(response, "dining-estimate invalid input");
  assertControlledErrorPayload(json, "dining-estimate invalid input");
  if (response.status !== 400 || json.ok !== false || !JSON.stringify(json).includes("tableLengthMm")) {
    throw new Error(`dining-estimate invalid input guard failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return `dining-estimate invalid input controlled error: ${response.status}`;
}

const results = [];
results.push(await expectAddressAutocompleteJson());
results.push(await expectJsonPost());
results.push(await expectJsonpGet());
results.push(await expectDisallowedOrigin());
results.push(await expectNoOriginGuard());
const noOriginWithToken = await expectNoOriginWithTokenGuard();
if (noOriginWithToken) results.push(noOriginWithToken);
const allowedOriginWithoutToken = await expectAllowedOriginWithoutTokenGuard();
if (allowedOriginWithoutToken) results.push(allowedOriginWithoutToken);
results.push(await expectAutocompleteNoOriginGuard());
results.push(await expectInvalidInputControlledError());

console.log(`Freight smoke OK (${baseUrl})`);
for (const result of results) console.log(`- ${result}`);
