#!/usr/bin/env node
import process from "node:process";

const baseUrl = (process.env.TUESDAY_BASE_URL || process.env.MISSION_CONTROL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const authCookie = process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE || "";

async function readJson(path) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: authCookie ? { cookie: `innate-auth=${authCookie}` } : {},
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 500) };
  }
  return { url, ok: response.ok, status: response.status, data };
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.orders)) return value.orders;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function pickOrderIds(orders, limit = 40) {
  return orders
    .map((order) => order?.id ?? order?.orderId ?? order?.mondayId)
    .filter((id) => id != null && String(id).trim())
    .slice(0, limit)
    .map(String);
}

function activeTrainingCandidates(orders, orderOverrides = {}) {
  return orders
    .filter((order) => orderOverrides[String(order.id)]?.status === "completed" ? false : true)
    .filter((order) => /table|desk|bench|panel|shelv/i.test(`${order.name ?? ""} ${order.product ?? ""} ${order.item ?? ""}`))
    .slice(0, 3)
    .map((order) => ({
      id: order.id ?? order.orderId ?? null,
      name: order.name ?? order.customerName ?? order.customer ?? "Unknown order",
      status: order.status ?? order.stage ?? order.phase ?? "unknown",
    }));
}

async function main() {
  const ordersRefresh = await readJson("/api/monday/refresh?dryRun=1&scope=orders");
  const planRefresh = await readJson("/api/monday/refresh?dryRun=1&scope=plan");
  const intake = await readJson("/api/production/order-intake");
  const links = await readJson("/api/production/plan-task-links");

  const orders = asArray(ordersRefresh.data);
  const orderIds = pickOrderIds(orders);
  const workflow = orderIds.length
    ? await readJson(`/api/production/order-workflow?orderIds=${encodeURIComponent(orderIds.join(","))}`)
    : { ok: false, status: 0, data: { skipped: "No order ids available from dry-run orders refresh." } };

  const proofInvoice = process.env.XERO_PROOF_INVOICE || "__readiness_probe__";
  const xeroProof = await readJson(`/api/xero/proof?invoiceNumber=${encodeURIComponent(proofInvoice)}`);
  const orderOverrides = links.data?.orderOverrides ?? links.data?.overrides ?? {};
  const candidates = activeTrainingCandidates(orders, orderOverrides);

  const result = {
    ok: ordersRefresh.ok && planRefresh.ok && intake.ok && links.ok,
    baseUrl,
    checks: {
      ordersRefresh: { ok: ordersRefresh.ok, status: ordersRefresh.status, count: orders.length },
      planRefresh: { ok: planRefresh.ok, status: planRefresh.status },
      intake: { ok: intake.ok, status: intake.status, count: asArray(intake.data).length },
      planTaskLinks: { ok: links.ok, status: links.status, overrideCount: Object.keys(orderOverrides).length },
      orderWorkflow: { ok: workflow.ok, status: workflow.status, requestedOrderIds: orderIds.length },
      xeroProof: { ok: xeroProof.ok, status: xeroProof.status },
    },
    trainingCandidates: candidates,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
