export type SourceStatus = "connected" | "not_connected" | "xero_not_connected" | "akahu_not_connected" | "error";

export type FinancialStatus =
  | "not_invoiced"
  | "invoice_unknown_sent"
  | "invoice_issued"
  | "deposit_due"
  | "part_paid"
  | "paid_in_full"
  | "overpaid"
  | "review_needed";

export type SupabaseOrder = {
  id: string;
  customerName: string;
  canonicalStatus: string | null;
  total?: number | null;
  xeroInvoiceNumber?: string | null;
  mondayItemId?: string | number | null;
  orderCode?: string | null;
  updatedAt?: string | null;
  raw?: Record<string, unknown>;
  linkedInvoiceNumbers?: string[];
};

export type MondayMirrorOrder = {
  id: string | number;
  customer: string;
  status: string | null;
  rawMondayStatus?: string | null;
  xeroInvoiceNumber?: string | null;
};

export type FinancialDocument = {
  source: "xero" | "fixture";
  documentType: "invoice" | "quote" | "credit_note";
  invoiceNumber?: string | null;
  invoiceId?: string | null;
  status?: string | null;
  total?: number | null;
  amountPaid?: number | null;
  amountDue?: number | null;
  contactName?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  xeroUrl?: string | null;
  sentConfidence?: "exact" | "probable" | "unknown";
  matchConfidence?: number;
  matchReasons?: string[];
};

export type BankPayment = {
  source: "akahu" | "fixture";
  transactionId: string;
  amount: number;
  date?: string | null;
  payerName?: string | null;
  reference?: string | null;
  particulars?: string | null;
  code?: string | null;
  confidence?: number;
  reasons?: string[];
  matchedOrderId?: string | null;
  matchedInvoiceNumber?: string | null;
};

export type ReconciliationInput = {
  runAt?: string;
  supabase: { status: SourceStatus; error?: string; orders: SupabaseOrder[] };
  monday: { status: SourceStatus; error?: string; orders: MondayMirrorOrder[] };
  xero: { status: SourceStatus; error?: string; documents: FinancialDocument[] };
  akahu: { status: SourceStatus; error?: string; payments: BankPayment[] };
};

export type DriftItem = {
  kind: "status_mismatch" | "missing_monday_mirror" | "invoice_mismatch";
  severity: "info" | "review";
  message: string;
  sources: string[];
};

export type ReconciledOrder = {
  orderId: string;
  customerName: string;
  canonicalStatus: string | null;
  mondayStatus: string | null;
  financialStatus: FinancialStatus;
  invoiceCount: number;
  invoiceNumbers: string[];
  invoiceTotal: number;
  xeroAmountPaid: number;
  xeroAmountDue: number;
  bankAmountMatched: number;
  balanceDue: number;
  hasMultipleInvoices: boolean;
  matchConfidence: "exact" | "probable" | "review" | "none";
  matchReasons: string[];
  mondayDrift: DriftItem[];
  documents: FinancialDocument[];
  payments: BankPayment[];
};

export type ReportItem = {
  severity: "info" | "review" | "blocked";
  orderId?: string;
  customerName?: string;
  issue: string;
  suggestedAction: string;
  sources: string[];
};

export type ReconciliationResult = {
  runAt: string;
  mode: "read_only_report";
  sourceStatuses: Record<"supabase" | "monday" | "xero" | "akahu", SourceStatus>;
  sourceErrors: Record<string, string | undefined>;
  totals: {
    orderCount: number;
    driftCount: number;
    reviewCount: number;
    unmatchedPaymentCount: number;
    balanceDueTotal: number;
  };
  orders: ReconciledOrder[];
  unmatchedPayments: BankPayment[];
  reportItems: ReportItem[];
};

const MONEY_TOLERANCE = 0.02;
const REVIEWED_CANONICAL_FACTS: Array<{ name: string; expected: string; note: string }> = [
  { name: "Blair York", expected: "complete", note: "Blair York is complete/collected." },
  { name: "Tania Pocock", expected: "complete", note: "Tania Pocock is complete/done." },
  { name: "Kelven Plamondon", expected: "finished", note: "Kelven Plamondon is finished and waiting for collection." },
  { name: "Abigail Richards / Michael Calder", expected: "in_production", note: "Abigail Richards / Michael Calder is in production; confirm Thursday pickup/collection after final cuts." },
  { name: "Amanda Lawrey", expected: "sample_sent", note: "Amanda Lawrey sample sent; wait until 2026-05-29." },
];

function asMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Math.round(Number(value) * 100) / 100;
  return 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function norm(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeInvoiceNumber(value: unknown): string | null {
  const raw = String(value ?? "").toUpperCase();
  const match = raw.match(/INV\s*-*\s*(\d+)/i);
  return match ? `INV-${match[1]}` : null;
}

function invoiceNeedle(value: string | null | undefined) {
  return normalizeInvoiceNumber(value)?.replace(/[^A-Z0-9]/g, "") ?? null;
}

function containsInvoice(value: string | null | undefined, invoiceNumber: string) {
  const needle = invoiceNeedle(invoiceNumber);
  if (!needle) return false;
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").includes(needle);
}

function orderInvoiceNumbers(order: SupabaseOrder, monday?: MondayMirrorOrder): string[] {
  const values = [order.xeroInvoiceNumber, monday?.xeroInvoiceNumber, ...(order.linkedInvoiceNumbers ?? [])];
  return Array.from(new Set(values.map(normalizeInvoiceNumber).filter((item): item is string => Boolean(item))));
}

function documentsForOrder(order: SupabaseOrder, monday: MondayMirrorOrder | undefined, documents: FinancialDocument[]): FinancialDocument[] {
  const invoiceNumbers = orderInvoiceNumbers(order, monday);
  const byInvoice = documents.filter((doc) => {
    const docNumber = normalizeInvoiceNumber(doc.invoiceNumber);
    return docNumber && invoiceNumbers.includes(docNumber);
  });

  const orderName = norm(order.customerName);
  const byContact = orderName
    ? documents.filter((doc) => doc.contactName && (norm(doc.contactName) === orderName || norm(doc.contactName).includes(orderName) || orderName.includes(norm(doc.contactName))))
    : [];
  if (byInvoice.length > 0) return uniqueDocuments([...byInvoice, ...byContact]);
  return uniqueDocuments(byContact);
}

function uniqueDocuments(documents: FinancialDocument[]) {
  const seen = new Set<string>();
  return documents.filter((doc) => {
    const key = normalizeInvoiceNumber(doc.invoiceNumber) || doc.invoiceId || `${doc.contactName}-${doc.total}-${doc.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function paymentMatchesOrder(payment: BankPayment, order: SupabaseOrder, documents: FinancialDocument[]) {
  if (payment.matchedOrderId && payment.matchedOrderId === order.id) return { matched: true, confidence: payment.confidence ?? 1, reason: "payment already carried matchedOrderId" };
  const invoiceNumbers = documents.map((doc) => normalizeInvoiceNumber(doc.invoiceNumber)).filter((item): item is string => Boolean(item));
  const paymentText = [payment.reference, payment.particulars, payment.code].filter(Boolean).join(" ");
  for (const invoiceNumber of invoiceNumbers) {
    if (containsInvoice(paymentText, invoiceNumber)) return { matched: true, confidence: Math.max(payment.confidence ?? 0.98, 0.98), reason: `exact invoice reference ${invoiceNumber}` };
  }
  const strongManual = (payment.confidence ?? 0) >= 0.85 && payment.matchedInvoiceNumber && invoiceNumbers.includes(normalizeInvoiceNumber(payment.matchedInvoiceNumber) ?? "");
  if (strongManual) return { matched: true, confidence: payment.confidence ?? 0.85, reason: `pre-matched invoice ${payment.matchedInvoiceNumber}` };
  return { matched: false, confidence: payment.confidence ?? 0, reason: "no exact invoice/order payment reference" };
}

function computeFinancialStatus(args: { documents: FinancialDocument[]; invoiceTotal: number; xeroAmountPaid: number; xeroAmountDue: number; bankAmountMatched: number; balanceDue: number; review: boolean }): FinancialStatus {
  if (args.review) return "review_needed";
  if (args.documents.length === 0) return "not_invoiced";
  if (args.bankAmountMatched - args.invoiceTotal > MONEY_TOLERANCE) return "overpaid";
  if (Math.abs(args.balanceDue) <= MONEY_TOLERANCE || Math.abs(args.xeroAmountDue) <= MONEY_TOLERANCE) return "paid_in_full";
  if (args.bankAmountMatched > MONEY_TOLERANCE || args.xeroAmountPaid > MONEY_TOLERANCE) return "part_paid";
  const sentConfidences = args.documents.map((doc) => doc.sentConfidence ?? "unknown");
  if (sentConfidences.every((confidence) => confidence === "unknown")) return "invoice_unknown_sent";
  if (args.xeroAmountDue > MONEY_TOLERANCE) return "deposit_due";
  return "invoice_issued";
}

function mondayByOrder(orders: MondayMirrorOrder[]) {
  const byId = new Map<string, MondayMirrorOrder>();
  const byCustomer = new Map<string, MondayMirrorOrder>();
  for (const order of orders) {
    byId.set(String(order.id), order);
    byCustomer.set(norm(order.customer), order);
  }
  return { byId, byCustomer };
}

function findMonday(order: SupabaseOrder, mondayOrders: MondayMirrorOrder[]) {
  const indexes = mondayByOrder(mondayOrders);
  const id = order.mondayItemId == null ? null : String(order.mondayItemId);
  if (id && indexes.byId.has(id)) return indexes.byId.get(id);
  return indexes.byCustomer.get(norm(order.customerName));
}

function statusesAgree(canonicalStatus: string | null, mondayStatus: string | null) {
  const canonical = norm(canonicalStatus);
  const monday = norm(mondayStatus);
  if (!canonical && !monday) return true;
  if (["complete", "completed", "collected", "done"].includes(canonical)) return ["collected", "done", "complete", "completed"].includes(monday);
  if (["finished", "ready", "awaiting collection", "waiting collection"].some((value) => canonical.includes(value))) return ["finished"].some((value) => monday.includes(value));
  if (["in production", "in_production", "production"].some((value) => canonical.includes(value))) return monday.includes("production") || monday.includes("booked") || monday.includes("materials ready");
  return canonical === monday;
}

function detectDrift(order: SupabaseOrder, monday: MondayMirrorOrder | undefined, invoiceNumbers: string[]): DriftItem[] {
  const drift: DriftItem[] = [];
  if (!monday) {
    drift.push({ kind: "missing_monday_mirror", severity: "review", message: "No Monday mirror item was matched to this canonical Supabase order.", sources: [`supabase:orders.${order.id}`] });
    return drift;
  }
  const mondayStatus = monday.status || monday.rawMondayStatus || null;
  if (!statusesAgree(order.canonicalStatus, mondayStatus)) {
    drift.push({
      kind: "status_mismatch",
      severity: "review",
      message: `Monday mirror says ${mondayStatus ?? "unknown"}; Supabase canonical status is ${order.canonicalStatus ?? "unknown"}. Do not overwrite Supabase from Monday.`,
      sources: [`supabase:orders.${order.id}`, `monday:${monday.id}`],
    });
  }
  const mondayInvoice = normalizeInvoiceNumber(monday.xeroInvoiceNumber);
  if (mondayInvoice && invoiceNumbers.length > 0 && !invoiceNumbers.includes(mondayInvoice)) {
    drift.push({
      kind: "invoice_mismatch",
      severity: "review",
      message: `Monday mirror invoice ${mondayInvoice} is not among matched Xero/Supabase invoices ${invoiceNumbers.join(", ")}.`,
      sources: [`supabase:orders.${order.id}`, `monday:${monday.id}`],
    });
  }
  return drift;
}

export function reconcileSourceOfTruth(input: ReconciliationInput): ReconciliationResult {
  const usedPaymentIds = new Set<string>();
  const orders = input.supabase.orders.map((order) => {
    const monday = findMonday(order, input.monday.orders);
    const documents = documentsForOrder(order, monday, input.xero.documents);
    const payments: BankPayment[] = [];
    const matchReasons: string[] = [];
    for (const payment of input.akahu.payments) {
      const match = paymentMatchesOrder(payment, order, documents);
      if (match.matched && match.confidence >= 0.85) {
        payments.push({ ...payment, confidence: match.confidence, reasons: [...(payment.reasons ?? []), match.reason] });
        usedPaymentIds.add(payment.transactionId);
        matchReasons.push(match.reason);
      }
    }

    const invoiceTotal = asMoney(documents.reduce((sum, doc) => sum + (doc.documentType === "credit_note" ? -asMoney(doc.total) : asMoney(doc.total)), 0));
    const xeroAmountPaid = asMoney(documents.reduce((sum, doc) => sum + asMoney(doc.amountPaid), 0));
    const xeroAmountDue = asMoney(documents.reduce((sum, doc) => sum + asMoney(doc.amountDue), 0));
    const bankAmountMatched = asMoney(payments.reduce((sum, payment) => sum + asMoney(payment.amount), 0));
    const balanceDue = asMoney(invoiceTotal - bankAmountMatched);
    const invoiceNumbers = Array.from(new Set(documents.map((doc) => normalizeInvoiceNumber(doc.invoiceNumber)).filter((item): item is string => Boolean(item))));
    const hasXeroBankDisagreement = documents.length > 0 && Math.abs(balanceDue - xeroAmountDue) > MONEY_TOLERANCE && Math.abs(xeroAmountPaid - bankAmountMatched) > MONEY_TOLERANCE;
    if (documents.length > 1) matchReasons.push("Multiple Xero documents roll up to this Supabase order.");
    if (hasXeroBankDisagreement) matchReasons.push(`Xero amount due ${xeroAmountDue.toFixed(2)} and bank-derived balance ${balanceDue.toFixed(2)} disagree.`);

    const mondayDrift = detectDrift(order, monday, invoiceNumbers.length ? invoiceNumbers : orderInvoiceNumbers(order, monday));
    const financialStatus = computeFinancialStatus({ documents, invoiceTotal, xeroAmountPaid, xeroAmountDue, bankAmountMatched, balanceDue, review: hasXeroBankDisagreement });
    const matchConfidence = documents.length === 0 ? "none" : payments.length > 0 && payments.every((payment) => (payment.confidence ?? 0) >= 0.98) ? "exact" : payments.length > 0 ? "probable" : "review";

    return {
      orderId: order.id,
      customerName: order.customerName,
      canonicalStatus: order.canonicalStatus,
      mondayStatus: monday?.status || monday?.rawMondayStatus || null,
      financialStatus,
      invoiceCount: documents.length,
      invoiceNumbers,
      invoiceTotal,
      xeroAmountPaid,
      xeroAmountDue,
      bankAmountMatched,
      balanceDue: Math.abs(balanceDue) <= MONEY_TOLERANCE ? 0 : balanceDue,
      hasMultipleInvoices: documents.length > 1,
      matchConfidence,
      matchReasons,
      mondayDrift,
      documents,
      payments,
    } satisfies ReconciledOrder;
  });

  const unmatchedPayments = input.akahu.payments.filter((payment) => !usedPaymentIds.has(payment.transactionId));
  const reportItems: ReportItem[] = [];

  for (const order of orders) {
    if (order.mondayDrift.length > 0) {
      reportItems.push({ severity: "review", orderId: order.orderId, customerName: order.customerName, issue: `Supabase/Monday drift: ${order.mondayDrift.map((item) => item.message).join(" ")}`, suggestedAction: "Review mirror lag; keep Supabase canonical unless a human approves an update.", sources: order.mondayDrift.flatMap((item) => item.sources) });
    }
    if (["deposit_due", "part_paid", "overpaid", "review_needed"].includes(order.financialStatus)) {
      reportItems.push({ severity: order.financialStatus === "review_needed" || order.financialStatus === "overpaid" ? "review" : "info", orderId: order.orderId, customerName: order.customerName, issue: `${order.financialStatus.replace(/_/g, " ")}; balance due $${order.balanceDue.toFixed(2)}.`, suggestedAction: "Use as owner-brief evidence only. Do not mark paid from weak bank evidence.", sources: [`supabase:orders.${order.orderId}`, ...order.invoiceNumbers.map((n) => `xero:${n}`)] });
    }
  }

  for (const payment of unmatchedPayments) {
    reportItems.push({ severity: "review", issue: `Unmatched deposit/payment ${payment.transactionId} for $${asMoney(payment.amount).toFixed(2)}${payment.payerName ? ` from ${payment.payerName}` : ""}.`, suggestedAction: "Review bank reference against orders before linking. Do not auto-mark paid.", sources: [`${payment.source}:${payment.transactionId}`] });
  }

  for (const fact of REVIEWED_CANONICAL_FACTS) {
    const matched = orders.find((order) => norm(order.customerName).includes(norm(fact.name)) || norm(fact.name).includes(norm(order.customerName)));
    if (matched && !norm(matched.canonicalStatus).includes(norm(fact.expected).replace(/_/g, " "))) {
      reportItems.push({ severity: "review", orderId: matched.orderId, customerName: matched.customerName, issue: `Known current state guardrail: ${fact.note} Current Supabase status is ${matched.canonicalStatus ?? "unknown"}.`, suggestedAction: "Check Supabase before trusting Monday or financial evidence.", sources: [`supabase:orders.${matched.orderId}`] });
    }
  }

  const driftCount = orders.reduce((sum, order) => sum + order.mondayDrift.length, 0);
  const reviewCount = reportItems.filter((item) => item.severity !== "info").length;
  return {
    runAt: input.runAt || new Date().toISOString(),
    mode: "read_only_report",
    sourceStatuses: {
      supabase: input.supabase.status,
      monday: input.monday.status,
      xero: input.xero.status,
      akahu: input.akahu.status,
    },
    sourceErrors: {
      supabase: input.supabase.error,
      monday: input.monday.error,
      xero: input.xero.error,
      akahu: input.akahu.error,
    },
    totals: {
      orderCount: orders.length,
      driftCount,
      reviewCount,
      unmatchedPaymentCount: unmatchedPayments.length,
      balanceDueTotal: asMoney(orders.reduce((sum, order) => sum + Math.max(0, order.balanceDue), 0)),
    },
    orders,
    unmatchedPayments,
    reportItems,
  };
}

function lineOrNone(lines: string[]) {
  return lines.length > 0 ? lines.join("\n") : "- None.";
}

export function renderReconciliationMarkdown(result: ReconciliationResult): string {
  const sourceLines = Object.entries(result.sourceStatuses).map(([source, status]) => {
    const error = result.sourceErrors[source];
    return `- ${source}: ${status}${error ? ` (${error})` : ""}`;
  });
  const cashLines = result.orders
    .filter((order) => order.bankAmountMatched > MONEY_TOLERANCE || order.xeroAmountPaid > MONEY_TOLERANCE)
    .map((order) => `- ${order.customerName}: bank matched $${order.bankAmountMatched.toFixed(2)}, Xero paid $${order.xeroAmountPaid.toFixed(2)}, balance $${order.balanceDue.toFixed(2)} (${order.financialStatus}).`);
  const balanceLines = result.orders
    .filter((order) => order.balanceDue > MONEY_TOLERANCE && order.invoiceCount > 0)
    .map((order) => `- ${order.customerName}: balance due $${order.balanceDue.toFixed(2)} across ${order.invoiceCount} invoice(s) ${order.invoiceNumbers.join(", ") || "no invoice number"}.`);
  const driftLines = result.orders
    .flatMap((order) => order.mondayDrift.map((drift) => `- ${order.customerName}: ${drift.message}`));
  const unmatchedLines = result.unmatchedPayments.map((payment) => `- ${payment.date ?? "unknown date"}: $${asMoney(payment.amount).toFixed(2)} ${payment.payerName ?? "unknown payer"} (${payment.reference ?? payment.particulars ?? "no reference"})`);
  const reviewLines = result.reportItems
    .filter((item) => item.severity !== "info")
    .map((item) => `- ${item.customerName ? `${item.customerName}: ` : ""}${item.issue} Next: ${item.suggestedAction}`);

  return [
    `# Source-of-truth reconciliation`,
    ``,
    `Run: ${result.runAt}`,
    `Mode: ${result.mode}; no external mutations.`,
    ``,
    `## Sources`,
    ...sourceLines,
    ``,
    `## Summary`,
    `- Orders checked: ${result.totals.orderCount}`,
    `- Supabase/Monday drift items: ${result.totals.driftCount}`,
    `- Review items: ${result.totals.reviewCount}`,
    `- Unmatched deposits: ${result.totals.unmatchedPaymentCount}`,
    `- Positive balance due total: $${result.totals.balanceDueTotal.toFixed(2)}`,
    ``,
    `## Cash received / payment evidence`,
    lineOrNone(cashLines),
    ``,
    `## Balances due`,
    lineOrNone(balanceLines),
    ``,
    `## Supabase vs Monday drift`,
    lineOrNone(driftLines),
    ``,
    `## Unmatched deposits`,
    lineOrNone(unmatchedLines),
    ``,
    `## Needs Guido/Nick decision`,
    lineOrNone(reviewLines),
  ].join("\n");
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRead(path: string) {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase env not configured: set SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY");
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase read ${path} failed: HTTP ${response.status} ${(await response.text()).slice(0, 240)}`);
  return (await response.json()) as Record<string, unknown>[];
}

function orderFromSupabase(row: Record<string, unknown>, links: Record<string, unknown>[]): SupabaseOrder {
  const id = String(row.id ?? "");
  const customerName = text(row.customer_name) || text(row.customer) || text(row.name) || "Unnamed order";
  const linkedInvoiceNumbers = links
    .filter((link) => String(link.order_id ?? "") === id)
    .map((link) => text(link.external_id) || text(link.url) || text(link.label) || text((link.metadata as Record<string, unknown> | undefined)?.xero_invoice_number))
    .map(normalizeInvoiceNumber)
    .filter((item): item is string => Boolean(item));
  return {
    id,
    customerName,
    canonicalStatus: text(row.status) || text(row.production_status) || text(row.order_status),
    total: asMoney(row.total ?? row.total_amount ?? row.estimated_value ?? row.value),
    xeroInvoiceNumber: normalizeInvoiceNumber(row.xero_invoice_number) || normalizeInvoiceNumber(row.invoice_number),
    mondayItemId: text(row.monday_item_id) || text(row.monday_order_id),
    orderCode: text(row.order_code) || text(row.code),
    updatedAt: text(row.updated_at),
    raw: row,
    linkedInvoiceNumbers,
  };
}

export async function readSupabaseOrders(): Promise<ReconciliationInput["supabase"]> {
  if (!supabaseConfig()) return { status: "not_connected", orders: [], error: "Supabase env not configured" };
  try {
    const params = new URLSearchParams({ select: "*", order: "updated_at.desc", limit: "250" });
    const linksParams = new URLSearchParams({ select: "*", limit: "1000" });
    const [orders, links] = await Promise.all([supabaseRead(`orders?${params}`), supabaseRead(`order_links?${linksParams}`).catch(() => [])]);
    return { status: "connected", orders: orders.map((row) => orderFromSupabase(row, links)) };
  } catch (error) {
    return { status: "error", orders: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readMondayMirror(): Promise<ReconciliationInput["monday"]> {
  if (!process.env.MONDAY_API_TOKEN || !process.env.MONDAY_ORDERS_BOARD_ID) return { status: "not_connected", orders: [], error: "Monday env not configured" };
  try {
    const { getOrdersFresh } = await import("../monday/fetch-orders.ts");
    const result = await getOrdersFresh({ writeSnapshot: false });
    return {
      status: result.source === "none" ? "error" : "connected",
      error: result.mondayError,
      orders: result.items.map((order) => ({ id: order.id, customer: order.customer, status: order.status, rawMondayStatus: order.rawMondayStatus, xeroInvoiceNumber: order.xeroInvoiceNumber })),
    };
  } catch (error) {
    return { status: "error", orders: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function readXeroDocumentsForOrders(orders: SupabaseOrder[]): Promise<ReconciliationInput["xero"]> {
  const invoiceNumbers = Array.from(new Set(orders.flatMap((order) => [order.xeroInvoiceNumber, ...(order.linkedInvoiceNumbers ?? [])]).map(normalizeInvoiceNumber).filter((item): item is string => Boolean(item))));
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) return { status: "xero_not_connected", documents: [], error: "Xero env not configured" };
  try {
    const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
    const tokenResponse = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "accounting.invoices accounting.contacts accounting.settings accounting.reports.read" }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error(`Xero token request failed: HTTP ${tokenResponse.status} ${(await tokenResponse.text()).slice(0, 240)}`);
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error("Xero token response did not include an access token");

    const connectionsResponse = await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json" }, cache: "no-store" });
    if (!connectionsResponse.ok) throw new Error(`Xero connections request failed: HTTP ${connectionsResponse.status} ${(await connectionsResponse.text()).slice(0, 240)}`);
    const connections = (await connectionsResponse.json()) as Array<{ tenantId?: string }>;
    const tenantId = connections.find((connection) => connection.tenantId)?.tenantId;
    if (!tenantId) throw new Error("Xero connection response did not include a tenant");

    const documents: FinancialDocument[] = [];
    for (const invoiceNumber of invoiceNumbers.slice(0, 50)) {
      const params = new URLSearchParams({ page: "1", pageSize: "10", summaryOnly: "true", order: "UpdatedDateUTC DESC" });
      params.append("InvoiceNumbers", invoiceNumber);
      const url = `https://api.xero.com/api.xro/2.0/Invoices?${params}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${tokenJson.access_token}`, "xero-tenant-id": tenantId, Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error(`Xero invoice read failed for ${invoiceNumber}: HTTP ${response.status} ${(await response.text()).slice(0, 240)}`);
      const json = (await response.json()) as { Invoices?: Array<Record<string, unknown>> };
      for (const invoice of json.Invoices ?? []) {
        const invoiceId = text(invoice.InvoiceID);
        const status = text(invoice.Status);
        documents.push({
          source: "xero",
          documentType: "invoice",
          invoiceId,
          invoiceNumber: normalizeInvoiceNumber(invoice.InvoiceNumber),
          status,
          total: asMoney(invoice.Total),
          amountPaid: asMoney(invoice.AmountPaid),
          amountDue: asMoney(invoice.AmountDue),
          contactName: text((invoice.Contact as Record<string, unknown> | undefined)?.Name),
          issuedAt: text(invoice.DateString),
          dueAt: text(invoice.DueDateString),
          xeroUrl: text(invoice.Url) || (invoiceId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}` : null),
          sentConfidence: status === "PAID" ? "probable" : status === "AUTHORISED" ? "unknown" : "unknown",
          matchConfidence: 1,
          matchReasons: [`queried by exact invoice number ${invoiceNumber}`],
        });
      }
    }
    return { status: "connected", documents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "error", documents: [], error: message.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]").replace(/Basic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [REDACTED]") };
  }
}

export async function readAkahuPayments(): Promise<ReconciliationInput["akahu"]> {
  const appToken = process.env.AKAHU_APP_TOKEN || process.env.AKAHU_CLIENT_ID;
  const userToken = process.env.AKAHU_USER_TOKEN || process.env.AKAHU_ACCESS_TOKEN;
  if (!appToken || !userToken) return { status: "akahu_not_connected", payments: [], error: "Akahu env not configured" };
  try {
    const start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = new URL("https://api.akahu.io/v1/transactions");
    url.searchParams.set("start", start);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${userToken}`, "X-Akahu-ID": appToken, Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Akahu transactions read failed: HTTP ${response.status} ${(await response.text()).slice(0, 240)}`);
    const json = (await response.json()) as { items?: Array<Record<string, unknown>> };
    const payments = (json.items ?? [])
      .map((row): BankPayment | null => {
        const amount = asMoney(row.amount);
        if (amount <= 0) return null;
        const description = text(row.description) || text(row.merchant_name) || text(row.meta);
        return {
          source: "akahu",
          transactionId: String(row._id ?? row.id ?? `${row.date}-${amount}-${description}`),
          amount,
          date: text(row.date),
          payerName: text(row.merchant_name) || text((row.merchant as Record<string, unknown> | undefined)?.name),
          reference: description,
          confidence: 0,
          reasons: ["unmatched_akahu_deposit"],
        };
      })
      .filter((payment): payment is BankPayment => Boolean(payment));
    return { status: "connected", payments };
  } catch (error) {
    return { status: "error", payments: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runSourceOfTruthReconciliation(): Promise<ReconciliationResult> {
  const supabase = await readSupabaseOrders();
  const [monday, xero, akahu] = await Promise.all([readMondayMirror(), readXeroDocumentsForOrders(supabase.orders), readAkahuPayments()]);
  return reconcileSourceOfTruth({ runAt: new Date().toISOString(), supabase, monday, xero, akahu });
}
