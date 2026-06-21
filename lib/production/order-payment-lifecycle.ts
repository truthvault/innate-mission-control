import "server-only";

import type { UiOrder } from "@/lib/monday/mapping";

export type PaymentStage =
  | "no_invoice"
  | "deposit_due"
  | "in_production"
  | "ready_for_balance"
  | "balance_authorised"
  | "awaiting_balance_payment"
  | "balance_paid"
  | "manual_review";

export type OrderPaymentLifecycle = {
  orderId: string;
  primaryInvoiceNumber: string | null;
  depositInvoiceNumber: string | null;
  depositTotal: number | null;
  depositPaidAt: string | null;
  depositAmountDue: number | null;
  balanceInvoiceNumber: string | null;
  balanceTotal: number | null;
  balanceDueAt: string | null;
  balanceSentAt: string | null;
  balancePaidAt: string | null;
  balanceAmountDue: number | null;
  balanceCustomerTouchEventId: string | null;
  paymentStage: PaymentStage;
  paymentStageLabel: string;
  paymentNextAction: string | null;
};

type SupabaseConfig = { url: string; serviceKey: string };

type PaymentLifecycleRow = {
  order_id: string;
  primary_invoice_number: string | null;
  deposit_invoice_number: string | null;
  deposit_total: number | string | null;
  deposit_paid_at: string | null;
  deposit_amount_due: number | string | null;
  balance_invoice_number: string | null;
  balance_total: number | string | null;
  balance_due_at: string | null;
  balance_sent_at: string | null;
  balance_paid_at: string | null;
  balance_amount_due: number | string | null;
  balance_customer_touch_event_id: string | null;
  payment_stage: PaymentStage | null;
  payment_stage_label: string | null;
  payment_next_action: string | null;
};

function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function supabaseRequest<T>(path: string): Promise<T | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as T : null;
}

function quote(value: string) {
  return encodeURIComponent(value);
}

function normalizeInvoiceNumber(value: string | null | undefined) {
  const match = value?.match(/\bINV-?\d+\b/i);
  return match ? match[0].toUpperCase().replace(/^INV(\d)/, "INV-$1") : null;
}

function money(value: number | string | null) {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function fromRow(row: PaymentLifecycleRow): OrderPaymentLifecycle {
  return {
    orderId: row.order_id,
    primaryInvoiceNumber: row.primary_invoice_number,
    depositInvoiceNumber: row.deposit_invoice_number,
    depositTotal: money(row.deposit_total),
    depositPaidAt: row.deposit_paid_at,
    depositAmountDue: money(row.deposit_amount_due),
    balanceInvoiceNumber: row.balance_invoice_number,
    balanceTotal: money(row.balance_total),
    balanceDueAt: row.balance_due_at,
    balanceSentAt: row.balance_sent_at,
    balancePaidAt: row.balance_paid_at,
    balanceAmountDue: money(row.balance_amount_due),
    balanceCustomerTouchEventId: row.balance_customer_touch_event_id,
    paymentStage: row.payment_stage || "manual_review",
    paymentStageLabel: row.payment_stage_label || "Payment review",
    paymentNextAction: row.payment_next_action,
  };
}

export async function listPaymentLifecycleByOrderIds(orderIds: string[]): Promise<OrderPaymentLifecycle[]> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await supabaseRequest<PaymentLifecycleRow[]>(
    `order_payment_lifecycle_v?select=*&order_id=in.(${ids.map(quote).join(",")})`,
  );
  return (rows || []).map(fromRow);
}

async function listPaymentLifecycleByInvoiceNumbers(invoiceNumbers: string[]): Promise<OrderPaymentLifecycle[]> {
  const invoices = [...new Set(invoiceNumbers.map(normalizeInvoiceNumber).filter((value): value is string => Boolean(value)))];
  if (invoices.length === 0) return [];
  const invoiceList = invoices.map(quote).join(",");
  const rows = await supabaseRequest<PaymentLifecycleRow[]>(
    `order_payment_lifecycle_v?select=*&or=(primary_invoice_number.in.(${invoiceList}),deposit_invoice_number.in.(${invoiceList}),balance_invoice_number.in.(${invoiceList}))`,
  );
  return (rows || []).map(fromRow);
}

function lifecycleMatchesOrder(order: UiOrder, lifecycle: OrderPaymentLifecycle) {
  const orderInvoice = normalizeInvoiceNumber(order.xeroInvoiceNumber);
  if (!orderInvoice) return false;
  return [
    lifecycle.primaryInvoiceNumber,
    lifecycle.depositInvoiceNumber,
    lifecycle.balanceInvoiceNumber,
  ].some((invoice) => normalizeInvoiceNumber(invoice) === orderInvoice);
}

export async function enrichOrdersWithPaymentLifecycle(orders: UiOrder[]): Promise<UiOrder[]> {
  const lifecycles = await listPaymentLifecycleByInvoiceNumbers(orders.map((order) => order.xeroInvoiceNumber).filter(Boolean) as string[]);
  if (lifecycles.length === 0) return orders;
  return orders.map((order) => {
    const lifecycle = lifecycles.find((candidate) => lifecycleMatchesOrder(order, candidate));
    if (!lifecycle) return order;
    return {
      ...order,
      paymentStage: lifecycle.paymentStage,
      paymentStageLabel: lifecycle.paymentStageLabel,
      paymentNextAction: lifecycle.paymentNextAction,
      depositInvoiceNumber: lifecycle.depositInvoiceNumber,
      depositPaidAt: lifecycle.depositPaidAt,
      balanceInvoiceNumber: lifecycle.balanceInvoiceNumber,
      balanceAmountDue: lifecycle.balanceAmountDue,
      balanceDueAt: lifecycle.balanceDueAt,
      balanceSentAt: lifecycle.balanceSentAt,
      balancePaidAt: lifecycle.balancePaidAt,
    };
  });
}
