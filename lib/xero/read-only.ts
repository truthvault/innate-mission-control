import "server-only";

import { readFile } from "node:fs/promises";
type Source = "env" | "hermes";
type Credentials = { clientId: string; clientSecret: string; source: Source };
type XeroConnection = { tenantId?: string; tenantName?: string };
type XeroInvoice = {
  InvoiceID?: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  Reference?: string;
  DateString?: string;
  DueDateString?: string;
  SentToContact?: boolean;
  Contact?: { Name?: string };
  Total?: number;
  AmountDue?: number;
  AmountPaid?: number;
  LineItems?: Array<{ Description?: string; Quantity?: number; UnitAmount?: number; LineAmount?: number }>;
  Url?: string;
};

type InvoiceResponse = { Invoices?: XeroInvoice[] };
type OrganisationResponse = { Organisations?: Array<{ Name?: string; OrganisationID?: string; ShortCode?: string }> };

export type XeroInvoiceSummary = ReturnType<typeof summary>;

export type XeroReadiness = {
  configured: boolean;
  source: Source | null;
  envNames: string[];
  configPath?: string;
  reason?: string;
};

const TOKEN_URL = "https://identity.xero.com/connect/token";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const ACCOUNTING_URL = "https://api.xero.com/api.xro/2.0";
const SCOPE = "accounting.invoices accounting.contacts accounting.settings accounting.reports.read";
const HERMES_INTEGRATIONS_PATH = "/Users/mack-mini/.hermes/secrets/innate-integrations.json";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hermesIntegrationsPath() {
  return process.env.XERO_HERMES_INTEGRATIONS_PATH || HERMES_INTEGRATIONS_PATH;
}

async function hermesCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ hermesIntegrationsPath(), "utf8");
    const parsed = JSON.parse(raw) as { mcp?: { servers?: { xero?: { env?: Record<string, string> } } } };
    const env = parsed.mcp?.servers?.xero?.env || {};
    const clientId = text(env.XERO_CLIENT_ID);
    const clientSecret = text(env.XERO_CLIENT_SECRET);
    return clientId && clientSecret ? { clientId, clientSecret, source: "hermes" } : null;
  } catch {
    return null;
  }
}

async function credentials(): Promise<Credentials | null> {
  const clientId = text(process.env.XERO_CLIENT_ID);
  const clientSecret = text(process.env.XERO_CLIENT_SECRET);
  if (clientId && clientSecret) return { clientId, clientSecret, source: "env" };
  return hermesCredentials();
}

export async function getXeroReadiness(): Promise<XeroReadiness> {
  const envNames = ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"];
  const found = await credentials();
  if (!found) {
    return { configured: false, source: null, envNames, configPath: hermesIntegrationsPath(), reason: "Xero read-only credentials are not configured in env or Hermes integrations storage." };
  }
  return { configured: true, source: found.source, envNames, configPath: found.source === "hermes" ? hermesIntegrationsPath() : undefined };
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
    type: invoice.Type || null,
    contact: invoice.Contact?.Name || null,
    status: invoice.Status || null,
    reference: invoice.Reference || null,
    date: invoice.DateString || null,
    dueDate: invoice.DueDateString || null,
    sentToContact: typeof invoice.SentToContact === "boolean" ? invoice.SentToContact : null,
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

export async function listXeroInvoiceSummaries(options: { invoiceNumber?: string | null; search?: string | null; includeLineItems?: boolean; pageSize?: number }) {
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", String(Math.max(1, Math.min(100, options.pageSize ?? 10))));
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
export async function listRecentXeroInvoiceSummaries(options: { includeLineItems?: boolean; pageSize?: number } = {}) {
  return listXeroInvoiceSummaries({ includeLineItems: options.includeLineItems, pageSize: options.pageSize ?? 50 });
}
