#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const dryRun = execFileSync("python3", ["scripts/backfill-myriam-customer-mirror.py"], {
  cwd: root,
  encoding: "utf8",
});
assert(dryRun.includes("DRY RUN"), "backfill script should default to dry-run");
assert(dryRun.includes("INV-1160"), "dry-run should include Myriam invoice");
assert(dryRun.includes("19ece8926201ae63"), "dry-run should include Gmail message provenance");
assert(dryRun.includes("order-documents"), "dry-run should include private bucket name");

const schema = readFileSync(join(root, "reference/tuesday/supabase-order-customer-mirror-schema-2026-06-18.sql"), "utf8");
assert(schema.includes("create table if not exists public.order_documents"), "schema should create order_documents");
assert(schema.includes("create table if not exists public.order_customer_mirror"), "schema should create order_customer_mirror");
assert(schema.includes("public = false"), "schema should keep order-documents bucket private");
assert(schema.includes("source_attachment_ref"), "schema should store raw source attachment refs internally");

const helper = readFileSync(join(root, "lib/production/order-customer-mirror.ts"), "utf8");
assert(helper.includes("signedOrderDocumentUrl"), "server helper should generate signed document URLs");
assert(helper.includes("/storage/v1/object/sign/"), "server helper should use Supabase signed object URLs");
assert(!helper.includes("source_attachment_ref:"), "UI-facing document mapping should not expose raw attachment refs");

const ui = readFileSync(join(root, "app/production/plan/PlanClient.tsx"), "utf8");
assert(ui.includes("CustomerMirrorPanel"), "order overlay should render CustomerMirrorPanel");
assert(ui.includes("/api/production/order-customer-mirror"), "UI should load mirror through local API");

console.log("PASS order customer mirror local checks");
