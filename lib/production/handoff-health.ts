import type { UiOrder } from "@/lib/monday/mapping";
import { invoiceExpectationForOrder } from "./invoice-expectation.js";

export type WorkshopHandoffLevel = "ready" | "check" | "blocked";

export type WorkshopHandoff = {
  level: WorkshopHandoffLevel;
  label: string;
  summary: string;
  missing: string[];
  present: string[];
  next: string;
};

function hasValue(value: string | number | null | undefined) {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim().length > 0;
}

function deliveryKnown(order: UiOrder) {
  return hasValue(order.deliveryLocation) || hasValue(order.freightRef);
}

function hasProductionStep(order: UiOrder) {
  if (order.rawMondayItem === "Sample") return true;
  if (order.rawMondayStatus === "To Process" || order.rawMondayStatus === "Materials Ordered") return true;
  return hasValue(order.rawMondayTopPanel) || hasValue(order.stepNote);
}

export function buildWorkshopHandoff(order: UiOrder): WorkshopHandoff {
  const missing: string[] = [];
  const present: string[] = [];
  const invoiceExpectation = invoiceExpectationForOrder(order);

  if (hasValue(order.rawMondayItem) && order.product !== "Other") present.push("item/spec");
  else missing.push("item/spec");

  if (hasValue(order.shipDate)) present.push("due date");
  else missing.push("due date");

  if (deliveryKnown(order)) present.push("delivery/collection");
  else missing.push("delivery/collection");

  if (hasProductionStep(order)) present.push("current step");
  else missing.push("current step");

  if (order.rawMondayItem === "Sample") {
    if (hasValue(order.notes) || hasValue(order.shipDate)) present.push("sample follow-up cue");
    else missing.push("sample follow-up cue");
  }

  if (invoiceExpectation.requiresInvoice) {
    if (hasValue(order.xero) || hasValue(order.xeroInvoiceNumber)) present.push("Xero/invoice link");
    else missing.push("Xero/invoice link");
  } else {
    present.push(invoiceExpectation.label);
  }

  if (hasValue(order.notes)) present.push("notes/context");

  const criticalMissing = missing.filter((item) => item !== "Xero/invoice link" && item !== "notes/context");
  if (criticalMissing.length >= 2) {
    return {
      level: "blocked",
      label: "Needs detail",
      summary: `${criticalMissing.length} workshop details missing`,
      missing,
      present,
      next: `Confirm ${criticalMissing.slice(0, 2).join(" + ")} before Nick/Dylan trust this job.`,
    };
  }
  if (missing.length > 0) {
    return {
      level: "check",
      label: "Check before work",
      summary: `${missing.length} detail${missing.length === 1 ? "" : "s"} to confirm`,
      missing,
      present,
      next: `Quick check: ${missing.slice(0, 2).join(" + ")}.`,
    };
  }
  return {
    level: "ready",
    label: "Ready for workshop",
    summary: "Enough detail for Nick/Dylan to act",
    missing,
    present,
    next: "Proceed from the current step; keep Tuesday and Monday aligned if reality changes.",
  };
}

export function summarizeWorkshopHandoffs(orders: UiOrder[]) {
  const active = orders.filter((order) => !["Collected", "Finished", "Shipped"].includes(order.status));
  const handoffs = active.map((order) => buildWorkshopHandoff(order));
  return {
    active: active.length,
    ready: handoffs.filter((handoff) => handoff.level === "ready").length,
    check: handoffs.filter((handoff) => handoff.level === "check").length,
    blocked: handoffs.filter((handoff) => handoff.level === "blocked").length,
  };
}
