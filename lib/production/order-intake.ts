import "server-only";

import { listRecentXeroInvoiceSummaries, type XeroInvoiceSummary } from "@/lib/xero/read-only";
import type { DayKey, Person } from "@/lib/monday/production-plan-mapping";

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
  reviewState: IntakeReviewState;
  stateLabel: string;
  stateDetail: string;
  sourceSummary: Record<string, unknown>;
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
  product_summary: string | null;
  item_category: string | null;
  xero_invoice_number: string | null;
};

const ORDER_SELECT = "id,customer_name,status,paid_on_date,product_summary,item_category,xero_invoice_number";
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
  line_items: IntakeLineItem[] | null;
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

function inferCategory(invoice: XeroInvoiceSummary) {
  const items = lineItems(invoice);
  const text = items.map((line) => line.description).join("\n").toLowerCase();
  const firstLineText = items.map((line) => line.description.split(/\r?\n/)[0] || "").join("\n").toLowerCase();
  if (/ecobeans|bean\s*bag|beanbag|bag fill|filling|consumable|hardware/.test(text)) return "Supply";
  if (/dining table|table|bench|base|steel|leg/.test(text)) return "Table";
  if (/\bsamples?\b|sample panel|colour sample|color sample|engrave/.test(firstLineText) || /sample panel|colour sample|color sample|engrave/.test(text)) return "Sample";
  if (/benchtop|bench top|panel|plank|board|timber|slab|raw|uncoated|dressed/.test(text)) return "Panel";
  return "Other";
}

function suggestionSignature(invoice: XeroInvoiceSummary) {
  return JSON.stringify({
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

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function task(id: string, title: string, detail: string, owner: IntakeTaskOwner, date: Date, estimatedHours: number, sortOrder: number): IntakeTaskDraft {
  const person: Person = owner === "Dylan" ? "dylan" : "nick";
  return { id, title, detail, owner, person, scheduledDate: iso(date), day: dayKeyForDate(date), estimatedHours, sortOrder };
}

export function buildIntakeSuggestedTasks(input: { invoice: XeroInvoiceSummary; orderId: string; paid: boolean }): IntakeTaskDraft[] {
  const start = nextWorkshopDay();
  const category = inferCategory(input.invoice);
  const text = lineItems(input.invoice).map((line) => line.description).join("\n").toLowerCase();
  const supplyOnly = category === "Panel"
    && /raw|uncoated|dressed|plank|board|timber|panel/.test(text)
    && !/blackwash|whitewash|clear\s*coat|oil|lacquer|polyurethane|sand\s+and\s+coat|table|bench|benchtop/.test(text);
  if (category === "Supply") {
    return [
      task(`${input.orderId}:spec-check`, "Material + spec check", "Confirm the invoice item, quantity, delivery/collection requirement, and whether this is stock supply rather than workshop production.", "Nick", start, 0.5, 10),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Pick, count, label, and pack the supplied goods against the invoice.", "Dylan", addWorkshopDays(start, 1), 0.75, 20),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm pickup/courier details and send the customer update.", "Nick", addWorkshopDays(start, 1), 0.25, 30),
    ];
  }
  if (supplyOnly) {
    return [
      task(`${input.orderId}:spec-check`, "Material + spec check", "Confirm sizes, quantity, species, and whether this is collection or delivery before pulling stock.", "Nick", start, 0.5, 10),
      task(`${input.orderId}:timber-pulled`, "Timber pulled", "Pull and check the plank/panel/timber items against the invoice line items.", "Dylan", addWorkshopDays(start, 1), 1.5, 20),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Final count/quality check, label the pack, and prepare it for collection or delivery.", "Nick", addWorkshopDays(start, 2), 0.5, 30),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm collection/delivery details with the customer.", "Nick", addWorkshopDays(start, 2), 0.25, 40),
    ];
  }
  if (category === "Sample") {
    return [
      task(`${input.orderId}:spec-check`, "Material + spec check", "Confirm species, colour, size, quantity, engraving/label needs, and customer address from the invoice.", "Nick", start, 0.5, 10),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Prepare, label, photograph, and pack the sample set.", "Dylan", addWorkshopDays(start, 1), 1, 20),
      task(`${input.orderId}:customer-update`, "Customer update", "Confirm courier/collection and set the follow-up date.", "Nick", addWorkshopDays(start, 2), 0.5, 30),
    ];
  }
  const first = task(`${input.orderId}:spec-check`, "Material + spec check", "Confirm line items, dimensions, timber, finish, base/hardware, delivery and any missing customer decisions.", "Nick", start, 1, 10);
  if (category === "Panel") {
    return [
      first,
      task(`${input.orderId}:cut-prep`, "Cut / machine / prep", "Prepare the panel or benchtop blank and resolve stock/yield questions.", "Dylan", addWorkshopDays(start, 1), 1, 20),
      task(`${input.orderId}:sand-coat`, "Sand and coat", "Surface prep and primary finish stage.", "Dylan", addWorkshopDays(start, 2), 1, 30),
      task(`${input.orderId}:qc-photos`, "QC + photos", "Final proof photos and quality check before packing.", "Nick", addWorkshopDays(start, 4), 1, 40),
      task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Package safely and confirm courier or collection details.", "Dylan", addWorkshopDays(start, 4), 0.5, 50),
    ];
  }
  const finalCoat = /blackwash|whitewash|colour|color/.test(text) ? "4th coat (blackwash final)" : "3rd coat (clear final)";
  return [
    first,
    task(`${input.orderId}:timber-pulled`, "Timber pulled", "Pull/check timber against invoice and flag material or PO gaps before workshop work starts.", "Dylan", addWorkshopDays(start, 1), 1, 20),
    task(`${input.orderId}:stress-cuts`, "Stress cuts", "Break down timber and let movement show before final machining.", "Dylan", addWorkshopDays(start, 1), 1, 30),
    task(`${input.orderId}:cut-prep`, "Cut / machine / prep", "Machine components and resolve construction details before finish work starts.", "Nick", addWorkshopDays(start, 2), 1.5, 40),
    task(`${input.orderId}:sand-coat`, "Sand and coat", "Surface prep and first/primary finish stage.", "Dylan", addWorkshopDays(start, 3), 1, 50),
    task(`${input.orderId}:final-coat`, finalCoat, "Complete the final finish stage required by the invoice spec.", "Dylan", addWorkshopDays(start, 4), 1, 60),
    task(`${input.orderId}:qc-photos`, "QC + photos", "Final proof photos, spec check, and customer-ready quality review.", "Nick", addWorkshopDays(start, 6), 1, 70),
    task(`${input.orderId}:pack-wrap`, "Pack / wrap", "Pack, protect, and prepare for delivery or collection.", "Dylan", addWorkshopDays(start, 6), 0.75, 80),
    task(`${input.orderId}:book-freight`, "Book freight", "Book freight or confirm local delivery/collection details.", "Nick", addWorkshopDays(start, 6), 0.5, 90),
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
  if (state === "paid_needs_review") return "Exact Akahu payment evidence is matched. Nick should approve the task plan.";
  if (state === "needs_review") return "Payment or invoice evidence needs a human check before approval.";
  if (state === "approved") return "Approved Supabase production tasks have been created.";
  return "Invoice is authorised in Xero. Waiting for an exact Akahu payment match.";
}

async function rowsByOrder<T extends { order_id: string | null }>(table: string, orderIds: string[], select = "*") {
  if (orderIds.length === 0) return [] as T[];
  return supabaseRequest<T[]>(`${table}?select=${select}&order_id=in.(${orderIds.map(quote).join(",")})`);
}

export async function listOrderIntakeItems(): Promise<OrderIntakeItem[]> {
  const reviews = await supabaseRequest<IntakeReviewRow[]>("order_intake_reviews?select=*&order=updated_at.desc&limit=40");
  const orderIds = reviews.map((review) => review.order_id);
  if (orderIds.length === 0) return [];
  const [orders, documents, payments, tasks] = await Promise.all([
    supabaseRequest<SupabaseOrder[]>(`orders?select=${ORDER_SELECT}&id=in.(${orderIds.map(quote).join(",")})`),
    rowsByOrder<FinancialDocumentRow>("order_financial_documents", orderIds),
    rowsByOrder<PaymentRow>("order_payments", orderIds),
    rowsByOrder<ProductionTaskRow>("production_order_tasks", orderIds),
  ]);
  return reviews.flatMap((review) => {
    const order = orders.find((item) => item.id === review.order_id);
    if (!order) return [];
    const document = documents.find((item) => item.order_id === order.id) || null;
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
    const hasPendingAkahu = paymentEvidence.some((payment) => payment.matchStatus === "ignored" && payment.matchReasons.includes("pending_akahu_transaction"));
    return [{
      orderId: order.id,
      reviewId: review.id,
      customerName: order.customer_name,
      orderStatus: order.status,
      paidOnDate: order.paid_on_date,
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
      reviewState: review.review_state,
      stateLabel: hasPendingAkahu && review.review_state === "awaiting_payment" ? "Payment pending" : reviewLabel(review.review_state),
      stateDetail: hasPendingAkahu && review.review_state === "awaiting_payment" ? "Payment is pending in Akahu. Approval stays locked until the bank transaction settles." : reviewDetail(review.review_state),
      sourceSummary: review.source_summary || {},
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
  const deduped = amountMatches.filter((row, index, list) => {
    const key = `${row.source_system}:${row.external_transaction_id || row.id}:${row.match_status}:${row.amount}`;
    return list.findIndex((candidate) => `${candidate.source_system}:${candidate.external_transaction_id || candidate.id}:${candidate.match_status}:${candidate.amount}` === key) === index;
  });
  return {
    all: deduped,
    exact: deduped.filter((row) => row.match_status === "matched" && Number(row.match_confidence ?? 0) >= 0.98),
    probable: deduped.filter((row) => row.match_status === "probable"),
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

async function upsertOrderForInvoice(invoice: XeroInvoiceSummary, paid: boolean) {
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
    const rows = await supabaseRequest<SupabaseOrder[]>(`orders?id=eq.${quote(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(paid ? {
        ...invoicePatch,
        status: "active",
        paid_on_date: existing.paid_on_date || nzDate(),
        next_action: "Paid. Nick to review and approve the production task plan.",
      } : invoicePatch),
    });
    return rows[0] || { ...existing, ...invoicePatch };
  }
  const response = await supabaseRequest<SupabaseOrder[]>("orders?on_conflict=xero_invoice_number", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      order_code: invoiceNumber,
      customer_name: invoice.contact || "Unknown customer",
      status: paid ? "active" : "awaiting_payment",
      priority: paid ? "normal" : "cash",
      owner: "Nick",
      item_category: category,
      product_summary: productSummary(invoice),
      spec: { source: "xero_invoice", line_items: lineItems(invoice) },
      delivery: {},
      order_date: dateOnly(invoice.date) || nzDate(),
      paid_on_date: paid ? nzDate() : null,
      due_date: dateOnly(invoice.dueDate),
      total_incl_gst: invoice.total,
      currency: "NZD",
      xero_invoice_number: invoiceNumber,
      xero_invoice_id: invoice.invoiceId,
      xero_invoice_url: invoice.xeroUrl,
      source_system: "supabase",
      source_url: invoice.xeroUrl,
      next_action: paid ? "Paid. Nick to review and approve the production task plan." : "Awaiting exact Akahu payment match before production planning.",
      notes: "Created by Tuesday order-intake reconciliation from authorised Xero invoice.",
    }]),
  });
  return response[0];
}

async function upsertInvoiceEvidence(orderId: string, invoice: XeroInvoiceSummary) {
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
  if (items.length > 0) {
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
  const previousDraftHasManualTask = previousDraft.some((item) => item.id.startsWith("manual-"));
  const suggested = !shouldRegenerate && previousSuggested.length > 0 ? previousSuggested : generated;
  const draft = previousDraft.length > 0 && (!shouldRegenerate || (previousDraftHasManualTask && !previousDraftWasJustSuggested)) ? previousDraft : suggested;
  const nextState: IntakeReviewState = previous?.review_state === "approved" ? "approved" : state;
  const reviews = await supabaseRequest<IntakeReviewRow[]>("order_intake_reviews?on_conflict=order_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify([{
      order_id: order.id,
      review_state: nextState,
      source_summary: { source: "xero_authorised_invoice", payment_gate: "akahu_exact_match", invoice_number: order.xero_invoice_number, payment_count: payments.length, suggestion_signature: signature, item_category: inferCategory(invoice) },
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
    accepted += 1;
    const invoiceNumber = normalizeInvoiceNumber(invoice.invoiceNumber);
    if (!invoiceNumber) continue;
    try {
      const provisional = await upsertOrderForInvoice(invoice, false);
      await upsertInvoiceEvidence(provisional.id, invoice);
      const paymentEvidence = await paymentCandidates(invoiceNumber, provisional.id, invoice.total);
      const xeroPaidWithoutAkahu = (invoice.status || "").toUpperCase() === "PAID" && paymentEvidence.exact.length === 0;
      const paid = paymentEvidence.exact.length > 0;
      const order = paid && provisional.status !== "active" ? await upsertOrderForInvoice(invoice, true) : provisional;
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

export async function approveOrderIntake(orderId: string, tasks: unknown, approvedBy = "Nick") {
  const reviews = await supabaseRequest<IntakeReviewRow[]>(`order_intake_reviews?select=*&order_id=eq.${quote(orderId)}&limit=1`);
  const review = reviews[0];
  if (!review) throw new Error("Order intake review not found.");
  if (review.review_state !== "paid_needs_review" && review.review_state !== "approved") throw new Error("This order needs exact payment evidence before approval.");
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
