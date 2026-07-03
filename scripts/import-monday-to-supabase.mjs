#!/usr/bin/env node
/**
 * One-time Monday → Supabase import for Tuesday v2 (Phase 1).
 *
 * Reads the three Monday boards the app still renders live:
 *   - Orders NEW board   (MONDAY_ORDERS_BOARD_ID)
 *   - Production Plan    (MONDAY_PRODUCTION_BOARD_ID)
 *   - Sample stock       (MONDAY_SAMPLE_STOCK_BOARD_ID, default 18412532131)
 *
 * and diffs them against the Supabase orders spine:
 *   - orders                       (matched via monday_order_item_id, then invoice number)
 *   - production_order_tasks      (matched via source_task_id "monday:<row>:<day>:<person>")
 *
 * DRY-RUN by default: writes a JSON + markdown report and prints a summary.
 * Nothing is written to Supabase unless BOTH `--apply` is passed AND
 * TUESDAY_IMPORT_APPLY=yes is set in the environment.
 */

import fs from "node:fs";
import path from "node:path";

// ---------- env ----------
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

const APPLY = process.argv.includes("--apply") && process.env.TUESDAY_IMPORT_APPLY === "yes";
const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const ORDERS_BOARD = process.env.MONDAY_ORDERS_BOARD_ID;
const PLAN_BOARD = process.env.MONDAY_PRODUCTION_BOARD_ID || "7301377614";
const SAMPLES_BOARD = process.env.MONDAY_SAMPLE_STOCK_BOARD_ID || "18412532131";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!MONDAY_TOKEN || !ORDERS_BOARD || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing MONDAY_API_TOKEN / MONDAY_ORDERS_BOARD_ID / SUPABASE_URL / SUPABASE key.");
  process.exit(1);
}

// ---------- monday ----------
async function mondayQuery(query, variables) {
  if (!/^\s*query/i.test(query)) throw new Error("Read-only guard: only queries allowed.");
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: MONDAY_TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`Monday error: ${JSON.stringify(body.errors || body).slice(0, 300)}`);
  return body.data;
}

const ITEMS_QUERY = `
  query GetItems($boardId: [ID!], $cursor: String, $limit: Int) {
    boards(ids: $boardId) {
      id
      name
      items_page(cursor: $cursor, limit: $limit) {
        cursor
        items {
          id
          name
          group { id title }
          updated_at
          column_values {
            id
            text
            value
            ... on BoardRelationValue {
              linked_items { id name board { id name } }
            }
          }
        }
      }
    }
  }
`;

async function boardItems(boardId) {
  const items = [];
  let cursor = null;
  do {
    const data = await mondayQuery(ITEMS_QUERY, { boardId: [boardId], cursor, limit: 100 });
    const page = data.boards?.[0]?.items_page;
    if (!page) break;
    items.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return items;
}

const col = (item, id) => item.column_values.find((c) => c.id === id);
const colText = (item, id) => {
  const raw = col(item, id)?.text?.trim();
  return raw ? raw : null;
};

// Orders NEW board columns (lib/monday/mapping.ts, verified 2026-04-23)
const OC = {
  invoice: "link_mm1qd1hh", item: "color_mm1qc8cf", qty: "numeric_mm1q5n23",
  status: "color_mm1q7asg", topPanel: "color_mm1q4b9n", legs: "color_mm1qat53",
  ordered: "date_mm1qe4fv", deadline: "timerange_mm1qfch5", finished: "date_mm1qm1e8",
  estHours: "numeric_mm1q4dan", value: "numeric_mm1qe008", freightRef: "text_mm1qrsmm",
  deliveryLocation: "text_mm1q40np",
};

// Monday status → Supabase status vocabulary
const STATUS_TO_SB = {
  "Quoting": "awaiting_payment",
  "To Process": "active",
  "Materials Ordered": "active",
  "Materials Ready": "in_production",
  "In production": "in_production",
  "In Production": "in_production",
  "Finished": "finished",
  "Ready for dispatch": "awaiting_dispatch",
  "Collected": "delivered",
  "Delivered": "delivered",
  "Done": "complete",
  "Cancelled": "cancelled",
  "On hold": "paused",
};

function invoiceNumberFromOrderItem(item) {
  const text = colText(item, OC.invoice) || item.name || "";
  const m = text.match(/INV[-\s]?(\d+)/i);
  return m ? `INV-${m[1]}` : null;
}

function deadlineEnd(item) {
  const v = col(item, OC.deadline)?.value;
  if (!v) return null;
  try { return JSON.parse(v)?.to || null; } catch { return null; }
}

// Plan board columns (lib/monday/production-plan-mapping.ts)
const PLAN_DAYS = {
  monday: { nick: "text_mkwexq19", dylan: "text_mkwe44bc" },
  tuesday: { nick: "text_mkwe54gw", dylan: "text_mkwe2vqg" },
  wednesday: { nick: "text_mky6fdym", dylan: "text_mky67jq5" },
  thursday: { nick: "text_mkyejh95", dylan: "text_mkye6mpw" },
};
const PLAN_LINKED = "connect_boards__1";

// ---------- supabase (read; writes only under APPLY) ----------
async function sb(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json", prefer: init.prefer || "return=representation",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

// ---------- main ----------
const report = { generatedAt: new Date().toISOString(), apply: APPLY, orders: [], planTasks: [], samples: {}, summary: {} };

console.log(`Mode: ${APPLY ? "APPLY (writes enabled)" : "DRY-RUN (no writes)"}`);

const [mondayOrders, planItems, sampleItems, sbOrders, sbTasks] = await Promise.all([
  boardItems(ORDERS_BOARD),
  boardItems(PLAN_BOARD),
  boardItems(SAMPLES_BOARD),
  sb("orders?select=*&limit=1000"),
  sb("production_order_tasks?select=id,order_id,source_task_id,title,owner,scheduled_date,day_key,status&limit=5000"),
]);

console.log(`Monday: ${mondayOrders.length} orders, ${planItems.length} plan rows, ${sampleItems.length} sample rows`);
console.log(`Supabase: ${sbOrders.length} orders, ${sbTasks.length} production tasks`);

// --- orders diff ---
const byMondayId = new Map(sbOrders.filter((o) => o.monday_order_item_id).map((o) => [String(o.monday_order_item_id), o]));
const byInvoice = new Map(sbOrders.filter((o) => o.xero_invoice_number).map((o) => [o.xero_invoice_number.toUpperCase(), o]));

for (const item of mondayOrders) {
  const invoice = invoiceNumberFromOrderItem(item);
  const matched = byMondayId.get(String(item.id)) || (invoice ? byInvoice.get(invoice.toUpperCase()) : null) || null;
  const mondayStatus = colText(item, OC.status);
  const proposal = {
    mondayItemId: item.id,
    mondayName: item.name,
    mondayStatus,
    invoice,
    match: matched ? { id: matched.id, order_code: matched.order_code, via: byMondayId.has(String(item.id)) ? "monday_id" : "invoice" } : null,
    action: matched ? "update" : "insert",
    fields: {},
  };
  const candidate = {
    status: STATUS_TO_SB[mondayStatus] || null,
    item_category: colText(item, OC.item),
    due_date: deadlineEnd(item),
    finished_date: colText(item, OC.finished),
    delivery: colText(item, OC.deliveryLocation),
    monday_order_item_id: item.id,
    spec_top_panel: colText(item, OC.topPanel),
    spec_legs: colText(item, OC.legs),
    est_hours: colText(item, OC.estHours),
  };
  if (matched) {
    for (const [key, value] of Object.entries(candidate)) {
      if (value == null) continue;
      const existing = key.startsWith("spec_") || key === "est_hours" ? undefined : matched[key];
      if (existing === undefined) {
        // spec fields live inside the JSON `spec` column; report for review
        proposal.fields[key] = { from: "(spec json)", to: value };
      } else if (String(existing ?? "") !== String(value)) {
        proposal.fields[key] = { from: existing ?? null, to: value };
      }
    }
    if (Object.keys(proposal.fields).length === 0) proposal.action = "none";
  } else {
    proposal.fields = candidate;
    proposal.customer_name_guess = item.name;
  }
  report.orders.push(proposal);
}

// Supabase orders with a monday id that no longer exists on the board
const mondayIds = new Set(mondayOrders.map((i) => String(i.id)));
report.ordersOrphanedInSupabase = sbOrders
  .filter((o) => o.monday_order_item_id && !mondayIds.has(String(o.monday_order_item_id)))
  .map((o) => ({ id: o.id, order_code: o.order_code, status: o.status, monday_order_item_id: o.monday_order_item_id }));

// --- plan tasks diff ---
const existingSourceIds = new Set(sbTasks.map((t) => t.source_task_id).filter(Boolean));
const orderByMondayId = byMondayId; // orders keyed by monday item id

for (const row of planItems) {
  if (/done and dusted/i.test(row.group?.title || "")) continue; // completed archive group
  const linked = (col(row, PLAN_LINKED)?.linked_items || [])[0] || null;
  const linkedOrder = linked ? orderByMondayId.get(String(linked.id)) || null : null;
  for (const [day, people] of Object.entries(PLAN_DAYS)) {
    for (const [person, columnId] of Object.entries(people)) {
      const text = colText(row, columnId);
      if (!text) continue;
      const sourceId = `monday:${row.id}:${day}:${person}`;
      report.planTasks.push({
        sourceId,
        weekGroup: row.group?.title || null,
        rowName: row.name,
        day,
        person,
        text,
        linkedMondayOrderId: linked ? linked.id : null,
        linkedSupabaseOrderId: linkedOrder ? linkedOrder.id : null,
        action: existingSourceIds.has(sourceId) ? "none" : "insert",
      });
    }
  }
}

// --- samples (counts only in Phase 1 dry-run) ---
report.samples = {
  mondayRows: sampleItems.length,
  note: "Sample stock import needs its own target table (stock ledger schema draft exists); Phase 1 reports counts only.",
};

// --- summary ---
report.summary = {
  mondayOrders: mondayOrders.length,
  ordersMatched: report.orders.filter((o) => o.match).length,
  ordersToInsert: report.orders.filter((o) => o.action === "insert").length,
  ordersToUpdate: report.orders.filter((o) => o.action === "update").length,
  ordersUnchanged: report.orders.filter((o) => o.action === "none").length,
  ordersOrphanedInSupabase: report.ordersOrphanedInSupabase.length,
  planTaskCells: report.planTasks.length,
  planTasksToInsert: report.planTasks.filter((t) => t.action === "insert").length,
  planTasksLinkedToSupabaseOrder: report.planTasks.filter((t) => t.linkedSupabaseOrderId).length,
  sampleRows: sampleItems.length,
};

const outDir = process.env.TUESDAY_IMPORT_REPORT_DIR || "reports/monday-import";
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonPath = path.join(outDir, `monday-import-${APPLY ? "apply" : "dryrun"}-${stamp}.json`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const md = [
  `# Monday → Supabase import ${APPLY ? "APPLY" : "dry-run"} — ${report.generatedAt}`,
  "",
  "## Summary", "",
  ...Object.entries(report.summary).map(([k, v]) => `- ${k}: ${v}`),
  "",
  "## Orders to INSERT (exist in Monday, not in Supabase)", "",
  ...report.orders.filter((o) => o.action === "insert").map((o) => `- ${o.mondayName} (${o.mondayStatus || "no status"}, ${o.invoice || "no invoice"}) [monday ${o.mondayItemId}]`),
  "",
  "## Orders to UPDATE (field diffs)", "",
  ...report.orders.filter((o) => o.action === "update").map((o) =>
    `- ${o.mondayName} → ${o.match.order_code || o.match.id} (via ${o.match.via}): ` +
    Object.entries(o.fields).map(([f, d]) => `${f}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join("; ")),
  "",
  "## Supabase orders whose Monday item disappeared", "",
  ...report.ordersOrphanedInSupabase.map((o) => `- ${o.order_code || o.id} (${o.status})`),
  "",
  `## Plan task cells to import: ${report.summary.planTasksToInsert}`, "",
  ...report.planTasks.filter((t) => t.action === "insert").slice(0, 60).map((t) => `- [${t.weekGroup}] ${t.day}/${t.person}: ${t.text.slice(0, 90)}${t.linkedSupabaseOrderId ? " (linked order ✓)" : ""}`),
].join("\n");
const mdPath = jsonPath.replace(/\.json$/, ".md");
fs.writeFileSync(mdPath, md);

console.log(`\nReport: ${mdPath}`);
console.log(JSON.stringify(report.summary, null, 2));

if (APPLY) {
  console.error("\nAPPLY mode is intentionally not implemented yet — Phase 1 requires Guido to review the dry-run report first.");
  process.exit(2);
}
