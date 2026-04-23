/**
 * Monday → app mapping for the Orders NEW board (id 18404972673).
 *
 * Every transformed order carries the raw Monday enum values alongside the
 * derived UI fields so the raw state is always inspectable.
 *
 * See /Users/mack-mini/.claude/plans/yes-stay-in-plan-expressive-moore.md
 * for the full mapping contract this file implements.
 */

import type { MondayItem, MondayColumnValue } from "./client";
import { computeCurrentStep, deriveStepNote } from "./step-derivation";

// Column IDs on the Orders NEW board — verified live on 2026-04-23.
export const ORDERS_COLUMNS = {
  name: "name",
  invoice: "link_mm1qd1hh",
  item: "color_mm1qc8cf",
  qty: "numeric_mm1q5n23",
  status: "color_mm1q7asg",
  topPanel: "color_mm1q4b9n",
  legs: "color_mm1qat53",
  ordered: "date_mm1qe4fv",
  deadline: "timerange_mm1qfch5",
  finished: "date_mm1qm1e8",
  estHours: "numeric_mm1q4dan",
  value: "numeric_mm1qe008",
  freightRef: "text_mm1qrsmm",
  deliveryLocation: "text_mm1q40np",
} as const;

// Monday Item → app product bucket.
// "Table" → TABLE_STEPS, "Panel" → PANEL_STEPS, "Other" → no step timeline.
export const PRODUCT_TYPE_MAP: Record<string, "Table" | "Panel" | "Other"> = {
  Table: "Table",
  "Table + bench": "Table",
  Console: "Table",
  Chair: "Table",
  Sample: "Table",
  Custom: "Table",
  Panel: "Panel",
  Flooring: "Panel",
  Decking: "Panel",
  Timber: "Panel",
  "Rough Sawn": "Panel",
  EcoBeans: "Other",
  Leather: "Other",
};

// Monday Status → app status enum (UI display).
export const STATUS_MAP: Record<
  string,
  "Not Started" | "In Production" | "Finished" | "Collected"
> = {
  Quoting: "Not Started",
  "To Process": "Not Started",
  "Materials Ordered": "Not Started",
  "Materials Ready": "In Production",
  "In production": "In Production",
  Booked: "In Production",
  Finished: "Finished",
  Collected: "Collected",
};

export type UiOrder = {
  id: number;
  customer: string;
  product: "Table" | "Panel" | "Other";
  // Raw Monday enum values — never transformed. Used for debugging and tooltips.
  rawMondayItem: string | null;
  rawMondayStatus: string | null;
  rawMondayTopPanel: string | null;
  rawMondayLegs: string | null;
  value: number | null;
  status: "Not Started" | "In Production" | "Finished" | "Collected";
  // Which step-list applies. Resolved in the UI to TABLE_STEPS or PANEL_STEPS.
  stepsKey: "TABLE_STEPS" | "PANEL_STEPS" | null;
  // DISPLAY-ONLY — inferred from Monday state. Not source of truth.
  currentStep: number;
  // DISPLAY-ONLY — human summary of current state.
  stepNote: string;
  shipDate: string | null;
  xero: string | null;
  notes: string;
};

export type TransformWarning = {
  itemId: string;
  customer: string;
  kind:
    | "unknown_product_type"
    | "unknown_status"
    | "unknown_step_combination"
    | "malformed_deadline"
    | "malformed_value";
  detail: string;
};

function getColumn(
  item: MondayItem,
  columnId: string
): MondayColumnValue | undefined {
  return item.column_values.find((c) => c.id === columnId);
}

function textOf(item: MondayItem, columnId: string): string | null {
  const col = getColumn(item, columnId);
  const raw = col?.text?.trim();
  return raw ? raw : null;
}

function parseValue(item: MondayItem, warnings: TransformWarning[]): number | null {
  const raw = textOf(item, ORDERS_COLUMNS.value);
  if (raw == null) return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) {
    warnings.push({
      itemId: item.id,
      customer: item.name,
      kind: "malformed_value",
      detail: `Could not parse Value "${raw}" as number`,
    });
    return null;
  }
  return n;
}

function parseShipDate(
  item: MondayItem,
  warnings: TransformWarning[]
): string | null {
  // Monday timeline text format: "YYYY-MM-DD - YYYY-MM-DD" (same value if single-day).
  const raw = textOf(item, ORDERS_COLUMNS.deadline);
  if (raw == null) return null;
  const parts = raw.split(" - ");
  const end = parts.length === 2 ? parts[1] : parts[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    warnings.push({
      itemId: item.id,
      customer: item.name,
      kind: "malformed_deadline",
      detail: `Could not parse Deadline "${raw}" into an end date`,
    });
    return null;
  }
  return end;
}

function parseXeroLink(item: MondayItem): string | null {
  const raw = textOf(item, ORDERS_COLUMNS.invoice);
  if (raw == null) return null;
  // Two observed shapes:
  //   "INV-1025 - https://in.xero.com/..."  (with label prefix)
  //   "https://in.xero.com/..."             (bare URL)
  const match = raw.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function mapProduct(
  raw: string | null,
  itemId: string,
  customer: string,
  warnings: TransformWarning[]
): "Table" | "Panel" | "Other" {
  if (raw == null) {
    warnings.push({
      itemId,
      customer,
      kind: "unknown_product_type",
      detail: "Item column empty",
    });
    return "Other";
  }
  const mapped = PRODUCT_TYPE_MAP[raw];
  if (mapped === undefined) {
    warnings.push({
      itemId,
      customer,
      kind: "unknown_product_type",
      detail: `Unknown product type "${raw}"`,
    });
    return "Other";
  }
  return mapped;
}

function mapStatus(
  raw: string | null,
  itemId: string,
  customer: string,
  warnings: TransformWarning[]
): UiOrder["status"] {
  if (raw == null) {
    warnings.push({
      itemId,
      customer,
      kind: "unknown_status",
      detail: "Status column empty",
    });
    return "Not Started";
  }
  const mapped = STATUS_MAP[raw];
  if (mapped === undefined) {
    warnings.push({
      itemId,
      customer,
      kind: "unknown_status",
      detail: `Unknown status "${raw}"`,
    });
    return "Not Started";
  }
  return mapped;
}

export function transformMondayOrder(item: MondayItem): {
  order: UiOrder;
  warnings: TransformWarning[];
} {
  const warnings: TransformWarning[] = [];

  const rawMondayItem = textOf(item, ORDERS_COLUMNS.item);
  const rawMondayStatus = textOf(item, ORDERS_COLUMNS.status);
  const rawMondayTopPanel = textOf(item, ORDERS_COLUMNS.topPanel);
  const rawMondayLegs = textOf(item, ORDERS_COLUMNS.legs);

  const product = mapProduct(rawMondayItem, item.id, item.name, warnings);
  const status = mapStatus(rawMondayStatus, item.id, item.name, warnings);
  const stepsKey =
    product === "Table" ? "TABLE_STEPS" : product === "Panel" ? "PANEL_STEPS" : null;

  const { currentStep, stepNote, warnings: stepWarnings } = deriveStepFields({
    product,
    status,
    rawMondayStatus,
    rawMondayTopPanel,
    rawMondayLegs,
    itemId: item.id,
    customer: item.name,
  });
  warnings.push(...stepWarnings);

  return {
    order: {
      id: Number(item.id),
      customer: item.name,
      product,
      rawMondayItem,
      rawMondayStatus,
      rawMondayTopPanel,
      rawMondayLegs,
      value: parseValue(item, warnings),
      status,
      stepsKey,
      currentStep,
      stepNote,
      shipDate: parseShipDate(item, warnings),
      xero: parseXeroLink(item),
      notes: "",
    },
    warnings,
  };
}

function deriveStepFields(args: {
  product: UiOrder["product"];
  status: UiOrder["status"];
  rawMondayStatus: string | null;
  rawMondayTopPanel: string | null;
  rawMondayLegs: string | null;
  itemId: string;
  customer: string;
}): {
  currentStep: number;
  stepNote: string;
  warnings: TransformWarning[];
} {
  const warnings: TransformWarning[] = [];
  const currentStep = computeCurrentStep({
    product: args.product,
    rawMondayStatus: args.rawMondayStatus,
    rawMondayTopPanel: args.rawMondayTopPanel,
    rawMondayLegs: args.rawMondayLegs,
    onUnknown: (detail) =>
      warnings.push({
        itemId: args.itemId,
        customer: args.customer,
        kind: "unknown_step_combination",
        detail,
      }),
  });
  const stepNote = deriveStepNote({
    product: args.product,
    status: args.status,
    rawMondayTopPanel: args.rawMondayTopPanel,
    rawMondayLegs: args.rawMondayLegs,
  });
  return { currentStep, stepNote, warnings };
}

export function transformAllOrders(items: MondayItem[]): {
  orders: UiOrder[];
  warnings: TransformWarning[];
} {
  const orders: UiOrder[] = [];
  const warnings: TransformWarning[] = [];
  for (const item of items) {
    const { order, warnings: itemWarnings } = transformMondayOrder(item);
    orders.push(order);
    warnings.push(...itemWarnings);
  }
  return { orders, warnings };
}
