import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const schema = read("reference/tuesday/supabase-order-intake-schema-2026-05-28.sql");
for (const table of [
  "order_financial_documents",
  "order_payments",
  "order_intake_reviews",
  "production_order_tasks",
]) {
  assert.match(schema, new RegExp(`create table if not exists public\\.${table}`), `${table} table is declared`);
}
assert.match(schema, /unique\(order_id\)/, "one intake review per order is enforced");
assert.match(schema, /unique\(order_id, source_task_id\)/, "approved task upserts are idempotent");

const lib = read("lib/production/order-intake.ts");
assert.match(lib, /listRecentXeroInvoiceSummaries/, "recent Xero invoices are read");
assert.match(lib, /type !== "ACCREC"/, "supplier bills are ignored");
assert.match(lib, /status === "AUTHORISED"/, "authorised invoices are accepted");
assert.match(lib, /status === "PAID"/, "paid invoices can be reconciled for review");
assert.match(lib, /row\.source_system !== "akahu"/, "Akahu evidence is required for exact payment match");
assert.match(lib, /match_confidence \?\? 0\) >= 0\.98/, "weak payment matches are not auto-approved");
assert.match(lib, /existing\.paid_on_date \|\| nzDate\(\)/, "existing paid dates are preserved");
assert.match(lib, /production_order_tasks\?on_conflict=order_id,source_task_id/, "approval writes idempotent Supabase production tasks");
assert.doesNotMatch(lib, /getOrdersWithFallback|production-plan-mapping.*getPlan|monday\/fetch/i, "order intake library does not call Monday APIs");

const plan = read("app/production/plan/PlanClient.tsx");
assert.match(plan, /Pending new orders/, "Production Plan shows an intake queue");
assert.match(plan, /OrderIntakeReviewModal/, "Production Plan has an intake review modal");
assert.match(plan, /Approve to schedule/, "Nick can approve tasks to the schedule");
assert.match(plan, /\/api\/production\/order-intake\/reconcile/, "manual reconcile is wired from Production Plan");
assert.match(plan, /production_order_tasks/, "approved production tasks are live-synced");

for (const route of [
  "app/api/production/order-intake/route.ts",
  "app/api/production/order-intake/reconcile/route.ts",
  "app/api/production/order-intake/[orderId]/draft/route.ts",
  "app/api/production/order-intake/[orderId]/approve/route.ts",
]) {
  assert.equal(existsSync(new URL(`../${route}`, import.meta.url)), true, `${route} exists`);
}

const approveRoute = read("app/api/production/order-intake/[orderId]/approve/route.ts");
assert.match(approveRoute, /approveOrderIntake/, "approval route delegates to the protected intake service");
const job = read("scripts/reconcile-order-intake.mjs");
assert.match(job, /\/api\/production\/order-intake\/reconcile/, "cron runner calls the protected app reconcile endpoint");
assert.match(job, /innate-auth/, "cron runner uses the Tuesday auth cookie instead of bypassing app protection");
const packageJson = read("package.json");
assert.match(packageJson, /reconcile:order-intake/, "package script exposes the order-intake reconcile hook");
assert.match(packageJson, /sync-akahu-order-payments\.py/, "order-intake reconcile syncs Akahu evidence between Xero reconcile passes");
const akahuSync = read("scripts/sync-akahu-order-payments.py");
assert.match(akahuSync, /sync_akahu_transactions\.py/, "Akahu payment sync reuses the existing Midas Akahu read-only tool");
assert.match(akahuSync, /match_status/, "Akahu payment sync writes explicit match status");
assert.match(lib, /paymentEvidence\.probable/, "probable Akahu evidence moves intake to human review, not approval");

console.log("Order intake API and Production Plan wiring checks passed.");
