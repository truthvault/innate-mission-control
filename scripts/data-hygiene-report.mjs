#!/usr/bin/env node
/**
 * Tuesday P3 data-hygiene report — READ-ONLY.
 *
 * Scans the Supabase spine for records that would erode workshop trust:
 *   1. Orderless/vague imported plan tasks (junk cells from the Monday import)
 *   2. Active/blocked orders whose due dates are long past
 *   3. Orders marked done-ish in Monday progress but still active here
 *   4. Intake reviews stuck in needs-review states
 *
 * Writes a JSON + markdown proposal. It NEVER writes to Supabase — apply is a
 * separate, human-approved step.
 */

import fs from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
loadLocalEnv();

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!URL_ || !KEY) throw new Error("Supabase env missing");

async function sb(q) {
  const res = await fetch(`${URL_}/rest/v1/${q}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const todayNZ = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());

const [orders, tasks, reviews] = await Promise.all([
  sb("orders?select=id,order_code,customer_name,status,item_category,due_date,finished_date,delivered_date,paid_on_date,spec,monday_order_item_id,updated_at&archived_at=is.null&limit=1000"),
  sb("production_order_tasks?select=id,order_id,source_task_id,title,owner,scheduled_date,day_key,status,notes&status=neq.deleted&limit=5000"),
  sb("order_intake_reviews?select=id,order_id,review_state,updated_at&limit=1000"),
]);

const report = { generatedAt: new Date().toISOString(), todayNZ, proposals: { junkTasks: [], staleOrders: [], doneInMondayStillActive: [], stuckReviews: [] } };

// 1. Junk imported tasks: orderless Monday-import cells with vague titles,
//    or any past-dated orderless imported cell.
const vague = /^(\?+|[0-9]{1,2}(am|pm)?|today|second coat\?|test|tbc|\.+)$/i;
for (const t of tasks) {
  if (!t.source_task_id?.startsWith("monday:")) continue;
  if (t.order_id) continue;
  const pastDated = t.scheduled_date && t.scheduled_date < todayNZ;
  const isVague = vague.test((t.title || "").trim()) || (t.title || "").trim().length <= 4;
  if (isVague || pastDated) {
    report.proposals.junkTasks.push({
      id: t.id, title: t.title, owner: t.owner, scheduled_date: t.scheduled_date,
      reason: isVague ? "orderless + vague title" : "orderless import cell dated in the past",
      proposal: "status=deleted (notes annotated)",
    });
  }
}

// 2. Stale orders: workshop-active statuses with due dates >14 days past.
const activeStatuses = new Set(["active", "in_production", "awaiting_dispatch", "paused"]);
for (const o of orders) {
  if (!activeStatuses.has(o.status)) continue;
  if (!o.due_date || o.due_date >= todayNZ) continue;
  const daysLate = Math.round((Date.parse(todayNZ) - Date.parse(o.due_date)) / 86400000);
  if (daysLate < 14) continue;
  const spec = o.spec || {};
  const progressDone = spec.monday_top_panel_stage === "Done / NA" && spec.monday_legs_stage === "Done / NA";
  report.proposals.staleOrders.push({
    id: o.id, order_code: o.order_code, customer: o.customer_name, status: o.status,
    due_date: o.due_date, days_late: daysLate,
    finished_date: o.finished_date, delivered_date: o.delivered_date,
    monday_progress_done: progressDone,
    proposal: o.finished_date || o.delivered_date
      ? "status looks behind reality (finished/delivered date set) — propose status update"
      : progressDone
        ? "Monday progress shows done — confirm and close, or set a real due date"
        : "confirm with Guido/Nick: reschedule due date or close",
  });
}

// 3. Orders whose Monday progress says done on both fronts but status still active.
for (const o of orders) {
  const spec = o.spec || {};
  if (!activeStatuses.has(o.status)) continue;
  if (spec.monday_top_panel_stage === "Done / NA" && spec.monday_legs_stage === "Done / NA" && o.finished_date) {
    if (!report.proposals.staleOrders.find((r) => r.id === o.id)) {
      report.proposals.doneInMondayStillActive.push({
        id: o.id, order_code: o.order_code, customer: o.customer_name, status: o.status,
        finished_date: o.finished_date, proposal: "propose status=finished (or delivered if collected)",
      });
    }
  }
}

// 4. Intake reviews stuck in a review state for >14 days.
for (const r of reviews) {
  if (r.review_state === "approved") continue;
  const ageDays = Math.round((Date.now() - Date.parse(r.updated_at)) / 86400000);
  if (ageDays < 14) continue;
  const order = orders.find((o) => o.id === r.order_id);
  report.proposals.stuckReviews.push({
    id: r.id, order_code: order?.order_code || r.order_id, customer: order?.customer_name || "?",
    review_state: r.review_state, stale_days: ageDays,
    proposal: "review in intake rail: approve, or archive if no longer a real order",
  });
}

const outDir = "reports/data-hygiene";
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = path.join(outDir, `hygiene-${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [];
md.push(`# Tuesday data-hygiene proposals — ${report.generatedAt}`, "", "Read-only report. Nothing has been changed.", "");
md.push(`## 1. Junk imported tasks → propose delete (${report.proposals.junkTasks.length})`, "");
for (const t of report.proposals.junkTasks) md.push(`- "${t.title}" · ${t.owner} · ${t.scheduled_date} — ${t.reason}`);
md.push("", `## 2. Stale active orders, due 14+ days ago (${report.proposals.staleOrders.length})`, "");
for (const o of report.proposals.staleOrders) md.push(`- ${o.customer} (${o.order_code}) · ${o.status} · due ${o.due_date} (${o.days_late}d late)${o.finished_date ? ` · finished ${o.finished_date}` : ""} → ${o.proposal}`);
md.push("", `## 3. Monday says done, still active here (${report.proposals.doneInMondayStillActive.length})`, "");
for (const o of report.proposals.doneInMondayStillActive) md.push(`- ${o.customer} (${o.order_code}) · ${o.status} · finished ${o.finished_date} → ${o.proposal}`);
md.push("", `## 4. Intake reviews stuck 14+ days (${report.proposals.stuckReviews.length})`, "");
for (const r of report.proposals.stuckReviews) md.push(`- ${r.customer} (${r.order_code}) · ${r.review_state} · ${r.stale_days}d stale → ${r.proposal}`);
fs.writeFileSync(jsonPath.replace(/\.json$/, ".md"), md.join("\n"));

console.log("Report:", jsonPath.replace(/\.json$/, ".md"));
console.log(JSON.stringify({
  junkTasks: report.proposals.junkTasks.length,
  staleOrders: report.proposals.staleOrders.length,
  doneInMondayStillActive: report.proposals.doneInMondayStillActive.length,
  stuckReviews: report.proposals.stuckReviews.length,
}, null, 2));
