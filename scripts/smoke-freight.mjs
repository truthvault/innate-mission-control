#!/usr/bin/env node

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = process.env.SMOKE_FREIGHT_ORIGIN || "https://innatefurniture.co.nz";

async function expectJsonPost() {
  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      productHandle: "custom-crossroads-dining-table",
      tableLengthMm: 2200,
      tableWidthMm: 1000,
      benchCount: 0,
      baseFamily: "asterix_crossroads",
      dryRun: true,
      source: "smoke_test",
      destination: {
        suburb: "Mairehau",
        city: "Christchurch",
        postCode: "8013",
      },
    }),
  });
  const json = await response.json();
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
  const response = await fetch(url, { headers: { Origin: origin } });
  const text = await response.text();
  if (response.status !== 200 || !text.startsWith("innateFreightEstimateSmoke(") || !text.includes('"dryRun":true')) {
    throw new Error(`dining-estimate GET JSONP failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return `dining-estimate GET JSONP: ${response.status}`;
}

async function expectDisallowedOrigin() {
  const response = await fetch(`${baseUrl}/api/freight/dining-estimate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
    },
    body: JSON.stringify({
      productHandle: "custom-crossroads-dining-table",
      tableLengthMm: 2200,
      dryRun: true,
      destination: { suburb: "Mairehau" },
    }),
  });
  const json = await response.json();
  if (response.status !== 400 || json.ok !== false) {
    throw new Error(`dining-estimate disallowed-origin guard failed: ${response.status} ${JSON.stringify(json).slice(0, 240)}`);
  }
  return `dining-estimate disallowed-origin guard: ${response.status}`;
}

const results = [];
results.push(await expectJsonPost());
results.push(await expectJsonpGet());
results.push(await expectDisallowedOrigin());

console.log(`Freight smoke OK (${baseUrl})`);
for (const result of results) console.log(`- ${result}`);
