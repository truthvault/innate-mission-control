import "server-only";

import { readFile } from "node:fs/promises";
type Source = "env" | "openclaw";
type Credentials = { clientId: string; clientSecret: string; source: Source };
type XeroConnection = { tenantId?: string; tenantName?: string };
type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: "ACCREC" | "ACCPAY" | string;
  Status?: string;
  Reference?: string;
  DateString?: string;
  DueDateString?: string;
  Contact?: { Name?: string };
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  LineItems?: Array<{ Description?: string; Quantity?: number; UnitAmount?: number; LineAmount?: number }>;
  Url?: string;
};

type InvoiceResponse = { Invoices?: XeroInvoice[] };
type OrganisationResponse = { Organisations?: Array<{ Name?: string; OrganisationID?: string; ShortCode?: string }> };

export type XeroReadiness = {
  configured: boolean;
  source: Source | null;
  envNames: string[];
  reason?: string;
};

const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const ACCOUNTING_URL = "https://api.xero.com/api.xro/2.0";
const SCOPE = "accounting.transactions.read accounting.contacts.read accounting.settings.read";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function openClawCredentials(): Promise<Credentials | null> {
  const configPath = process.env.XERO_OPENCLAW_CONFIG || "/Users/mack-mini/.openclaw/openclaw.json";
  try {
    const raw = await readFile(/* turbopackIgnore: true */ configPath, "utf8");
    const parsed = JSON.parse(raw) as { mcp?: { servers?: { xero?: { env?: Record<string, string> } } } };
    const env = parsed.mcp?.servers?.xero?.env || {};
    const clientId = text(env.XERO_CLIENT_ID);
    const clientSecret = text(env.XERO_CLIENT_SECRET);
    return clientId && clientSecret ? { clientId, clientSecret, source: "openclaw" } : null;
  } catch {
    return null;
  }
}

async function credentials(): Promise<Credentials | null> {
  const clientId = text(process.env.XERO_CLIENT_ID);
  const clientSecret = text(process.env.XERO_CLIENT_SECRET);
  if (clientId && clientSecret) return { clientId, clientSecret, source: "env" };
  return openClawCredentials();
}

export async function getXeroReadiness(): Promise<XeroReadiness> {
  const envNames = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"];
  const found = await credentials();
  if (!found) {
    return { configured: false, source: null, envNames, reason: "Xero read-only credentials are not configured for Tuesday." };
  }
  return { configured: true, source: found.source, envNames };
}

function safeError(raw: string): string {
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/Basic\s+[A-Za-z0-9._~+/-]+=*/gi, "Basic [REDACTED]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[REDACTED]")
    .slice(0, 700);
}

async function ok(response: Response, label: string) {
  if (response.ok) return;
  const body = safeError(await response.text().catch(() => ""));
  throw new Error(`${label} failed with HTTP ${response.status}${body ? `: ${body}` : ""}`);
}

async function token(creds: Credentials): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }),
    cache: "no-store",
  });
  await ok(response, "Xero token request");
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!json.access_token) throw new Error(`Xero token response did not include an access token${json.error ? `: ${json.error}` : ""}`);
  return json.access_token;
}

async function tenant(accessToken: string): Promise<{ tenantId: string; tenantName: string | null }> {
  const response = await fetch(CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" });
  await ok(response, "Xero connections request");
  const json = (await response.json()) as XeroConnection[];
  const connection = json.find((item) => item.tenantId) || json[0];
  if (!connection?.tenantId) throw new Error("Xero connection response did not include a tenant.");
  return { tenantId: connection.tenantId, tenantName: connection.tenantName || null };
}

async function get<T>(pathname: string, params = new URLSearchParams()): Promise<{ body: T; source: Source; tenantName: string | null }> {
  const creds = await credentials();
  if (!creds) throw new Error("Xero read-only credentials are not configured for Tuesday.");
  const accessToken = await token(creds);
  const linkedTenant = await tenant(accessToken);
  const url = new URL(`${ACCOUNTING_URL}${pathname}`);
  for (const [key, value] of params) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "xero-tenant-id": linkedTenant.tenantId, Accept: "application/json" },
    cache: "no-store",
  });
  await ok(response, `Xero ${pathname} request`);
  return { body: (await response.json()) as T, source: creds.source, tenantName: linkedTenant.tenantName };
}

function invoiceUrl(invoice: XeroInvoice) {
  return invoice.Url || (invoice.InvoiceID ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoice.InvoiceID}` : null);
}

function summary(invoice: XeroInvoice, includeLineItems: boolean) {
  return {
    invoiceId: invoice.InvoiceID || null,
    invoiceNumber: invoice.InvoiceNumber || null,
    contact: invoice.Contact?.Name || null,
    status: invoice.Status || null,
    reference: invoice.Reference || null,
    date: invoice.DateString || null,
    dueDate: invoice.DueDateString || null,
    total: typeof invoice.Total === "number" ? invoice.Total : null,
    amountDue: typeof invoice.AmountDue === "number" ? invoice.AmountDue : null,
    amountPaid: typeof invoice.AmountPaid === "number" ? invoice.AmountPaid : null,
    xeroUrl: invoiceUrl(invoice),
    lineItems: includeLineItems
      ? (invoice.LineItems || []).map((line) => ({
          description: line.Description || "",
          quantity: typeof line.Quantity === "number" ? line.Quantity : null,
          unitAmount: typeof line.UnitAmount === "number" ? line.UnitAmount : null,
          lineAmount: typeof line.LineAmount === "number" ? line.LineAmount : null,
        }))
      : undefined,
  };
}

export async function getXeroOrganisation() {
  const result = await get<OrganisationResponse>("/Organisation");
  const organisation = result.body.Organisations?.[0] || null;
  return {
    source: result.source,
    tenantName: result.tenantName,
    organisation: organisation
      ? { name: organisation.Name || null, shortCodePresent: Boolean(organisation.ShortCode), organisationIdPresent: Boolean(organisation.OrganisationID) }
      : null,
  };
}

export async function listXeroInvoiceSummaries(options: { invoiceNumber?: string | null; search?: string | null; includeLineItems?: boolean }) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "10");
  params.set("summaryOnly", options.includeLineItems ? "false" : "true");
  params.set("order", "UpdatedDateUTC DESC");
  if (options.invoiceNumber) params.append("InvoiceNumbers", options.invoiceNumber);
  if (options.search) params.set("searchTerm", options.search);
  const result = await get<InvoiceResponse>("/Invoices", params);
  return {
    source: result.source,
    tenantName: result.tenantName,
    invoices: (result.body.Invoices || []).map((invoice) => summary(invoice, Boolean(options.includeLineItems))),
  };
}

export type XeroCashRiskStatus = "green" | "yellow" | "red";
export type XeroCashInvoiceSummary = ReturnType<typeof summary>;
export type XeroCashDueBucket = {
  label: "7 days" | "14 days" | "30 days";
  count: number;
  amountDue: number;
  invoices: XeroCashInvoiceSummary[];
};
export type XeroCashSummary = {
  syncedAt: string;
  tenantName: string | null;
  riskStatus: XeroCashRiskStatus;
  overdueReceivables: {
    count: number;
    amountDue: number;
    invoices: XeroCashInvoiceSummary[];
  };
  payableBuckets: XeroCashDueBucket[];
};

function parseXeroDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const msMatch = value.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
  const date = msMatch ? new Date(Number(msMatch[1])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dueInDays(now: Date, dueDate: string | null | undefined): number | null {
  const parsed = parseXeroDate(dueDate);
  if (!parsed) return null;
  return Math.ceil((startOfDay(parsed).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000));
}

async function listOpenXeroInvoicesByType(type: "ACCREC" | "ACCPAY") {
  const pageSize = 100;
  const invoices: XeroCashInvoiceSummary[] = [];
  let tenantName: string | undefined;

  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("summaryOnly", "true");
    params.set("where", `Type==\"${type}\"&&Status==\"AUTHORISED\"`);
    const result = await get<InvoiceResponse>("/Invoices", params);
    tenantName ||= result.tenantName || undefined;
    const pageInvoices = (result.body.Invoices || [])
      .filter((invoice) => (invoice.AmountDue ?? 0) > 0)
      .map((invoice) => summary(invoice, false));
    invoices.push(...pageInvoices);
    if ((result.body.Invoices || []).length < pageSize) break;
  }

  return {
    tenantName,
    invoices: invoices.sort((a, b) => {
      const aDue = parseXeroDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = parseXeroDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    }),
  };
}

function totalDue(invoices: XeroCashInvoiceSummary[]): number {
  return invoices.reduce((sum, invoice) => sum + (invoice.amountDue || 0), 0);
}

function payableBucket(label: XeroCashDueBucket["label"], maxDays: number, now: Date, invoices: XeroCashInvoiceSummary[]): XeroCashDueBucket {
  const bucketInvoices = invoices.filter((invoice) => {
    const dueIn = dueInDays(now, invoice.dueDate);
    return dueIn !== null && dueIn >= 0 && dueIn <= maxDays;
  });
  return {
    label,
    count: bucketInvoices.length,
    amountDue: totalDue(bucketInvoices),
    invoices: bucketInvoices.slice(0, 5),
  };
}

export async function getXeroCashSummary(options: { now?: string } = {}): Promise<XeroCashSummary> {
  const now = parseXeroDate(options.now) || new Date();
  const [receivables, payables] = await Promise.all([
    listOpenXeroInvoicesByType("ACCREC"),
    listOpenXeroInvoicesByType("ACCPAY"),
  ]);

  const overdueReceivables = receivables.invoices.filter((invoice) => {
    const dueIn = dueInDays(now, invoice.dueDate);
    return dueIn !== null && dueIn < 0;
  });
  const payableBuckets: XeroCashDueBucket[] = [
    payableBucket("7 days", 7, now, payables.invoices),
    payableBucket("14 days", 14, now, payables.invoices),
    payableBucket("30 days", 30, now, payables.invoices),
  ];
  const dueSoonPayables = payableBuckets[0].amountDue;
  const overdueAmount = totalDue(overdueReceivables);
  const riskStatus: XeroCashRiskStatus = overdueAmount > 10000 || dueSoonPayables > 10000 ? "red" : overdueAmount > 0 || dueSoonPayables > 0 ? "yellow" : "green";

  return {
    syncedAt: new Date().toISOString(),
    tenantName: receivables.tenantName || payables.tenantName || null,
    riskStatus,
    overdueReceivables: {
      count: overdueReceivables.length,
      amountDue: overdueAmount,
      invoices: overdueReceivables.slice(0, 5),
    },
    payableBuckets,
  };
}
