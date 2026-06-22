import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const scriptPath = "scripts/lead-to-quote-control-strip.mjs";
const source = fs.readFileSync(scriptPath, "utf8");

const forbiddenWritePatterns = [
  /method:\s*["'`](POST|PATCH|PUT|DELETE)["'`]/,
  /\.(insert|upsert|delete)\s*\(/,
  /supabase\.[\w.]*update\s*\(/,
  /\bfetch\([^)]*\bmethod\s*:\s*["'`](POST|PATCH|PUT|DELETE)["'`]/s,
  /\b(create|update|send|approve)(?:Xero|Gmail|Monday|Shopify|Supabase|Drive)/,
  /createOrSendXeroQuote:\s*true/,
];

for (const pattern of forbiddenWritePatterns) {
  assert.equal(pattern.test(source), false, `Forbidden write-capable pattern found: ${pattern}`);
}

for (const required of [
  "quote-spine-empty",
  "READ-ONLY: Supabase access uses GET requests only",
  "Default output redacts lead/customer names",
  "--owner-brief",
  "--verify-counts",
  "--quote-packet",
  "dry_run_only",
  "action-ready; live freshness check pending",
  "stale-source / needs verification",
  "missing-facts blocker",
]) {
  assert.ok(source.includes(required), `Missing safety/control text: ${required}`);
}

const markdown = execFileSync(process.execPath, [scriptPath, "--fixture", "--limit", "5"], {
  encoding: "utf8",
});

for (const heading of [
  "Next lead to verify",
  "Hot leads needing Guido today",
  "Quotes ready to prepare",
  "Quotes waiting for customer follow-up",
  "Missing facts blocking quote/order progress",
  "Learning notes / patterns",
  "Guardrail footer",
]) {
  assert.ok(markdown.includes(heading), `Missing markdown heading: ${heading}`);
}

assert.ok(markdown.includes("Lead "), "Default output should show redacted lead labels");
assert.equal(markdown.includes("Alex Example"), false, "Default output must not include fixture customer names");
assert.equal(/\|\s*Guido\s*\|/.test(markdown), false, "Default output must not include owner names in table cells");
assert.equal(markdown.includes("Bethan"), false, "Default output must not leak names embedded in next_action text");
assert.equal(markdown.includes("Supplier Noise"), false, "Default output must exclude supplier/admin noise rows");
assert.equal(markdown.includes("stock update"), false, "Default output must exclude stock-update supplier rows");
assert.ok(markdown.includes("supplier/admin/order-payment rows excluded"), "Learning notes should show excluded non-quote rows");
assert.equal(markdown.includes("alex@example.com"), false, "Default output must not include emails");
assert.equal(markdown.includes("12345"), false, "Default output must not expose raw Monday item ids");
assert.match(markdown, /\d{4}-\d{2}-\d{2}T/, "ISO dates should not be mistaken for phone numbers");
assert.ok(markdown.includes("quote-spine-empty"), "Empty quote spine should be stated gracefully");
assert.equal(/^\|/m.test(markdown), false, "Default Telegram output must not use wide Markdown tables");
assert.equal(/^\|.*\|$/m.test(markdown), false, "Default output must not include Markdown table rows");
assert.ok(markdown.includes("Work all active leads from most important down, one at a time; continue down the queue after each verified decision."), "Queue must tell Hermes to work all leads in order");
assert.equal(/pick(?:ing)?\s+(?:only\s+)?2-3\s+(?:high-value\s+)?leads/i.test(markdown), false, "Queue must not suggest picking only 2-3 leads");
assert.ok(markdown.includes("stale-source / needs verification"), "Old follow-up evidence must carry a freshness warning");
assert.ok(markdown.includes("Check live Gmail/Monday/Supabase/source trail first"), "First queue item should say what evidence to verify before customer action");
assert.ok(markdown.includes("action-ready; live freshness check pending"), "Fresh rows must still say live freshness check is pending");
assert.ok(markdown.includes("missing-facts blocker"), "Missing-fact rows must be explicitly blocked");
assert.ok(markdown.includes("quote-spine-empty fallback"), "Quote intent without quote spine should show fallback status");

const packet = execFileSync(process.execPath, [scriptPath, "--fixture", "--quote-packet", "fixture-ready", "--json"], {
  encoding: "utf8",
});
const parsed = JSON.parse(packet);
assert.equal(parsed.mode, "read-only/dry-run");
assert.ok(Array.isArray(parsed.sections.workQueue), "JSON should include one-by-one work queue");
assert.equal(parsed.sections.workQueue[0].freshnessStatus, "stale-source / needs verification", "Most important stale lead must not look action-ready");
assert.match(parsed.sections.workQueue[0].evidenceToVerify, /Check live Gmail\/Monday\/Supabase\/source trail first/);
assert.equal(parsed.quotePacket.mode, "draft-only/read-only");
assert.equal(parsed.quotePacket.dryRunXeroPayloadShape.createOrSendXeroQuote, false);
assert.equal(JSON.stringify(parsed).includes("Morgan Quote"), false, "Default JSON packet should redact customer names");
assert.equal(JSON.stringify(parsed).includes("alex@example.com"), false, "Default JSON must not include fixture emails");
assert.equal(JSON.stringify(parsed).includes("12345"), false, "Default JSON must not expose raw Monday item ids");

console.log("OK: Lead-to-Quote control strip is read-only by source check and redacted in fixture output");
