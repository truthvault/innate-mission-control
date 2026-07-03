export type QuoteLineType =
  | "material"
  | "labour"
  | "supplier_service"
  | "freight"
  | "machining"
  | "finish"
  | "packaging"
  | "discount"
  | "buffer"
  | "other";

export type QuoteFreshnessStatus = "fresh" | "stale" | "unknown" | "not_required";

export type QuoteBlockerCode =
  | "missing_cost"
  | "stale_price"
  | "inactive_price"
  | "below_target_margin"
  | "invalid_quantity"
  | "invalid_margin";

export type QuoteWarningCode =
  | "manual_price_no_snapshot"
  | "unknown_price_age"
  | "below_target_margin_warning"
  | "no_source_label"
  | "customer_wording_required";

export type QuotePriceSnapshot = {
  priceCode: string;
  description: string;
  unit: string;
  unitCostExGst: number | null;
  supplierName?: string;
  sourceType?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourceCapturedAt?: string | null;
  freshnessDays?: number | null;
  confidence?: "high" | "medium" | "low" | "unknown";
  status?: "active" | "draft" | "superseded" | "archived";
};

export type QuoteCostLineInput = {
  label: string;
  lineType: QuoteLineType;
  quantity?: number;
  unit?: string;
  unitCostExGst?: number | null;
  sourceSnapshot?: QuotePriceSnapshot | null;
  requiresFreshPrice?: boolean;
  businessRuleKey?: string;
  accountCode?: string;
  taxType?: string;
  notes?: string;
};

export type QuoteScenarioInput = {
  requestName: string;
  customerName?: string;
  productArea?: "residential" | "commercial" | "benchtop_panel" | "outdoor" | "other";
  scenarioName?: string;
  now?: string | Date;
  gstRate?: number;
  targetGrossMarginPercent?: number;
  enforceTargetMargin?: boolean;
  explicitSellPriceExGst?: number;
  costLines: QuoteCostLineInput[];
  assumptions?: string[];
  customerSummary?: string;
  paymentTerms?: string;
  leadTimeTerms?: string;
  xero?: {
    contactName?: string;
    reference?: string;
    title?: string;
    summary?: string;
    lineDescription?: string;
    accountCode?: string;
  };
};

export type QuoteBlocker = { code: QuoteBlockerCode; message: string; lineLabel?: string };
export type QuoteWarning = { code: QuoteWarningCode; message: string; lineLabel?: string };

export type QuoteCostLineResult = {
  label: string;
  lineType: QuoteLineType;
  quantity: number;
  unit: string;
  unitCostExGst: number | null;
  lineCostExGst: number | null;
  sourcePriceCode?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  freshnessStatus: QuoteFreshnessStatus;
  ageDays?: number;
  accountCode: string;
  taxType: string;
  notes?: string;
};

export type QuoteScenarioResult = {
  requestName: string;
  scenarioName: string;
  readyToQuote: boolean;
  subtotalCostExGst: number;
  sellPriceExGst: number;
  sellPriceInclGst: number;
  grossProfitExGst: number;
  grossMarginPercent: number;
  targetGrossMarginPercent: number;
  gstRate: number;
  costLines: QuoteCostLineResult[];
  blockers: QuoteBlocker[];
  warnings: QuoteWarning[];
  assumptions: string[];
  customerSummary: string;
  paymentTerms: string;
  leadTimeTerms: string;
};

export type XeroDraftPayload = {
  mode: "dry_run";
  docType: "quote";
  contactName: string | null;
  reference: string;
  title: string;
  summary: string;
  lineAmountTypes: "EXCLUSIVE";
  terms: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode: string;
    taxType: "OUTPUT2";
  }>;
  validation: {
    readyToQuote: boolean;
    blockers: QuoteBlocker[];
    warnings: QuoteWarning[];
    sellPriceInclGst: number;
    grossMarginPercent: number;
  };
};

const DEFAULT_GST_RATE = 0.15;
const DEFAULT_TARGET_GROSS_MARGIN_PERCENT = 50;
const OUTPUT_TAX_TYPE = "OUTPUT2";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function asDate(value: string | Date | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.trim()) return new Date(value);
  return new Date();
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function ageDays(capturedAt: string | null | undefined, now: Date): number | undefined {
  if (!capturedAt) return undefined;
  const captured = new Date(capturedAt);
  if (!validDate(captured) || !validDate(now)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - captured.getTime()) / 86_400_000));
}

function accountCodeFor(lineType: QuoteLineType, productArea: QuoteScenarioInput["productArea"], override?: string): string {
  if (override) return override;
  if (lineType === "freight" || lineType === "packaging") return "250";
  if (productArea === "commercial") return "210";
  return "200";
}

function money(value: number): string {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(roundMoney(value));
}

function freshnessFor(snapshot: QuotePriceSnapshot | null | undefined, now: Date, requiresFreshPrice: boolean): {
  status: QuoteFreshnessStatus;
  age?: number;
  blocker?: QuoteBlocker;
  warning?: QuoteWarning;
} {
  if (!requiresFreshPrice) return { status: "not_required" };
  if (!snapshot) return { status: "not_required" };
  if (snapshot.status && snapshot.status !== "active") {
    return {
      status: "stale",
      blocker: { code: "inactive_price", message: `Price snapshot ${snapshot.priceCode} is ${snapshot.status}.` },
    };
  }
  const days = ageDays(snapshot.sourceCapturedAt, now);
  const freshnessDays = snapshot.freshnessDays ?? null;
  if (days === undefined) {
    return {
      status: "unknown",
      warning: { code: "unknown_price_age", message: `Price snapshot ${snapshot.priceCode} has no valid captured date.` },
    };
  }
  if (freshnessDays !== null && days > freshnessDays) {
    return {
      status: "stale",
      age: days,
      blocker: {
        code: "stale_price",
        message: `Price snapshot ${snapshot.priceCode} is ${days} days old; freshness limit is ${freshnessDays} days.`,
      },
    };
  }
  return { status: "fresh", age: days };
}

function lineUnitCost(line: QuoteCostLineInput): number | null {
  if (typeof line.unitCostExGst === "number" && Number.isFinite(line.unitCostExGst)) return line.unitCostExGst;
  const snapshotCost = line.sourceSnapshot?.unitCostExGst;
  return typeof snapshotCost === "number" && Number.isFinite(snapshotCost) ? snapshotCost : null;
}

function customerTerms(input: QuoteScenarioInput): { paymentTerms: string; leadTimeTerms: string } {
  return {
    paymentTerms: input.paymentTerms || "Payment confirms the order and secures the workshop slot.",
    leadTimeTerms: input.leadTimeTerms || "Lead time is confirmed after acceptance and supplier/workshop scheduling.",
  };
}

export function buildQuoteScenario(input: QuoteScenarioInput): QuoteScenarioResult {
  const now = asDate(input.now);
  const gstRate = input.gstRate ?? DEFAULT_GST_RATE;
  const targetGrossMarginPercent = input.targetGrossMarginPercent ?? DEFAULT_TARGET_GROSS_MARGIN_PERCENT;
  const targetMarginRate = targetGrossMarginPercent / 100;
  const enforceTargetMargin = input.enforceTargetMargin ?? true;
  const blockers: QuoteBlocker[] = [];
  const warnings: QuoteWarning[] = [];
  const costLines: QuoteCostLineResult[] = [];

  if (!Number.isFinite(targetMarginRate) || targetMarginRate <= 0 || targetMarginRate >= 1) {
    blockers.push({ code: "invalid_margin", message: "Target gross margin must be between 0 and 100%." });
  }

  for (const line of input.costLines) {
    const quantity = line.quantity ?? 1;
    const unit = line.unit || line.sourceSnapshot?.unit || "each";
    const unitCost = lineUnitCost(line);
    const requiresFreshPrice = line.requiresFreshPrice ?? Boolean(line.sourceSnapshot);
    const freshness = freshnessFor(line.sourceSnapshot, now, requiresFreshPrice);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      blockers.push({ code: "invalid_quantity", message: `${line.label} has an invalid quantity.`, lineLabel: line.label });
    }
    if (unitCost === null) {
      blockers.push({ code: "missing_cost", message: `${line.label} has no unit cost.`, lineLabel: line.label });
    }
    if (freshness.blocker) blockers.push({ ...freshness.blocker, lineLabel: line.label });
    if (freshness.warning) warnings.push({ ...freshness.warning, lineLabel: line.label });
    if (!line.sourceSnapshot && line.unitCostExGst !== undefined && line.requiresFreshPrice !== false) {
      warnings.push({ code: "manual_price_no_snapshot", message: `${line.label} uses a manual cost without a supplier snapshot.`, lineLabel: line.label });
    }
    if (line.sourceSnapshot && !line.sourceSnapshot.sourceLabel) {
      warnings.push({ code: "no_source_label", message: `${line.label} price snapshot has no source label.`, lineLabel: line.label });
    }

    costLines.push({
      label: line.label,
      lineType: line.lineType,
      quantity,
      unit,
      unitCostExGst: unitCost,
      lineCostExGst: unitCost === null || !Number.isFinite(quantity) ? null : roundMoney(unitCost * quantity),
      sourcePriceCode: line.sourceSnapshot?.priceCode,
      sourceLabel: line.sourceSnapshot?.sourceLabel,
      sourceUrl: line.sourceSnapshot?.sourceUrl,
      freshnessStatus: freshness.status,
      ageDays: freshness.age,
      accountCode: accountCodeFor(line.lineType, input.productArea, line.accountCode),
      taxType: line.taxType || OUTPUT_TAX_TYPE,
      notes: line.notes,
    });
  }

  const subtotalCostExGst = roundMoney(costLines.reduce((sum, line) => sum + (line.lineCostExGst ?? 0), 0));
  const calculatedSellExGst = targetMarginRate > 0 && targetMarginRate < 1 ? subtotalCostExGst / (1 - targetMarginRate) : subtotalCostExGst;
  const sellPriceExGst = roundMoney(input.explicitSellPriceExGst ?? calculatedSellExGst);
  const sellPriceInclGst = roundMoney(sellPriceExGst * (1 + gstRate));
  const grossProfitExGst = roundMoney(sellPriceExGst - subtotalCostExGst);
  const grossMarginPercent = sellPriceExGst > 0 ? roundPercent((grossProfitExGst / sellPriceExGst) * 100) : 0;

  if (input.explicitSellPriceExGst !== undefined && grossMarginPercent + 0.05 < targetGrossMarginPercent) {
    const message = `Explicit sell price gives ${grossMarginPercent}% gross margin, below target ${targetGrossMarginPercent}%.`;
    if (enforceTargetMargin) blockers.push({ code: "below_target_margin", message });
    else warnings.push({ code: "below_target_margin_warning", message });
  }

  if (!input.customerSummary) {
    warnings.push({ code: "customer_wording_required", message: "Customer-facing summary should be written before sending or drafting in Xero." });
  }

  const terms = customerTerms(input);

  return {
    requestName: input.requestName,
    scenarioName: input.scenarioName || "Recommended",
    readyToQuote: blockers.length === 0,
    subtotalCostExGst,
    sellPriceExGst,
    sellPriceInclGst,
    grossProfitExGst,
    grossMarginPercent,
    targetGrossMarginPercent,
    gstRate,
    costLines,
    blockers,
    warnings,
    assumptions: input.assumptions || [],
    customerSummary: input.customerSummary || "",
    paymentTerms: terms.paymentTerms,
    leadTimeTerms: terms.leadTimeTerms,
  };
}

export function buildXeroDraftPayload(input: QuoteScenarioInput, result = buildQuoteScenario(input)): XeroDraftPayload {
  const title = input.xero?.title || input.requestName;
  const description = input.xero?.lineDescription || [title, input.customerSummary].filter(Boolean).join("\n");
  const accountCode = input.xero?.accountCode || (input.productArea === "commercial" ? "210" : "200");
  return {
    mode: "dry_run",
    docType: "quote",
    contactName: input.xero?.contactName || input.customerName || null,
    reference: input.xero?.reference || input.requestName,
    title,
    summary: input.xero?.summary || "",
    lineAmountTypes: "EXCLUSIVE",
    terms: [result.paymentTerms, result.leadTimeTerms, "Please check dimensions, timber, finish, and scope before accepting."].join("\n"),
    lineItems: [
      {
        description,
        quantity: 1,
        unitAmount: result.sellPriceExGst,
        accountCode,
    taxType: OUTPUT_TAX_TYPE,
      },
    ],
    validation: {
      readyToQuote: result.readyToQuote,
      blockers: result.blockers,
      warnings: result.warnings,
      sellPriceInclGst: result.sellPriceInclGst,
      grossMarginPercent: result.grossMarginPercent,
    },
  };
}

export function formatQuoteMarkdown(result: QuoteScenarioResult): string {
  const lines: string[] = [];
  lines.push(`# ${result.requestName}`);
  lines.push("");
  lines.push(result.readyToQuote ? "Status: ready for Guido review" : "Status: blocked before quoting");
  lines.push(`Scenario: ${result.scenarioName}`);
  lines.push(`Cost ex GST: ${money(result.subtotalCostExGst)}`);
  lines.push(`Sell ex GST: ${money(result.sellPriceExGst)}`);
  lines.push(`Sell incl GST: ${money(result.sellPriceInclGst)}`);
  lines.push(`Gross profit: ${money(result.grossProfitExGst)} (${result.grossMarginPercent}%)`);
  lines.push("");
  if (result.blockers.length) {
    lines.push("## Blockers");
    for (const blocker of result.blockers) lines.push(`- ${blocker.lineLabel ? `${blocker.lineLabel}: ` : ""}${blocker.message}`);
    lines.push("");
  }
  if (result.warnings.length) {
    lines.push("## Warnings");
    for (const warning of result.warnings) lines.push(`- ${warning.lineLabel ? `${warning.lineLabel}: ` : ""}${warning.message}`);
    lines.push("");
  }
  lines.push("## Cost Lines");
  for (const line of result.costLines) {
    const source = line.sourceLabel ? `, source: ${line.sourceLabel}` : "";
    const freshness = line.freshnessStatus !== "not_required" ? `, ${line.freshnessStatus}${line.ageDays !== undefined ? ` (${line.ageDays}d)` : ""}` : "";
    lines.push(`- ${line.label}: ${line.quantity} ${line.unit} x ${line.unitCostExGst === null ? "missing" : money(line.unitCostExGst)} = ${line.lineCostExGst === null ? "missing" : money(line.lineCostExGst)}${source}${freshness}`);
  }
  if (result.assumptions.length) {
    lines.push("");
    lines.push("## Assumptions");
    for (const assumption of result.assumptions) lines.push(`- ${assumption}`);
  }
  lines.push("");
  lines.push("## Customer Wording");
  lines.push(result.customerSummary || "Not written yet.");
  lines.push("");
  lines.push("## Terms");
  lines.push(`- ${result.paymentTerms}`);
  lines.push(`- ${result.leadTimeTerms}`);
  return lines.join("\n");
}
