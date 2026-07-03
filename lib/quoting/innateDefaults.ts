import type { QuotePriceSnapshot } from "./engine.ts";

export type QuoteSupplierSeed = {
  slug: string;
  name: string;
  supplierType: "timber" | "machining" | "freight" | "internal" | "finance" | "website" | "other";
  notes: string;
};

export type QuoteBusinessRuleSeed = {
  ruleKey: string;
  ruleType: "margin" | "gst" | "supplier_workflow" | "terms" | "calculator" | "freight" | "safety" | "xero";
  title: string;
  ruleValue: Record<string, unknown>;
  blocksReady: boolean;
  sourceLabel: string;
  notes: string;
};

export const QUOTE_SUPPLIER_SEEDS: QuoteSupplierSeed[] = [
  { slug: "westimber", name: "Westimber", supplierType: "timber", notes: "Timber handling, pickup/dropoff, dressing and related supplier services." },
  { slug: "precision-woodworks", name: "Precision Woodworks", supplierType: "machining", notes: "Outsource CNC/joiner-system/programming reference." },
  { slug: "mainfreight", name: "Mainfreight", supplierType: "freight", notes: "Freight estimate source." },
  { slug: "innate-internal", name: "Innate internal labour and buffers", supplierType: "internal", notes: "Internal labour, finish, packaging, admin and buffers." },
  { slug: "xero", name: "Xero", supplierType: "finance", notes: "Quote/invoice/account-code and supplier-bill evidence." },
  { slug: "website-configurator", name: "Innate website/configurator logic", supplierType: "website", notes: "Current website/configurator pricing and calculator logic." },
];

export const QUOTE_BUSINESS_RULE_SEEDS: QuoteBusinessRuleSeed[] = [
  {
    ruleKey: "standard_gross_margin_50",
    ruleType: "margin",
    title: "Standard quoting target is 50% gross margin",
    ruleValue: { grossMarginPercent: 50, formula: "sell_ex_gst = total_cost_ex_gst / (1 - 0.50)", doNotUseMarkup: true },
    blocksReady: true,
    sourceLabel: "Guido Council correction 2026-05-27",
    notes: "Do not invent markup percentages. 50% gross margin means sell price is 2x cost, before GST.",
  },
  {
    ruleKey: "nz_gst_15",
    ruleType: "gst",
    title: "NZ GST is 15%",
    ruleValue: { gstRate: 0.15, customerResidentialTotalsUsuallyInclGst: true },
    blocksReady: true,
    sourceLabel: "Innate Xero quote process reference",
    notes: "Show ex GST workings internally and incl GST customer totals when relevant.",
  },
  {
    ruleKey: "westimber_whole_job_pickup_dropoff",
    ruleType: "supplier_workflow",
    title: "Westimber handles the whole supplier pickup/dropoff workflow when scoped that way",
    ruleValue: {
      supplier: "Westimber",
      quoteRule: "Do not add a second pickup/dropoff chain if Westimber already handles the whole job.",
      kelvenException: "For the Kelven shelf/panel add-on, only add the agreed $50 pickup/dropoff allowance unless Guido overrides.",
    },
    blocksReady: true,
    sourceLabel: "Guido Council correction 2026-05-27",
    notes: "Hermes must ask or source-check before adding extra transport/machining handling lines.",
  },
  {
    ruleKey: "quote_terms_payment_confirms_order",
    ruleType: "terms",
    title: "Payment wording for normal made-to-order quotes",
    ruleValue: {
      underFiveK: "Payment confirms the order and secures the workshop slot.",
      overFiveK: "A 50% deposit confirms the order and secures the workshop slot, with the balance due on completion before delivery.",
      avoid: "Payment due on acceptance before collection.",
    },
    blocksReady: true,
    sourceLabel: "Guido Council correction 2026-05-26",
    notes: "Use the customer-visible quote terms, not invented legal/payment phrasing.",
  },
  {
    ruleKey: "quote_terms_lead_time_after_acceptance",
    ruleType: "terms",
    title: "Lead time wording for quoted work",
    ruleValue: {
      standard: "Lead time is confirmed after acceptance and supplier/workshop scheduling.",
      standardKnown: "Lead time is 6 weeks for standard items unless a shorter agreed lead time is explicitly confirmed.",
      avoid: "Lead time to be confirmed after acceptance and machining/dressing.",
    },
    blocksReady: true,
    sourceLabel: "Guido Council correction 2026-05-26",
    notes: "Do not invent terms because a job includes machining/dressing.",
  },
  {
    ruleKey: "panel_calculator_assumptions",
    ruleType: "calculator",
    title: "Panel calculator is an internal estimate source, not a final truth by itself",
    ruleValue: {
      url: "https://innate-calc.vercel.app/",
      observedDefaultMarginPercent: 80,
      placeholderSpeciesNeedConfirmation: ["West Coast Beech", "Northland Totara", "Canterbury Nitens"],
      recordInputs: ["dimensions", "quantity", "species", "finish", "delivery", "margin", "cutouts", "manual adders"],
    },
    blocksReady: true,
    sourceLabel: "Innate calculators reference",
    notes: "Calculator margin semantics must be reconciled before treating old calculator output as supplier-price truth.",
  },
  {
    ruleKey: "freight_estimator_rules",
    ruleType: "freight",
    title: "Freight estimator rules stay separate from product cost",
    ruleValue: {
      localChristchurchRule: "Use local delivery matrix where applicable.",
      outsideChristchurchMarkupPerTable: 100,
      outsideChristchurchMarkupPerBench: 50,
      highFreightManualCheckThresholdInclGst: 600,
    },
    blocksReady: true,
    sourceLabel: "Mission Control freight estimator",
    notes: "Freight is a quote line/source with its own freshness, not a hidden product-cost fudge.",
  },
  {
    ruleKey: "stale_supplier_price_blocks_ready_to_quote",
    ruleType: "safety",
    title: "Stale supplier prices block ready-to-quote",
    ruleValue: { defaultFreshnessDays: 30, staleAction: "refresh source or ask Guido before quoting" },
    blocksReady: true,
    sourceLabel: "Innate Quote Spine V1 plan",
    notes: "Hermes can still show draft workings, but must label them blocked.",
  },
  {
    ruleKey: "xero_draft_only_until_approved",
    ruleType: "xero",
    title: "Xero output is dry-run only until Guido approves",
    ruleValue: { allowDraftPayload: true, allowCreateDraftWithoutApproval: false, allowSend: false },
    blocksReady: true,
    sourceLabel: "Innate Quote Spine V1 plan",
    notes: "Quote worker may prepare payloads, not send or publish.",
  },
];

export function freshSnapshot(input: Omit<QuotePriceSnapshot, "status" | "confidence"> & Partial<Pick<QuotePriceSnapshot, "status" | "confidence">>): QuotePriceSnapshot {
  return {
    status: "active",
    confidence: "high",
    ...input,
  };
}

export function quoteRuleSummaryForHermes(): string {
  return QUOTE_BUSINESS_RULE_SEEDS.map((rule) => `- ${rule.ruleKey}: ${rule.title}`).join("\n");
}
