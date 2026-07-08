import "server-only";

import { listRecentXeroInvoiceSummaries, type XeroInvoiceSummary } from "@/lib/xero/read-only";
import type { DayKey, Person } from "@/lib/monday/production-plan-mapping";
import { listPaymentLifecycleByOrderIds, type OrderPaymentLifecycle } from "@/lib/production/order-payment-lifecycle";
import {
  buildDiningTableProcessPlan,
  nextOwnerWorkshopDate,
  supplierReadyDateForText,
  supplierWaitDetailWithPrecisionForText,
  WORKSHOP_PROCESS_RULES,
  type WorkshopProcessTask,
} from "@/lib/production/workshop-process-rules";

export type IntakeReviewState = "awaiting_payment" | "paid_needs_review" | "needs_review" | "approved";
export type IntakeTaskOwner = "Nick" | "Dylan" | "Guido" | "Other";

export type IntakeTaskDraft = {
  id: string;
  title: string;
  detail: string;
  owner: IntakeTaskOwner;
  person: Person;
  scheduledDate: string;
  day: DayKey;
  estimatedHours: number;
  sortOrder: number;
};

export type IntakeLineItem = {
  description: string;
  quantity: number | null;
  unitAmount: number | null;
  lineAmount: number | null;
};

export type IntakePaymentEvidence = {
  id: string;
  sourceSystem: string;
  paymentDate: string | null;
  amount: number;
  payerName: string | null;
  reference: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  matchReasons: string[];
};

export type IntakeFinancialDocument = {
  id: string;
  role: string;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  status: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  total: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  leadTimeWeeks: number | null;
  leadTimeSource: string | null;
};

export type ProductionOrderTask = {
  id: string;
  orderId: string;
  title: string;
  detail: string | null;
  owner: IntakeTaskOwner;
  person: Person;
  scheduledDate: string;
  day: DayKey;
  estimatedHours: number;
  status: "planned" | "done" | "deleted";
  completedAt: string | null;
  completedBy: string | null;
};

export type OrderIntakeItem = {
  orderId: string;
  reviewId: string;
  customerName: string;
  orderStatus: string;
  paidOnDate: string | null;
  orderDueDate: string | null;
  productSummary: string | null;
  itemCategory: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceDate: string | null;
  invoiceDueDate: string | null;
  xeroUrl: string | null;
  total: number | null;
  amountPaid: number | null;
  amountDue: number | null;
  paymentLifecycle: OrderPaymentLifecycle | null;
  reviewState: IntakeReviewState;
  stateLabel: string;
  stateDetail: string;
  sourceSummary: Record<string, unknown>;
  financialDocuments: IntakeFinancialDocument[];
  lineItems: IntakeLineItem[];
  payments: IntakePaymentEvidence[];
  suggestedTasks: IntakeTaskDraft[];
  draftTasks: IntakeTaskDraft[];
  approvedTasks: ProductionOrderTask[];
  approvedAt: string | null;
  lastReconciledAt: string | null;
};

type SupabaseConfig = { url: string; serviceKey: string };
type SupabaseOrder = {
  id: string;
  customer_name: string;
  status: string;
  paid_on_date: string | null;
  due_date: string | null;
  product_summary: string | null;
  item_category: string | null;
  xero_invoice_number: string | null;
};

const ORDER_SELECT = "id,customer_name,status,paid_on_date,due_date,product_summary,item_category,xero_invoice_number,total_incl_gst";
type IntakeReviewRow = {
  id: string;
  order_id: string;
  review_state: IntakeReviewState;
  source_summary: Record<string, unknown> | null;
  suggested_tasks: unknown;
  draft_tasks: unknown;
  approved_at: string | null;
  approved_by: string | null;
  last_reconciled_at: string | null;
};
type FinancialDocumentRow = {
  id: string;
  order_id: string;
  xero_invoice_number: string | null;
  xero_invoice_id: string | null;
  xero_invoice_url: string | null;
  contact_name: string | null;
  status: string | null;
  issued_at: string | null;
  due_at: string | null;
  total: number | null;
  amount_paid: number | null;
  amount_due: number | null;
  document_role?: string | null;
  lifecycle_stage?: string | null;
  sent_channel?: string | null;
  line_items: IntakeLineItem[] | null;
  raw_xero?: unknown;
};
type PaymentRow = {
  id: string;
  order_id: string | null;
  source_system: string;
  external_transaction_id: string | null;
  payment_date: string | null;
  amount: number;
  payer_name: string | null;
  bank_reference: string | null;
  bank_particulars: string | null;
  bank_code: string | null;
  xero_invoice_number: string | null;
  match_status: string;
  match_confidence: number | null;
  match_reasons: unknown;
};
type ProductionTaskRow = {
  id: string;
  order_id: string;
  title: string;
  detail: string | null;
  owner: IntakeTaskOwner;
  scheduled_date: string;
  day_key: DayKey;
  estimated_hours: number;
  status: "planned" | "done" | "deleted";
  completed_at: string | null;
  completed_by: string | null;
};

type ReconcileResult = {
  ok: true;
  scanned: number;
  accepted: number;
  ignored: number;
  createdOrUpdated: number;
  items: OrderIntakeItem[];
  warnings: string[];
};

function supabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) throw new Error("Supabase service-role env is not configured for order intake.");
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = supabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase order-intake request failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) as T : null as T;
}

function quote(value: string) {
  return encodeURIComponent(value);
}

function nzDate(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function normalizeInvoiceNumber(value: string | null | undefined) {
  const match = value?.match(/\bINV-?\d+\b/i);
  return match ? match[0].toUpperCase().replace(/^INV(\d)/, "INV-$1") : null;
}

function isCustomerOrderInvoice(invoice: XeroInvoiceSummary) {
  const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
  const status = (invoice.status || "").toUpperCase();
  const type = (invoice.type || "").toUpperCase();
  if (!invoiceNumber) return false;
  if (type && type !== "ACCREC") return false;
  return status === "AUTHORISED" || status === "AUTHORIZED" || status === "PAID";
}

function lineItems(invoice: XeroInvoiceSummary): IntakeLineItem[] {
  return (invoice.lineItems || [])
    .map((line) => ({
      description: String(line.description || "").trim(),
      quantity: typeof line.quantity === "number" ? line.quantity : null,
      unitAmount: typeof line.unitAmount === "number" ? line.unitAmount : null,
      lineAmount: typeof line.lineAmount === "number" ? line.lineAmount : null,
    }))
    .filter((line) => line.description);
}

function invoiceSearchText(invoice: XeroInvoiceSummary) {
  return [
    invoice.invoiceNumber,
    invoice.reference,
    productSummary(invoice),
    ...lineItems(invoice).map((line) => line.description),
  ].filter(Boolean).join("\n");
}

function isShopifySettledSupplyText(text: string) {
  const normalized = text.toLowerCase();
  return /ecobeans|bean\s*bag|beanbag|bag fill|filling/.test(normalized)
    && /shopify/.test(normalized)
    && /paid|credit|credited|refund|refunded/.test(normalized);
}

function isShopifySettledSupplyInvoice(invoice: XeroInvoiceSummary) {
  return isShopifySettledSupplyText(invoiceSearchText(invoice));
}

function isBalanceInvoice(invoice: XeroInvoiceSummary) {
  const text = invoiceSearchText(invoice).toLowerCase();
  return /\bbalance\b/.test(text) && (
    /deposit\s+paid/.test(text)
    || /due\s+upon\s+completion/.test(text)
    || /before\s+delivery/.test(text)
  );
}

function referencedInvoiceNumbers(invoice: XeroInvoiceSummary) {
  const current = normalizeInvoiceNumber(invoice.invoiceNumber);
  return Array.from(invoiceSearchText(invoice).matchAll(/\bINV-?\d+\b/gi))
    .map((match) => normalizeInvoiceNumber(match[0]))
    .filter((value): value is string => Boolean(value && value !== current));
}

function inferCategory(invoice: XeroInvoiceSummary) {
  const items = lineItems(invoice);
  const text = items.map((line) => line.description).join("\n").toLowerCase();
  const firstLineText = items.map((line) => line.description.split(/\r?\n/)[0] || "").join("\n").toLowerCase();
  if (/ecobeans|bean\s*bag|beanbag|bag fill|filling|consumable|hardware/.test(text)) return "Supply";
  if (/\bsamples?\b|sample panel|colour sample|color sample|engrave/.test(firstLineText) || /sample panel|colour sample|color sample|engrave/.test(text)) return "Sample";
  if (/benchtop|bench top|panel|plank|board|timber|slab|raw|uncoated|dressed/.test(text)) return "Panel";
  if (/dining table|\btable\b|\bbench\b|base|steel|leg/.test(text)) return "Table";
  return "Other";
}

function suggestionSignature(invoice: XeroInvoiceSummary) {
  return JSON.stringify({
    version: 3,
    category: inferCategory(invoice),
    items: lineItems(invoice).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      lineAmount: line.lineAmount,
    })),
  });
}

function productSummary(invoice: XeroInvoiceSummary) {
  const items = lineItems(invoice);
  if (items.length === 0) return `Order from ${invoice.invoiceNumber || "Xero invoice"}`;
  return items.map((line) => line.description.split("\n")[0]).join(" + ").slice(0, 240);
}

function promisedLeadTimeWeeksFromText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const patterns = [
    /(?:lead\s*time|ready|completion|production|dispatch|delivery)[^.!?\n]{0,90}?(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:weeks?|wks?)\b/i,
    /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:weeks?|wks?)\b[^.!?\n]{0,90}?(?:lead\s*time|from\s+(?:deposit|payment|paid)|ready|completion|production|dispatch|delivery)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const first = Number(match[1]);
    const second = match[2] ? Number(match[2]) : null;
    const weeks = Number.isFinite(second ?? NaN) ? Math.max(first, second as number) : first;
    if (Number.isFinite(weeks) && weeks > 0 && weeks <= 52) return Math.round(weeks * 2) / 2;
  }
  return null;
}

function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (typeof value === "number" || typeof value === "boolean") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap((item) => collectStrings(item, depth + 1));
  return [];
}

function financialDocumentLeadTime(document: FinancialDocumentRow): { weeks: number | null; source: string | null } {
  const candidates = [
    ...collectStrings(document.raw_xero),
    ...(document.line_items || []).flatMap((line) => [line.description]),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const weeks = promisedLeadTimeWeeksFromText(candidate);
    if (weeks) return { weeks, source: candidate.slice(0, 180) };
  }
  return { weeks: null, source: null };
}

function dayKeyForDate(date: Date): DayKey {
  const day = date.getDay();
  if (day === 2) return "tuesday";
  if (day === 3) return "wednesday";
  if (day === 4) return "thursday";
  if (day === 5) return "friday";
  return "monday";
}

function nextWorkshopDay(from = new Date()) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  while (![1, 2, 3, 4, 5].includes(date.getDay())) date.setDate(date.getDate() + 1);
  return date;
}

function addWorkshopDays(from: Date, count: number) {
  const date = new Date(from);
  let remaining = count;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if ([1, 2, 3, 4, 5].includes(date.getDay())) remaining -= 1;
  }
  return date;
}

function isAvailableWorkshopDay(owner: IntakeTaskOwner, date: Date) {
  return nextOwnerWorkshopDate(owner, date).getTime() === new Date(date).setHours(0, 0, 0, 0);
}

function nextAvailableDate(owner: IntakeTaskOwner, from: Date) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  while (!isAvailableWorkshopDay(owner, date)) date.setDate(date.getDate() + 1);
  return date;
}

function afterTask(owner: IntakeTaskOwner, previous: Date, workshopDays = 1) {
  return nextAvailableDate(owner, addWorkshopDays(previous, workshopDays));
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function task(id: string, title: string, detail: string, owner: IntakeTaskOwner, date: Date, estimatedHours: number, sortOrder: number): IntakeTaskDraft {
  const safeDate = nextAvailableDate(owner, date);
  const person: Person = owner === "Dylan" ? "dylan" : "nick";
  return { id, title, detail, owner, person, scheduledDate: iso(safeDate), day: dayKeyForDate(safeDate), estimatedHours, sortOrder };
}

function processTaskToDraft(task: WorkshopProcessTask): IntakeTaskDraft {
  const date = new Date(`${task.scheduledDate}T12:00:00`);
  const owner: IntakeTaskOwner = task.owner === "Nick" || task.owner === "Dylan" || task.owner === "Guido" ? task.owner : "Other";
  const person: Person = owner === "Dylan" ? "dylan" : "nick";
  return {
    id: task.key,
    title: task.title,
    detail: task.detail,
    owner,
    person,
    scheduledDate: task.scheduledDate,
    day: dayKeyForDate(date),
    estimatedHours: task.estimatedHours,
    sortOrder: task.sortOrder,
  };
}

export function buildIntakeSuggestedTasks(input: { invoice: XeroInvoiceSummary; orderId: string; paid: boolean }): IntakeTaskDraft[] {
  const start = nextWorkshopDay();
  const category = inferCategory(input.invoice);
  const text = lineItems(input.invoice).map((line) => line.description).join("\n").toLowerCase();
  if (isBalanceInvoice(input.invoice)) return [];
  const supplyOnly = category === "Panel"
    && /raw|uncoated|dressed|plank|board|timber|panel/.test(text)
    && !/blackwash|whitewash|clear\s*coat|oil|lacquer|polyurethane|sand\s+and\s+coat|table|bench|benchtop/.test(text);
  if (category === "Supply") {
    const specDate = nextAvailableDate("Nick", start);
    const packDate = afterTask("Dylan", specDate);
    const updateDate = nextAvailableDate("Nick", packDate);
    return [
      task(`${input.orderId}:order-loaded`, "Order Loaded", "Guido checks invoice/spec/payment/customer due promise/supplier needs/delivery method before workshop trust.", "Guido", specDate, 0.5, 10),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Pick, count, label, and pack the supplied goods against the invoice.", "Dylan", packDate, 0.75, 20),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm pickup/courier details and send the customer update.", "Nick", updateDate, 0.25, 30),
    ];
  }
  if (supplyOnly) {
    const specDate = nextAvailableDate("Nick", start);
    const timberDate = afterTask("Dylan", specDate);
    const packDate = afterTask("Nick", timberDate);
    const updateDate = nextAvailableDate("Nick", packDate);
    return [
      task(`${input.orderId}:order-loaded`, "Order Loaded", "Guido checks invoice/spec/payment/customer due promise/supplier needs/delivery method before workshop trust.", "Guido", specDate, 0.5, 10),
      task(`${input.orderId}:timber-pulled`, "Timber pulled", "Pull and check the plank/panel/timber items against the invoice line items.", "Dylan", timberDate, 1.5, 20),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Final count/quality check, label the pack, and prepare it for collection or delivery.", "Nick", packDate, 0.5, 30),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm collection/delivery details with the customer.", "Nick", updateDate, 0.25, 40),
    ];
  }
  if (category === "Sample") {
    const specDate = nextAvailableDate("Nick", start);
    const packDate = afterTask("Dylan", specDate);
    const updateDate = afterTask("Nick", packDate);
    return [
      task(`${input.orderId}:order-loaded`, "Order Loaded", "Guido checks invoice/spec/payment/customer due promise/supplier needs/delivery method before workshop trust.", "Guido", specDate, 0.5, 10),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Prepare, label, photograph, and pack the sample set.", "Dylan", packDate, 1, 20),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm courier/collection and set the follow-up date.", "Nick", updateDate, 0.5, 30),
    ];
  }
  const specDate = nextAvailableDate("Nick", start);
  const first = task(`${input.orderId}:order-loaded`, "Order Loaded", "Guido checks invoice/spec/payment/customer due promise/supplier needs/delivery method before workshop trust.", "Guido", specDate, 1, 10);
  if (category === "Panel") {
    const poDate = nextAvailableDate("Nick", specDate);
    const readyDate = supplierReadyDateForText(text, poDate);
    const cutStart = readyDate ? nextAvailableDate("Dylan", readyDate) : afterTask("Dylan", specDate);
    const cutDate = cutStart;
    const sandDate = afterTask("Dylan", cutDate);
    const qcDate = afterTask("Nick", sandDate);
    const packDate = nextAvailableDate("Dylan", qcDate);
    return [
      first,
      task(`${input.orderId}:cut-prep`, "Cut / machine / prep", `Prepare the panel or benchtop blank and resolve stock/yield questions.${supplierWaitDetailWithPrecisionForText(text)}`, "Dylan", cutDate, 1, 20),
      task(`${input.orderId}:sand-coat`, "Sand and coat", "Surface prep and primary finish stage.", "Dylan", sandDate, 1, 30),
      task(`${input.orderId}:qc-photos`, "QC + photos", "Final proof photos and quality check before packing.", "Nick", qcDate, 1, 40),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Package safely and confirm courier or collection details.", "Dylan", packDate, 0.5, 50),
    ];
  }
  if (category === "Table") {
    return buildDiningTableProcessPlan({ orderId: input.orderId, text, startIso: iso(start) }).map(processTaskToDraft);
  }
  const finalCoat = /blackwash|whitewash|colour|color/.test(text) ? "4th coat (blackwash final)" : "3rd coat (clear final)";
  const timberDate = afterTask("Dylan", specDate);
  const cutDate = afterTask("Nick", timberDate);
  const sandDate = afterTask("Dylan", cutDate);
  const finalDate = afterTask("Dylan", sandDate);
  const qcDate = afterTask("Nick", finalDate);
  const packDate = nextAvailableDate("Dylan", qcDate);
  const freightDate = nextAvailableDate("Nick", packDate);
  return [
    first,
    task(`${input.orderId}:timber-pulled`, "Timber pulled", "Pull/check timber against invoice and flag material or PO gaps before workshop work starts.", "Dylan", timberDate, 1, 20),
    task(`${input.orderId}:stress-cuts`, "Stress cuts", "Break down timber and let movement show before final machining.", "Dylan", timberDate, 1, 30),
    task(`${input.orderId}:cut-prep`, "Cut / machine / prep", "Machine components and resolve construction details before finish work starts.", "Nick", cutDate, 1.5, 40),
    task(`${input.orderId}:sand-coat`, "Sand and coat", "Surface prep and first/primary finish stage.", "Dylan", sandDate, 1, 50),
    task(`${input.orderId}:final-coat`, finalCoat, "Complete the final finish stage required by the invoice spec.", "Dylan", finalDate, 1, 60),
    task(`${input.orderId}:qc-photos`, "QC + photos", "Final proof photos, spec check, and customer-ready quality review.", "Nick", qcDate, 1, 70),
    task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Pack, protect, and prepare for delivery or collection.", "Dylan", packDate, 0.75, 80),
    task(`${input.orderId}:book-freight`, "Book freight", "Book freight or confirm local delivery/collection details.", "Nick", freightDate, 0.5, 90),
  ];
}

function cleanTasks(value: unknown): IntakeTaskDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<IntakeTaskDraft>;
    const title = String(item.title || "").trim();
    const scheduledDate = String(item.scheduledDate || "").slice(0, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return [];
    const owner: IntakeTaskOwner = item.owner === "Dylan" || item.owner === "Guido" || item.owner === "Other" ? item.owner : "Nick";
    const date = new Date(`${scheduledDate}T12:00:00`);
    const person: Person = owner === "Dylan" ? "dylan" : "nick";
    return [{
      id: String(item.id || `task-${index + 1}`),
      title,
      detail: String(item.detail || ""),
      owner,
      person,
      scheduledDate,
      day: dayKeyForDate(date),
      estimatedHours: Math.max(0, Math.round(Number(item.estimatedHours || 1) * 2) / 2),
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
    }];
  });
}

function reviewLabel(state: IntakeReviewState) {
  if (state === "paid_needs_review") return "Paid - plan needed";
  if (state === "needs_review") return "Needs review";
  if (state === "approved") return "Approved";
  return "Awaiting payment";
}

function reviewDetail(state: IntakeReviewState) {
  if (state === "paid_needs_review") return "Payment evidence is matched or bank-visible. Tuesday should approve the task plan.";
  if (state === "needs_review") return "Payment or invoice evidence needs a human check before approval.";
  if (state === "approved") return "Approved Supabase production tasks have been created.";
  return "Invoice is authorised in Xero. Waiting for bank-visible or exact payment evidence.";
}

function hasBankVisiblePayment(paymentEvidence: IntakePaymentEvidence[]) {
  return paymentEvidence.some((payment) => payment.matchStatus === "ignored" && payment.matchReasons.includes("pending_akahu_transaction"));
}

async function rowsByOrder<T extends { order_id: string | null }>(table: string, orderIds: string[], select = "*") {
  if (orderIds.length === 0) return [] as T[];
  return supabaseRequest<T[]>(`${table}?select=${select}&order_id=in.(${orderIds.map(quote).join(",")})`);
}

function summaryString(summary: Record<string, unknown> | null | undefined, key: string) {
  const value = summary?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function documentRole(document: FinancialDocumentRow | null, lifecycle?: OrderPaymentLifecycle | null, sourceSummary?: Record<string, unknown> | null) {
  const invoice = normalizeInvoiceNumber(document?.xero_invoice_number);
  const depositInvoice = normalizeInvoiceNumber(lifecycle?.depositInvoiceNumber || summaryString(sourceSummary, "invoice_number") || summaryString(sourceSummary, "deposit_invoice_number"));
  const balanceInvoice = normalizeInvoiceNumber(lifecycle?.balanceInvoiceNumber || summaryString(sourceSummary, "balance_invoice_number"));
  if (invoice && balanceInvoice && invoice === balanceInvoice) return "balance";
  if (invoice && depositInvoice && invoice === depositInvoice) return "deposit";
  return String(document?.document_role || "primary").toLowerCase();
}

function chooseDisplayDocument(order: SupabaseOrder, documents: FinancialDocumentRow[], lifecycle: OrderPaymentLifecycle | null, sourceSummary?: Record<string, unknown> | null) {
  const orderDocuments = documents.filter((item) => item.order_id === order.id);
  const byInvoice = (invoice: string | null | undefined) => orderDocuments.find((item) => normalizeInvoiceNumber(item.xero_invoice_number) === normalizeInvoiceNumber(invoice)) || null;
  if (lifecycle?.paymentStage === "awaiting_balance_payment" || lifecycle?.paymentStage === "balance_authorised" || lifecycle?.paymentStage === "balance_paid") {
    const balance = byInvoice(lifecycle.balanceInvoiceNumber) || orderDocuments.find((item) => documentRole(item, lifecycle, sourceSummary) === "balance");
    if (balance) return balance;
  }
  return byInvoice(order.xero_invoice_number)
    || byInvoice(lifecycle?.depositInvoiceNumber)
    || orderDocuments.find((item) => documentRole(item, lifecycle, sourceSummary) === "deposit")
    || orderDocuments.find((item) => documentRole(item, lifecycle, sourceSummary) === "primary")
    || orderDocuments[0]
    || null;
}

function intakeFinancialDocuments(order: SupabaseOrder, documents: FinancialDocumentRow[], lifecycle: OrderPaymentLifecycle | null, sourceSummary: Record<string, unknown> | null): IntakeFinancialDocument[] {
  return documents
    .filter((item) => item.order_id === order.id)
    .map((item) => {
      const leadTime = financialDocumentLeadTime(item);
      return {
        id: item.id,
        role: documentRole(item, lifecycle, sourceSummary),
        invoiceNumber: item.xero_invoice_number,
        invoiceUrl: item.xero_invoice_url,
        status: item.status,
        issuedAt: item.issued_at,
        dueAt: item.due_at,
        total: item.total,
        amountPaid: item.amount_paid,
        amountDue: item.amount_due,
        leadTimeWeeks: leadTime.weeks,
        leadTimeSource: leadTime.source,
      };
    })
    .sort((left, right) => {
      const roleRank = (role: string) => role === "deposit" ? 0 : role === "primary" ? 1 : role === "balance" ? 2 : 3;
      return roleRank(left.role) - roleRank(right.role) || String(left.issuedAt || "").localeCompare(String(right.issuedAt || ""));
    });
}

function isShopifySettledSupplyOrder(order: SupabaseOrder, document: FinancialDocumentRow | null, sourceSummary: Record<string, unknown> | null) {
  return isShopifySettledSupplyText([
    order.customer_name,
    order.product_summary,
    order.item_category,
    order.xero_invoice_number,
    document?.xero_invoice_number,
    document?.contact_name,
    ...(document?.line_items || []).flatMap((line) => [line.description]),
    JSON.stringify(sourceSummary || {}),
  ].filter(Boolean).join("\n"));
}

function isUnsentDraftInvoiceDocument(document: FinancialDocumentRow | null, sourceSummary: Record<string, unknown> | null) {
  const status = String(document?.status || "").toUpperCase();
  if (status === "DRAFT") return true;
  const summaryText = JSON.stringify(sourceSummary || {}).toLowerCase();
  return /\bdraft\b/.test(summaryText) && /not\s+sent|hold\s+off|before\s+sending/.test(summaryText);
}

async function lifecycleRowsByOrder(orderIds: string[]) {
  try {
    return await listPaymentLifecycleByOrderIds(orderIds);
  } catch {
    return [];
  }
}

export async function listOrderIntakeItems(): Promise<OrderIntakeItem[]> {
  const reviews = await supabaseRequest<IntakeReviewRow[]>("order_intake_reviews?select=*&order=updated_at.desc&limit=40");
  const orderIds = reviews.map((review) => review.order_id);
  if (orderIds.length === 0) return [];
  const [orders, documents, payments, tasks, lifecycles] = await Promise.all([
    supabaseRequest<SupabaseOrder[]>(`orders?select=${ORDER_SELECT}&archived_at=is.null&id=in.(${orderIds.map(quote).join(",")})`),
    rowsByOrder<FinancialDocumentRow>("order_financial_documents", orderIds),
    rowsByOrder<PaymentRow>("order_payments", orderIds),
    rowsByOrder<ProductionTaskRow>("production_order_tasks", orderIds),
    lifecycleRowsByOrder(orderIds),
  ]);
  return reviews.flatMap((review) => {
    const order = orders.find((item) => item.id === review.order_id);
    if (!order) return [];
    const lifecycle = lifecycles.find((item) => item.orderId === order.id) || null;
    const sourceSummary = review.source_summary || {};
    const document = chooseDisplayDocument(order, documents, lifecycle, sourceSummary);
    if (isShopifySettledSupplyOrder(order, document, sourceSummary)) return [];
    if (isUnsentDraftInvoiceDocument(document, sourceSummary)) return [];
    const reviewTasks = cleanTasks(review.suggested_tasks);
    const draftTasks = cleanTasks(review.draft_tasks);
    const paymentEvidence = payments.filter((item) => item.order_id === order.id).map((payment) => ({
      id: payment.id,
      sourceSystem: payment.source_system,
      paymentDate: payment.payment_date,
      amount: payment.amount,
      payerName: payment.payer_name,
      reference: payment.bank_reference || payment.bank_particulars || payment.bank_code,
      matchStatus: payment.match_status,
      matchConfidence: payment.match_confidence,
      matchReasons: Array.isArray(payment.match_reasons) ? payment.match_reasons.map(String) : [],
    }));
    const hasPendingAkahu = hasBankVisiblePayment(paymentEvidence);
    const effectiveReviewState: IntakeReviewState = hasPendingAkahu && review.review_state === "awaiting_payment" ? "paid_needs_review" : review.review_state;
    const balanceOnly = (sourceSummary as Record<string, unknown>).order_role === "balance_invoice_only";
    return [{
      orderId: order.id,
      reviewId: review.id,
      customerName: order.customer_name,
      orderStatus: order.status,
      paidOnDate: order.paid_on_date,
      orderDueDate: order.due_date,
      productSummary: order.product_summary,
      itemCategory: order.item_category,
      invoiceNumber: document?.xero_invoice_number || order.xero_invoice_number,
      invoiceStatus: document?.status || null,
      invoiceDate: document?.issued_at || null,
      invoiceDueDate: document?.due_at || null,
      xeroUrl: document?.xero_invoice_url || null,
      total: document?.total ?? null,
      amountPaid: document?.amount_paid ?? null,
      amountDue: document?.amount_due ?? null,
      paymentLifecycle: lifecycle,
      reviewState: effectiveReviewState,
      stateLabel: balanceOnly ? "Balance invoice" : hasPendingAkahu && review.review_state === "awaiting_payment" ? WORKSHOP_PROCESS_RULES.trust.bankVisiblePaidLabel : reviewLabel(effectiveReviewState),
      stateDetail: balanceOnly ? "Balance due at completion before delivery. Production planning lives on the main order." : hasPendingAkahu && review.review_state === "awaiting_payment" ? WORKSHOP_PROCESS_RULES.trust.akahuSyncIssueLabel : reviewDetail(effectiveReviewState),
      sourceSummary,
      financialDocuments: intakeFinancialDocuments(order, documents, lifecycle, sourceSummary),
      lineItems: document?.line_items || [],
      payments: paymentEvidence,
      suggestedTasks: reviewTasks,
      draftTasks: draftTasks.length > 0 ? draftTasks : reviewTasks,
      approvedTasks: tasks.filter((item) => item.order_id === order.id && item.status !== "deleted").map((row) => ({
        id: row.id,
        orderId: row.order_id,
        title: row.title,
        detail: row.detail,
        owner: row.owner,
        person: row.owner === "Dylan" ? "dylan" : "nick",
        scheduledDate: row.scheduled_date,
        day: row.day_key,
        estimatedHours: row.estimated_hours,
        status: row.status,
        completedAt: row.completed_at,
        completedBy: row.completed_by,
      })),
      approvedAt: review.approved_at,
      lastReconciledAt: review.last_reconciled_at,
    }];
  });
}

async function paymentCandidates(invoiceNumber: string, orderId: string, total: number | null) {
  const rows = await supabaseRequest<PaymentRow[]>(`order_payments?select=*&or=(xero_invoice_number.eq.${quote(invoiceNumber)},order_id.eq.${quote(orderId)})`);
  const amountMatches = rows.filter((row) => {
    if (row.source_system !== "akahu") return false;
    return typeof total === "number" ? Math.abs(Number(row.amount) - total) < 0.02 : true;
  });
  const dedupeKey = (row: PaymentRow) => row.match_status === "ignored"
    ? `${row.source_system}:${row.match_status}:${row.xero_invoice_number || invoiceNumber}:${row.payment_date || "no-date"}:${row.amount}`
    : `${row.source_system}:${row.external_transaction_id || row.id}:${row.match_status}:${row.amount}`;
  const deduped = amountMatches.filter((row, index, list) => {
    const key = dedupeKey(row);
    return list.findIndex((candidate) => dedupeKey(candidate) === key) === index;
  });
  return {
    all: deduped,
    exact: deduped.filter((row) => row.match_status === "matched" && Number(row.match_confidence ?? 0) >= 0.98),
    probable: deduped.filter((row) => row.match_status === "probable"),
    bankVisible: deduped.filter((row) => row.match_status === "ignored" && Array.isArray(row.match_reasons) && row.match_reasons.map(String).includes("pending_akahu_transaction")),
  };
}

async function eventExists(orderId: string, eventType: string, invoiceNumber: string) {
  const rows = await supabaseRequest<Array<{ id: string }>>(`order_events?select=id&order_id=eq.${quote(orderId)}&event_type=eq.${quote(eventType)}&metadata->>invoice_number=eq.${quote(invoiceNumber)}&limit=1`);
  return rows.length > 0;
}

async function insertEvent(orderId: string, eventType: string, note: string, metadata: Record<string, unknown>) {
  if (metadata.invoice_number && await eventExists(orderId, eventType, String(metadata.invoice_number))) return;
  await supabaseRequest("order_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ order_id: orderId, event_type: eventType, actor: "Tuesday order intake", note, metadata }]),
  });
}

async function findOrderByInvoice(invoiceNumber: string) {
  const rows = await supabaseRequest<SupabaseOrder[]>(`orders?select=${ORDER_SELECT}&xero_invoice_number=eq.${quote(invoiceNumber)}&limit=1`);
  return rows[0] || null;
}

function normalizeContact(value: string | null | undefined) {
  return String(value || "").toLowerCase().replace(/\b(ltd|limited|co|company)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function sameContact(a: string | null | undefined, b: string | null | undefined) {
  const na = normalizeContact(a);
  const nb = normalizeContact(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function findBalanceParentOrder(invoice: XeroInvoiceSummary) {
  // 1. Explicit: the balance invoice references the parent's number in its text.
  if (isBalanceInvoice(invoice)) {
    for (const referencedInvoice of referencedInvoiceNumbers(invoice)) {
      const order = await findOrderByInvoice(referencedInvoice);
      if (order) return order;
    }
  }

  // 2. Convention (Guido: deposit+balance = ONE order, invoices usually issued
  //    back-to-back): the immediately-preceding invoice number belongs to the
  //    same customer, its order has a paid deposit, and this invoice is about
  //    half the recorded job total. Kidd INV-1052/1053 and Fowler
  //    INV-1131/1132 both failed the text-only path and created duplicate
  //    "new" orders.
  const currentNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
  const numeric = currentNumber?.match(/^INV-(\d+)$/i);
  if (numeric) {
    const previous = `INV-${Number(numeric[1]) - 1}`;
    const parent = await findOrderByInvoice(previous);
    if (parent && parent.paid_on_date && sameContact(parent.customer_name, invoice.contact)) {
      const parentTotal = Number((parent as { total_incl_gst?: number | null }).total_incl_gst ?? NaN);
      const invoiceTotal = Number(invoice.total ?? NaN);
      const halfMatches = Number.isFinite(parentTotal) && Number.isFinite(invoiceTotal) && Math.abs(parentTotal / 2 - invoiceTotal) <= Math.max(2, parentTotal * 0.02);
      if (halfMatches || isBalanceInvoice(invoice)) return parent;
    }
  }

  // 3. Duplicate of an already-paid order (e.g. a Xero invoice raised for a
  //    Shopify order that is already paid and recorded): same customer, same
  //    total, parent paid within the last 90 days.
  const invoiceTotal = Number(invoice.total ?? NaN);
  if (Number.isFinite(invoiceTotal) && invoice.contact) {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const candidates = await supabaseRequest<SupabaseOrder[]>(
      `orders?select=${ORDER_SELECT}&paid_on_date=gte.${cutoff}&archived_at=is.null&limit=200`,
      { method: "GET" }
    );
    for (const candidate of candidates || []) {
      const candidateTotal = Number((candidate as { total_incl_gst?: number | null }).total_incl_gst ?? NaN);
      if (!Number.isFinite(candidateTotal)) continue;
      if (Math.abs(candidateTotal - invoiceTotal) <= 1 && sameContact(candidate.customer_name, invoice.contact)) {
        return candidate;
      }
    }
  }
  return null;
}

function settledPaymentDate(payments: PaymentRow[]) {
  const dated = payments
    .filter((row) => row.source_system === "akahu" && row.match_status === "matched" && Number(row.match_confidence ?? 0) >= 0.98)
    .map((row) => dateOnly(row.payment_date))
    .filter((value): value is string => Boolean(value))
    .sort();
  return dated[0] || null;
}

function bankVisiblePaymentDate(payments: PaymentRow[]) {
  const dated = payments
    .filter((row) => row.source_system === "akahu" && row.match_status === "ignored" && Array.isArray(row.match_reasons) && row.match_reasons.map(String).includes("pending_akahu_transaction"))
    .map((row) => dateOnly(row.payment_date))
    .filter((value): value is string => Boolean(value))
    .sort();
  return dated[0] || null;
}

function hasScheduleReadyPaymentEvidence(payments: PaymentRow[]) {
  return Boolean(settledPaymentDate(payments) || bankVisiblePaymentDate(payments));
}

function shouldActivatePaidOrder(status: string | null | undefined) {
  const normalized = String(status || "").toLowerCase();
  return !["finished", "fulfilled", "complete", "completed", "cancelled", "canceled", "archived", "paused"].includes(normalized);
}

async function upsertOrderForInvoice(invoice: XeroInvoiceSummary, paid: boolean, paidOnDate: string | null = null) {
  const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
  if (!invoiceNumber) throw new Error("Cannot upsert order without invoice number");
  const existing = await findOrderByInvoice(invoiceNumber);
  const category = inferCategory(invoice);
  const invoicePatch = {
    item_category: category,
    product_summary: productSummary(invoice),
    spec: { source: "xero_invoice", line_items: lineItems(invoice) },
  };
  if (existing) {
    const paidPatch = paid && paidOnDate ? {
      ...invoicePatch,
      ...(shouldActivatePaidOrder(existing.status) ? {
        status: "active",
        next_action: "Paid. Nick to review and approve the production task plan.",
      } : {}),
      paid_on_date: paidOnDate,
    } : invoicePatch;
    const rows = await supabaseRequest<SupabaseOrder[]>(`orders?id=eq.${quote(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(paidPatch),
    });
    return rows[0] || { ...existing, ...invoicePatch };
  }
  const response = await supabaseRequest<SupabaseOrder[]>("orders?on_conflict=xero_invoice_number", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      order_code: invoiceNumber,
      customer_name: invoice.contact || "Unknown customer",
      status: paid && paidOnDate ? "active" : "awaiting_payment",
      priority: paid && paidOnDate ? "normal" : "cash",
      owner: "Nick",
      item_category: category,
      product_summary: productSummary(invoice),
      spec: { source: "xero_invoice", line_items: lineItems(invoice) },
      delivery: {},
      order_date: dateOnly(invoice.date) || nzDate(),
      paid_on_date: paid && paidOnDate ? paidOnDate : null,
      due_date: dateOnly(invoice.dueDate),
      total_incl_gst: invoice.total,
      currency: "NZD",
      xero_invoice_number: invoiceNumber,
      xero_invoice_id: invoice.invoiceId,
      xero_invoice_url: invoice.xeroUrl,
      source_system: "supabase",
      source_url: invoice.xeroUrl,
      next_action: paid && paidOnDate ? "Paid. Tuesday to review and approve the production task plan." : "Awaiting bank-visible or exact payment evidence before production planning.",
      notes: "Created by Tuesday order-intake reconciliation from authorised Xero invoice.",
    }]),
  });
  return response[0];
}

async function upsertInvoiceEvidence(orderId: string, invoice: XeroInvoiceSummary, options: { syncOrderItems?: boolean } = {}) {
  const syncOrderItems = options.syncOrderItems !== false;
  const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
  const items = lineItems(invoice);
  const documents = await supabaseRequest<FinancialDocumentRow[]>("order_financial_documents?on_conflict=xero_invoice_number", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      order_id: orderId,
      document_type: "xero_invoice",
      xero_invoice_number: invoiceNumber,
      xero_invoice_id: invoice.invoiceId,
      xero_invoice_url: invoice.xeroUrl,
      contact_name: invoice.contact,
      status: invoice.status,
      sent_at: invoice.sentToContact ? new Date().toISOString() : null,
      issued_at: dateOnly(invoice.date),
      due_at: dateOnly(invoice.dueDate),
      total: invoice.total,
      amount_paid: invoice.amountPaid,
      amount_due: invoice.amountDue,
      currency: "NZD",
      line_items: items,
      raw_xero: invoice,
      confidence: invoice.sentToContact ? "exact" : "probable",
    }]),
  });
  if (syncOrderItems && items.length > 0) {
    await supabaseRequest(`order_items?order_id=eq.${quote(orderId)}&sort_order=gte.1000&sort_order=lt.2000`, { method: "DELETE" });
    await supabaseRequest("order_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(items.map((item, index) => ({
        order_id: orderId,
        title: item.description.split("\n")[0].slice(0, 120),
        description: item.description,
        quantity: item.quantity ?? 1,
        unit_amount: item.unitAmount,
        line_amount: item.lineAmount,
        spec: { source: "xero_invoice", invoice_number: invoiceNumber },
        sort_order: 1000 + index,
      }))),
    });
  }
  await supabaseRequest("order_links?on_conflict=order_id,link_type,external_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ order_id: orderId, link_type: "xero_invoice", external_id: invoiceNumber, label: `Xero invoice ${invoiceNumber}`, url: invoice.xeroUrl, metadata: { invoice_number: invoiceNumber, invoice_id: invoice.invoiceId, status: invoice.status, total: invoice.total, amount_paid: invoice.amountPaid, amount_due: invoice.amountDue } }]),
  });
  return documents[0];
}

async function attachBalanceInvoiceToOrder(order: SupabaseOrder, invoice: XeroInvoiceSummary) {
  const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
  if (!invoiceNumber) throw new Error("Cannot attach balance invoice without invoice number");
  await upsertInvoiceEvidence(order.id, invoice, { syncOrderItems: false });
  const amountDue = typeof invoice.amountDue === "number" ? invoice.amountDue : null;
  const dueDate = dateOnly(invoice.dueDate);
  const balancePaid = amountDue !== null && amountDue <= 0.01;
  const nextAction = balancePaid
    ? `Balance paid on ${invoiceNumber}. Book freight/dispatch.`
    : `Await balance payment for ${invoiceNumber}${amountDue ? ` (${new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(amountDue)})` : ""}, then book freight/dispatch.`;
  // A balance invoice only moves the order into the payment stage when the
  // workshop is actually done. While the job is still active/in production/
  // paused, the balance is a note on the order, not its status — otherwise
  // in-flight jobs vanish from workshop lenses (Fowler/Kidd regression,
  // 2026-07-05).
  const workshopDone = ["finished", "awaiting_dispatch", "awaiting_payment", "complete"].includes(String(order.status || ""));
  const statusPatch = workshopDone
    ? { status: balancePaid ? "finished" : "awaiting_payment", due_date: dueDate || undefined }
    : {};
  await supabaseRequest(`orders?id=eq.${quote(order.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ...statusPatch,
      priority: balancePaid ? (order.status === "awaiting_payment" ? "normal" : undefined) : "cash",
      next_action: nextAction,
    }),
  });
  await insertEvent(
    order.id,
    invoice.sentToContact ? "balance_invoice_sent" : "balance_invoice_seen",
    balancePaid ? `Balance invoice ${invoiceNumber} is paid.` : `Balance invoice ${invoiceNumber} is awaiting payment.`,
    { invoice_number: invoiceNumber, amount_due: amountDue, due_date: dueDate },
  );
}

async function upsertReview(order: SupabaseOrder, invoice: XeroInvoiceSummary, state: IntakeReviewState, payments: PaymentRow[]) {
  const existing = await supabaseRequest<IntakeReviewRow[]>(`order_intake_reviews?select=*&order_id=eq.${quote(order.id)}&limit=1`);
  const previous = existing[0];
  const previousSuggested = previous ? cleanTasks(previous.suggested_tasks) : [];
  const previousDraft = previous ? cleanTasks(previous.draft_tasks) : [];
  const signature = suggestionSignature(invoice);
  const previousSignature = typeof previous?.source_summary?.suggestion_signature === "string" ? previous.source_summary.suggestion_signature : null;
  const generated = buildIntakeSuggestedTasks({ invoice, orderId: order.id, paid: state === "paid_needs_review" });
  const shouldRegenerate = previousSignature !== signature;
  const previousDraftWasJustSuggested = previousDraft.length === 0 || JSON.stringify(previousDraft) === JSON.stringify(previousSuggested);
  const suggested = !shouldRegenerate && previousSuggested.length > 0 ? previousSuggested : generated;
  const draft = previousDraft.length > 0 && (!shouldRegenerate || !previousDraftWasJustSuggested) ? previousDraft : suggested;
  const nextState: IntakeReviewState = previous?.review_state === "approved" ? "approved" : state;
  const promisedLeadTimeWeeks = promisedLeadTimeWeeksFromText(invoiceSearchText(invoice));
  const reviews = await supabaseRequest<IntakeReviewRow[]>("order_intake_reviews?on_conflict=order_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      order_id: order.id,
      review_state: nextState,
      source_summary: { source: "xero_authorised_invoice", payment_gate: "akahu_exact_match", invoice_number: order.xero_invoice_number, payment_count: payments.length, suggestion_signature: signature, item_category: inferCategory(invoice), ...(promisedLeadTimeWeeks ? { lead_time_weeks: promisedLeadTimeWeeks, lead_time_source: "Xero invoice text" } : {}) },
      suggested_tasks: suggested,
      draft_tasks: draft,
      last_reconciled_at: new Date().toISOString(),
    }]),
  });
  if (!previous) await insertEvent(order.id, "order_intake_created", "Pending new order created from authorised Xero invoice.", { invoice_number: order.xero_invoice_number, review_state: nextState });
  if (previous && previous.review_state !== nextState) await insertEvent(order.id, "order_intake_state_changed", `Order intake moved from ${previous.review_state} to ${nextState}.`, { invoice_number: order.xero_invoice_number, from: previous.review_state, to: nextState });
  return reviews[0];
}

export async function reconcileOrderIntake(): Promise<ReconcileResult> {
  const result = await listRecentXeroInvoiceSummaries({ includeLineItems: true, pageSize: 50 });
  const warnings: string[] = [];
  let accepted = 0;
  let ignored = 0;
  let createdOrUpdated = 0;
  for (const invoice of result.invoices) {
    if (!isCustomerOrderInvoice(invoice)) {
      ignored += 1;
      continue;
    }
    if (isShopifySettledSupplyInvoice(invoice)) {
      ignored += 1;
      continue;
    }
    accepted += 1;
    const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
    if (!invoiceNumber) continue;
    try {
      const balanceParent = await findBalanceParentOrder(invoice);
      if (balanceParent) {
        await attachBalanceInvoiceToOrder(balanceParent, invoice);
        createdOrUpdated += 1;
        continue;
      }
      if (isBalanceInvoice(invoice)) {
        warnings.push(`${invoiceNumber}: balance invoice could not be linked to an existing primary order; manual review needed.`);
        ignored += 1;
        continue;
      }
      const provisional = await upsertOrderForInvoice(invoice, false);
      await upsertInvoiceEvidence(provisional.id, invoice);
      const paymentEvidence = await paymentCandidates(invoiceNumber, provisional.id, invoice.total);
      const xeroPaidWithoutAkahu = (invoice.status || "").toUpperCase() === "PAID" && paymentEvidence.exact.length === 0;
      const paidOnDate = settledPaymentDate(paymentEvidence.exact) || bankVisiblePaymentDate(paymentEvidence.bankVisible);
      const paid = Boolean(paidOnDate);
      const order = paid ? await upsertOrderForInvoice(invoice, true, paidOnDate) : provisional;
      const needsPaymentReview = paymentEvidence.probable.length > 0 || xeroPaidWithoutAkahu;
      const state: IntakeReviewState = paid ? "paid_needs_review" : needsPaymentReview ? "needs_review" : "awaiting_payment";
      await upsertReview(order, invoice, state, paymentEvidence.all);
      createdOrUpdated += 1;
    } catch (error) {
      warnings.push(`${invoiceNumber}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: true, scanned: result.invoices.length, accepted, ignored, createdOrUpdated, items: await listOrderIntakeItems(), warnings };
}

export async function saveOrderIntakeDraft(orderId: string, tasks: unknown) {
  const draft = cleanTasks(tasks);
  if (draft.length === 0) throw new Error("Draft must include at least one task.");
  const rows = await supabaseRequest<IntakeReviewRow[]>(`order_intake_reviews?order_id=eq.${quote(orderId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ draft_tasks: draft }),
  });
  return rows[0];
}

type ApprovedTaskPatch = {
  done?: unknown;
  deleted?: unknown;
  scheduledDate?: unknown;
  day?: unknown;
  person?: unknown;
  estimatedHours?: unknown;
};

function isDayKey(value: unknown): value is DayKey {
  return value === "monday" || value === "tuesday" || value === "wednesday" || value === "thursday" || value === "friday";
}

function datePatch(value: unknown) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function ownerForPerson(person: unknown, fallback: IntakeTaskOwner): IntakeTaskOwner {
  if (person === "dylan") return "Dylan";
  if (person === "nick") return "Nick";
  return fallback;
}

export async function updateApprovedOrderIntakeTask(taskId: string, patch: unknown) {
  const id = String(taskId || "").trim();
  if (!id) throw new Error("Task id is required.");
  const rows = await supabaseRequest<ProductionTaskRow[]>(`production_order_tasks?select=*&id=eq.${quote(id)}&limit=1`);
  const existing = rows[0];
  if (!existing) throw new Error("Approved intake task not found.");
  const item = patch && typeof patch === "object" ? patch as ApprovedTaskPatch : {};
  const owner = Object.prototype.hasOwnProperty.call(item, "person") ? ownerForPerson(item.person, existing.owner) : existing.owner;
  const body: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(item, "person")) body.owner = owner;
  const scheduledDate = datePatch(item.scheduledDate);
  if (scheduledDate) {
    body.scheduled_date = scheduledDate;
    if (!isDayKey(item.day)) body.day_key = dayKeyForDate(new Date(`${scheduledDate}T12:00:00`));
  }
  if (isDayKey(item.day)) body.day_key = item.day;
  if (Object.prototype.hasOwnProperty.call(item, "estimatedHours")) {
    const hours = Math.max(0, Math.round(Number(item.estimatedHours || 0) * 2) / 2);
    if (Number.isFinite(hours)) body.estimated_hours = hours;
  }
  if ((item as { deleted?: unknown }).deleted === true) {
    body.status = "deleted";
    body.notes = `Deleted from the board ${new Date().toISOString().slice(0, 10)}.`;
  } else if (item.done === true) {
    body.status = "done";
    body.completed_at = new Date().toISOString();
    body.completed_by = owner;
  } else if (item.done === false) {
    body.status = "planned";
    body.completed_at = null;
    body.completed_by = null;
  }
  if (Object.keys(body).length === 0) throw new Error("No supported task changes supplied.");
  const updated = await supabaseRequest<ProductionTaskRow[]>(`production_order_tasks?id=eq.${quote(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  return updated[0];
}

export async function approveOrderIntake(orderId: string, tasks: unknown, approvedBy = "Nick") {
  const reviews = await supabaseRequest<IntakeReviewRow[]>(`order_intake_reviews?select=*&order_id=eq.${quote(orderId)}&limit=1`);
  const review = reviews[0];
  if (!review) throw new Error("Order intake review not found.");
  const payments = await supabaseRequest<PaymentRow[]>(`order_payments?select=*&order_id=eq.${quote(orderId)}`);
  if (review.review_state !== "paid_needs_review" && review.review_state !== "approved" && !hasScheduleReadyPaymentEvidence(payments)) {
    throw new Error("This order needs exact or bank-visible payment evidence before approval.");
  }
  const provided = cleanTasks(tasks);
  const draft = provided.length > 0 ? provided : cleanTasks(review.draft_tasks);
  if (draft.length === 0) throw new Error("No production tasks to approve.");
  await supabaseRequest("production_order_tasks?on_conflict=order_id,source_task_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(draft.map((item) => ({
      order_id: orderId,
      intake_review_id: review.id,
      source_task_id: item.id,
      title: item.title,
      detail: item.detail,
      owner: item.owner,
      scheduled_date: item.scheduledDate,
      day_key: item.day,
      estimated_hours: item.estimatedHours,
      sort_order: item.sortOrder,
      status: "planned",
    }))),
  });
  await supabaseRequest(`order_intake_reviews?order_id=eq.${quote(orderId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ review_state: "approved", draft_tasks: draft, approved_at: new Date().toISOString(), approved_by: approvedBy }),
  });
  await supabaseRequest(`orders?id=eq.${quote(orderId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "active", next_action: "Approved production tasks are in Tuesday. Start from the scheduled task list." }),
  });
  await insertEvent(orderId, "order_intake_approved", "Nick approved the Supabase production task plan.", { invoice_number: review.source_summary?.invoice_number, approved_task_count: draft.length });
  return listOrderIntakeItems();
}
