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
const lifecycleSchema = read("reference/tuesday/supabase-payment-lifecycle-schema-2026-06-10.sql");
assert.match(lifecycleSchema, /document_role text/, "financial documents get explicit roles");
assert.match(lifecycleSchema, /order_payment_lifecycle_v/, "payment lifecycle view is declared");
assert.match(lifecycleSchema, /security_invoker = true/, "payment lifecycle view uses security-invoker mode");
assert.match(lifecycleSchema, /awaiting_balance_payment/, "balance payment waiting state is declared");

const lib = read("lib/production/order-intake.ts");
const workshopRules = read("lib/production/workshop-process-rules.ts");
assert.match(lib, /listRecentXeroInvoiceSummaries/, "recent Xero invoices are read");
assert.match(workshopRules, /WORKSHOP_PROCESS_RULES/, "workshop process rules have a canonical module");
assert.match(workshopRules, /Nick: \{ workshopDays: \[1, 2, 3\]/, "canonical rules record Nick's Mon-Wed workshop availability");
assert.match(workshopRules, /Dylan: \{ workshopDays: \[1, 2, 3, 4\]/, "canonical rules record Dylan's Mon-Thu workshop availability");
assert.match(workshopRules, /steel fabrication\/powder coating is normally 2 weeks; 3 weeks safer/, "canonical rules record normal/safe steel fabrication and powder-coat waits");
assert.match(workshopRules, /Westimber laminated panels are normally about 2 weeks/, "canonical rules record the Westimber laminated-panel wait");
assert.match(workshopRules, /minWorkingDaysBetweenCoats: 1/, "canonical rules record minimum coat spacing");
assert.match(workshopRules, /idealWorkingDaysBetweenCoats: 2/, "canonical rules record ideal coat spacing");
assert.match(workshopRules, /minCureWorkingDaysAfterFinalCoat: 2/, "canonical rules record minimum final-coat cure time");
assert.match(workshopRules, /blackwashStainCoats: 2/, "canonical rules record blackwash stain coats");
assert.match(workshopRules, /blackwashClearCoats: 2/, "canonical rules record blackwash clear coats");
assert.match(workshopRules, /needsTableShapeCut/, "canonical rules decide when table shapes need cutting");
assert.match(workshopRules, /buildDiningTableProcessPlan/, "canonical rules build dining-table process plans");
assert.match(workshopRules, /Sand and first stain coat/, "canonical rules show the first blackwash stain step");
assert.match(workshopRules, /Second stain coat/, "canonical rules show the second blackwash stain step");
assert.match(workshopRules, /First clear coat/, "canonical rules show the first blackwash clear step");
assert.match(workshopRules, /Final clear coat/, "canonical rules show the final blackwash clear step");
assert.match(workshopRules, /precisionWoodworksCncShapeCut/, "canonical rules record Precision Woodworks CNC lead time");
assert.match(workshopRules, /Precision Woodworks CNC shape cutting adds about 2 weeks after Westimber/, "canonical rules record Precision Woodworks CNC wait");
assert.match(workshopRules, /needsPrecisionWoodworksCnc/, "canonical rules distinguish non-standard CNC shapes");
assert.match(workshopRules, /rectangle\|rectangular\|square\|round\|pill/, "canonical rules exempt rectangle, square, round, and pill from Precision Woodworks CNC");
assert.match(workshopRules, /unknownStageLabel: "Unknown - needs Nick\/Guido check"/, "canonical rules preserve explicit unknown-stage status");
assert.match(workshopRules, /bankVisiblePaidLabel: "Paid - bank visible"/, "canonical rules treat bank-visible as paid");
assert.match(workshopRules, /akahuSyncIssueLabel: "Payment seen in bank - Akahu\/Xero sync needs fixing"/, "canonical rules treat Akahu lag as a system issue");
const xeroReadOnly = read("lib/xero/read-only.ts");
assert.match(xeroReadOnly, /HERMES_INTEGRATIONS_PATH/, "Xero read-only helper knows the canonical Hermes integrations path");
assert.match(xeroReadOnly, /source: "hermes"/, "Xero read-only helper can load credentials from Hermes storage");
assert.doesNotMatch(xeroReadOnly, /openclaw|XERO_OPENCLAW_CONFIG/i, "Xero read-only helper does not depend on retired OpenClaw config");
assert.match(lib, /type !== "ACCREC"/, "supplier bills are ignored");
assert.match(lib, /status === "AUTHORISED"/, "authorised invoices are accepted");
assert.match(lib, /status === "PAID"/, "paid invoices can be reconciled for review");
assert.match(lib, /row\.source_system !== "akahu"/, "Akahu evidence is required for exact payment match");
assert.match(lib, /match_confidence \?\? 0\) >= 0\.98/, "weak payment matches are not auto-approved");
assert.doesNotMatch(lib, /paid_on_date:\s*existing\.paid_on_date \|\| nzDate\(\)/, "paid reconcile must not stamp today's date onto existing orders");
assert.doesNotMatch(lib, /paid_on_date:\s*paid \? nzDate\(\) : null/, "new paid orders must not use today's date as payment evidence");
assert.match(lib, /settledPaymentDate\(/, "paid reconcile derives paid_on_date from exact payment evidence");
assert.match(lib, /bankVisiblePaymentDate\(/, "paid reconcile can derive paid_on_date from bank-visible payment evidence");
assert.match(lib, /hasScheduleReadyPaymentEvidence/, "approval guard uses the same exact or bank-visible payment evidence as the UI");
assert.match(lib, /This order needs exact or bank-visible payment evidence before approval\./, "approval failure explains the accepted payment evidence threshold");
assert.match(lib, /findBalanceParentOrder/, "balance invoices are linked back to the primary order");
assert.match(lib, /syncOrderItems: false/, "balance invoice evidence does not overwrite production line items");
assert.match(lib, /balance invoice could not be linked/, "unlinked balance invoices are manual review instead of duplicate orders");
assert.match(lib, /version: 3/, "intake suggestion signature is bumped when table task generation changes");
assert.match(lib, /if \(category === "Table"\)/, "dining-table intake suggestions use a dedicated table flow");
assert.match(lib, /buildDiningTableProcessPlan/, "order intake table suggestions use the canonical process builder");
assert.match(workshopRules, /Precision Woodworks CNC/, "canonical table process adds a Precision Woodworks CNC task for non-standard table shapes");
assert.match(workshopRules, /Book Pinpoint return/, "canonical table process adds a Pinpoint return task for CNC-cut panels");
assert.match(lib, /hasBankVisiblePayment/, "order intake treats bank-visible Akahu rows as schedule-ready payment evidence");
for (const standardTableTask of ["Order Loaded", "POs sent", "Materials received", "Balance invoice", "Confirm paid before release", "Customer update"]) {
  assert.match(workshopRules, new RegExp(standardTableTask.replace(/[+()]/g, "\\$&")), `canonical table suggestions include ${standardTableTask}`);
}
assert.match(lib, /production_order_tasks\?on_conflict=order_id,source_task_id/, "approval writes idempotent Supabase production tasks");
assert.doesNotMatch(lib, /getOrdersWithFallback|production-plan-mapping.*getPlan|monday\/fetch/i, "order intake library does not call Monday APIs");

const plan = read("app/production/plan/PlanClient.tsx");
const intakeRoute = read("app/api/production/order-intake/route.ts");
const planTaskLinksRoute = read("app/api/production/plan-task-links/route.ts");
assert.match(intakeRoute, /\{ status: 500 \}/, "order intake list failures should return a real failure status");
assert.match(plan, /Pending new orders/, "Production Plan shows an intake queue");
assert.match(plan, /OrderIntakeReviewModal/, "Production Plan has an intake review modal");
assert.match(plan, /onMarkComplete/, "intake review modal exposes a mark-complete action");
assert.match(plan, /function markIntakeOrderCompleteInTuesday/, "intake orders can be marked complete through Tuesday overrides");
assert.match(plan, /CompletedTuesdayOrdersCard/, "completed Tuesday orders have a recovery card");
assert.match(plan, /function restoreCompletedTuesdayOrder/, "completed Tuesday orders can be restored to active views");
assert.match(plan, /status: "active"/, "completed Tuesday order restore removes the override through the API");
assert.match(plan, /orderOverrides\[item\.orderId\]\?\.status !== "completed"/, "completed intake orders are hidden from active intake views");
assert.match(plan, /\(\["Nick", "Dylan", "Guido"\] as OrderIntakeOwner\[\]\)/, "intake scheduled-task owner choices include Guido");
assert.match(plan, /gridTemplateColumns: isNarrow \? "1fr" : "minmax\(240px, 0\.78fr\) minmax\(240px, 0\.78fr\) minmax\(0, 1\.62fr\)"/, "intake review modal stacks safely on mobile and uses the unified three-column desktop layout");
assert.match(plan, /Payments/, "Production Plan shows consolidated payment details");
assert.match(plan, /Estimated due date/, "Production Plan shows a clear estimated customer-ready date panel");
assert.match(plan, /expectedReadyInfoForIntake/, "Production Plan computes customer-ready dates from promised lead time and deposit payment state");
assert.match(plan, /buildDiningTableProcessPlan/, "Production Plan popup normalizer uses the canonical process builder");
assert.match(plan, /appTaskCountsTowardWorkshopCapacity/, "Production Plan excludes admin app tasks from workshop capacity");
assert.match(workshopRules, /Precision Woodworks CNC/, "Production Plan canonical builder includes Precision Woodworks for non-standard shapes");
assert.match(workshopRules, /Book Pinpoint return/, "Production Plan canonical builder includes Pinpoint return from Precision Woodworks");
assert.match(plan, /orderTrustSignal/, "Production Plan surfaces compact live-order trust status");
assert.match(plan, /Last checked:/, "Production Plan shows source/last-checked context for trust status");
assert.match(plan, /financialDocuments/, "Production Plan receives all financial documents for deposit and balance invoice cards");
assert.match(plan, /invoiceDate/, "payment rows show invoice dates");
assert.match(plan, /paidDate/, "payment rows show paid dates or awaiting-payment state");
assert.match(plan, /href=\{payment\.invoiceUrl\}/, "payment rows link to their individual Xero invoices");
assert.match(plan, /handleIntakeTaskDragEnd/, "suggested intake production tasks can be reordered by drag");
assert.match(plan, /useSortable\(\{\n\s+id: task\.id,\n\s+data: \{ type: "intake-task" \}/, "intake task rows use sortable drag handles");
assert.match(plan, /aria-expanded=\{open\}/, "info icons expose click-open tooltip state");
assert.match(plan, /Review stages, owners, dates, and hours before approving them into the live schedule\./, "Production Plan keeps approval guidance in an info tooltip");
assert.match(plan, /paymentStageBadge/, "Production Plan renders Supabase payment lifecycle badges");
assert.match(plan, /bankVisibleFromEvidence/, "payment timeline treats bank-visible Akahu evidence as paid");
assert.match(plan, /COMPLETION_REASONS/, "completed Tuesday overrides use structured reasons");
assert.match(plan, /TuesdayCompletionDialog/, "completed Tuesday overrides use the in-app completion dialog");
assert.doesNotMatch(plan, /window\.(confirm|prompt)/, "Tuesday completion and delete flows avoid native browser popups");
assert.match(planTaskLinksRoute, /reason: orderOverride\.reason/, "completed Tuesday override reasons are persisted");
assert.match(plan, /Plan checked and ready/, "intake approval requires a lightweight review confirmation");
assert.match(plan, /moveAllTasksByWorkingDay/, "intake review can shift all suggested task dates together");
assert.match(plan, /-1 workday/, "intake review exposes a move-earlier workday control");
assert.match(plan, /\+1 workday/, "intake review exposes a move-later workday control");
assert.match(plan, /normalizeStandardTableIntakeTasks/, "old table intake drafts are upgraded to the standard table sequence when opened");
assert.match(plan, /numberedTaskRowOptionLabel/, "selected task rows use row numbering instead of skipped canonical numbering");
assert.match(plan, /title=\{task\.detail \|\| task\.title\}/, "suggested task details are available without taking a second row");
assert.doesNotMatch(plan, /textarea value=\{task\.detail\}/, "suggested task rows stay single-line instead of permanent detail textareas");
assert.match(plan, /Add to schedule/, "approval copy stays low-friction for workshop adoption");
assert.match(plan, /disabled=\{busy \|\| !canApprove \|\| !approvalConfirmed\}/, "approved intake scheduling is guarded against accidental clicks");
assert.match(plan, /approvedBy: "Tuesday review"/, "approved intake scheduling records a neutral Tuesday review marker");
assert.match(plan, /production_order_tasks/, "approved production tasks are live-synced");
assert.match(plan, /async function refreshOrderIntakeList/, "Production Plan intake refresh is a read-only list reload");
assert.match(plan, /await loadOrderIntake\(false\)/, "Production Plan intake refresh reads current intake state");
assert.match(plan, /if \(!response\.ok \|\| data\.ok === false\) throw new Error/, "Production Plan preserves visible intake items when refresh fails");
assert.doesNotMatch(plan, /\/api\/production\/order-intake\/reconcile/, "Production Plan does not expose source reconciliation in Nick-facing UI");
assert.match(plan, /function findOrderForIntakeItem/, "approved intake tasks resolve back to active orders");
assert.match(plan, /orderId: matchedOrder\?\.id \?\? null/, "approved intake tasks are attached to their matched Monday order");
assert.match(plan, /if \(task\.orderId != null\) {\n\s+openOrderOverview\(task\.orderId\)/, "opening a matched intake task opens the order view first");
assert.match(plan, /Invoice saved - not verified/, "invoice number badges do not imply Xero proof before lookup");
assert.match(plan, /Xero proof unavailable/, "Xero proof failures are shown plainly in order details");
assert.match(plan, /configured === false \? "Xero read-only credentials are not configured\."/s, "Xero readiness failures explain missing credentials");

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
const taskRoute = read("app/api/production/order-intake/tasks/[taskId]/route.ts");
assert.match(taskRoute, /updateApprovedOrderIntakeTask/, "approved intake task route delegates to the protected intake service");
assert.match(lib, /updateApprovedOrderIntakeTask/, "approved intake tasks can be updated after approval");
const job = read("scripts/reconcile-order-intake.mjs");
assert.match(job, /\/api\/production\/order-intake\/reconcile/, "cron runner calls the protected app reconcile endpoint");
assert.match(job, /innate-auth/, "cron runner uses the Tuesday auth cookie instead of bypassing app protection");
const nickAudit = read("scripts/audit-nick-readiness.mjs");
assert.match(nickAudit, /dryRun=1&scope=orders/, "Nick readiness audit reads Monday orders through dry-run refresh");
assert.match(nickAudit, /dryRun=1&scope=plan/, "Nick readiness audit reads Monday plan through dry-run refresh");
assert.match(nickAudit, /\/api\/production\/order-intake/, "Nick readiness audit reads order intake state");
assert.match(nickAudit, /\/api\/production\/plan-task-links/, "Nick readiness audit applies Tuesday completion overrides");
assert.match(nickAudit, /\/api\/production\/order-workflow\?orderIds=/, "Nick readiness audit counts Tuesday workflow tasks as visible work");
assert.match(nickAudit, /orderOverrides\[String\(order\.id\)\]\?\.status === "completed"/, "Nick readiness audit filters Tuesday-completed orders from active readiness");
assert.match(nickAudit, /\/api\/xero\/proof/, "Nick readiness audit probes Xero proof readiness");
assert.doesNotMatch(nickAudit, /method:\s*"POST"|\/approve|\/draft|\/reconcile/, "Nick readiness audit does not mutate or reconcile production data");
const packageJson = read("package.json");
assert.match(packageJson, /reconcile:order-intake/, "package script exposes the order-intake reconcile hook");
assert.match(packageJson, /audit:nick-readiness/, "package script exposes the Nick readiness audit");
assert.match(packageJson, /sync-akahu-order-payments\.py/, "order-intake reconcile syncs Akahu evidence between Xero reconcile passes");
const akahuSync = read("scripts/sync-akahu-order-payments.py");
assert.match(akahuSync, /sync_akahu_transactions\.py/, "Akahu payment sync reuses the existing Midas Akahu read-only tool");
assert.match(akahuSync, /match_status/, "Akahu payment sync writes explicit match status");
assert.match(akahuSync, /apply_matched_payment_state/, "Akahu payment sync can move exact balance payments forward");
assert.match(lib, /paymentEvidence\.probable/, "probable Akahu evidence moves intake to human review, not approval");

console.log("Order intake API and Production Plan wiring checks passed.");
