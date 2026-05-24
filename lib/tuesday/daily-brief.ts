import type { Lead, LeadsResult } from "@/lib/leads/types";
import type { OrdersFetchResult } from "@/lib/monday/fetch-orders";
import type { UiOrder } from "@/lib/monday/mapping";
import type { SampleStockFetchResult } from "@/lib/monday/fetch-sample-stock";
import type { FreightQuoteRow } from "@/lib/freight/quoteLog";

export type SourceHealthState = "live" | "stale" | "fallback" | "missing" | "unverified";

export type OwnerActionKind =
  | "draft_follow_up"
  | "ask_nick"
  | "check_invoice"
  | "ignore_today"
  | "needs_guido_decision"
  | "verify_source"
  | "watch_only";

export type OwnerAction = {
  kind: OwnerActionKind;
  label: string;
};

export type DailyBriefItem = {
  id: string;
  title: string;
  detail: string;
  action?: string;
  ownerAction?: OwnerAction;
  whyThisMatters?: string;
  sourceLabel: string;
  sourceState: SourceHealthState;
  href?: string;
  severity: "watch" | "action" | "urgent";
};

export type DailyBriefSection = {
  title: string;
  empty: string;
  sourceLabel: string;
  sourceState: SourceHealthState;
  items: DailyBriefItem[];
};

export type DailyBrief = {
  title: "Owner Daily Brief";
  generatedAt: string;
  safeToIgnore: boolean;
  safeToIgnoreMessage?: string;
  mostImportantDecision: {
    prompt: string;
    sourceLabel: string;
    sourceState: SourceHealthState;
  };
  sourceHealth: Array<{
    label: string;
    state: SourceHealthState;
    detail: string;
    syncedAt?: string;
  }>;
  sections: {
    hotLeads: DailyBriefSection;
    staleFollowUps: DailyBriefSection;
    production: DailyBriefSection;
    customerPromises: DailyBriefSection;
    cash: DailyBriefSection;
    freightAndSamples: DailyBriefSection;
  };
};

export type DailyBriefInput = {
  now?: string;
  leads: LeadsResult;
  orders: OrdersFetchResult;
  samples: SampleStockFetchResult;
  freight: {
    rows: FreightQuoteRow[];
    source: SourceHealthState | "supabase" | "airtable" | "none";
    syncedAt: string;
    error?: string;
  };
  cash: {
    source: SourceHealthState;
    label: string;
    detail?: string;
    syncedAt?: string;
    riskStatus?: "green" | "yellow" | "red";
    overdueReceivables?: {
      count: number;
      amountDue: number;
      invoices?: Array<{ invoiceNumber: string | null; contact: string | null; dueDate: string | null; amountDue: number | null; xeroUrl: string | null }>;
    };
    payableBuckets?: Array<{
      label: "7 days" | "14 days" | "30 days" | string;
      count: number;
      amountDue: number;
      invoices?: Array<{ invoiceNumber: string | null; contact: string | null; dueDate: string | null; amountDue: number | null; xeroUrl: string | null }>;
    }>;
    tenantName?: string | null;
    error?: string;
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SECTION_ITEM_CAP = 3;
const CASH_ITEM_CAP = 4;
const TOTAL_BRIEF_ITEM_CAP = 12;

const OWNER_ACTIONS = {
  draft_follow_up: { kind: "draft_follow_up", label: "Draft follow-up" },
  ask_nick: { kind: "ask_nick", label: "Ask Nick" },
  check_invoice: { kind: "check_invoice", label: "Check invoice" },
  ignore_today: { kind: "ignore_today", label: "Ignore today" },
  needs_guido_decision: { kind: "needs_guido_decision", label: "Needs Guido decision" },
  verify_source: { kind: "verify_source", label: "Verify source" },
  watch_only: { kind: "watch_only", label: "Watch only" },
} satisfies Record<OwnerActionKind, OwnerAction>;

function verifySourceAction(sourceState: SourceHealthState): OwnerAction | undefined {
  return sourceState === "missing" || sourceState === "unverified" ? OWNER_ACTIONS.verify_source : undefined;
}

function leadHasEnoughFollowUpData(lead: Lead): boolean {
  return Boolean(lead.email || lead.phone || lead.sourceUrl || lead.nextAction);
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(now: Date, then: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

function daysUntil(now: Date, then: Date): number {
  return Math.ceil((then.getTime() - now.getTime()) / DAY_MS);
}

function money(value: number | undefined | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value);
}

function sourceStateFromLeads(result: LeadsResult): SourceHealthState {
  if (result.source === "supabase" && !result.error) return "live";
  if (result.source === "supabase" && result.error) return "unverified";
  return "missing";
}

function sourceStateFromOrders(result: OrdersFetchResult): SourceHealthState {
  if (result.source === "fresh" || result.source === "cache") return "live";
  if (result.source === "snapshot") return "stale";
  if (result.source === "none") return "missing";
  return "unverified";
}

function sourceStateFromSamples(result: SampleStockFetchResult): SourceHealthState {
  if (result.source === "fresh" || result.source === "cache") return "live";
  if (result.source === "snapshot") return "stale";
  if (result.source === "none") return "missing";
  return "unverified";
}

function sourceStateFromFreight(source: DailyBriefInput["freight"]["source"], error?: string): SourceHealthState {
  if (error && source !== "supabase" && source !== "airtable") return "missing";
  if (source === "supabase" || source === "airtable") return error ? "unverified" : "live";
  if (source === "none") return "missing";
  return source;
}

function valueSuffix(value: number | undefined): string {
  const formatted = money(value);
  return formatted ? ` · ${formatted}` : "";
}

function leadDetail(lead: Lead): string {
  return [lead.productCategory, lead.source, lead.status.replaceAll("_", " ")]
    .filter(Boolean)
    .join(" · ");
}

function isOpenLead(lead: Lead): boolean {
  return !["won", "lost", "parked"].includes(lead.status);
}

function isDailyBriefItem(item: DailyBriefItem | null): item is DailyBriefItem {
  return item !== null;
}

function buildHotLeadItems(leads: Lead[], sourceState: SourceHealthState): DailyBriefItem[] {
  return leads
    .filter((lead) =>
      isOpenLead(lead) &&
      (lead.priority === "hot" || lead.status === "new" || lead.status === "follow_up_due") &&
      ((lead.estimatedValue ?? 0) >= 5000 || lead.priority === "hot")
    )
    .slice(0, SECTION_ITEM_CAP)
    .map<DailyBriefItem>((lead) => ({
      id: `lead-hot-${lead.id}`,
      title: lead.customerName,
      detail: `${leadDetail(lead)}${valueSuffix(lead.estimatedValue)}`,
      action: lead.nextAction || "Check lead and draft the smallest next reply.",
      ownerAction: verifySourceAction(sourceState) || (leadHasEnoughFollowUpData(lead) ? OWNER_ACTIONS.draft_follow_up : OWNER_ACTIONS.needs_guido_decision),
      whyThisMatters: lead.estimatedValue ? `Potential ${money(lead.estimatedValue)} order; worth owner attention before it cools.` : "Hot buying signal; fast reply protects conversion.",
      sourceLabel: "Leads / Supabase",
      sourceState,
      href: "/leads",
      severity: lead.priority === "hot" ? "urgent" : "action",
    }));
}

function buildStaleLeadItems(leads: Lead[], now: Date, sourceState: SourceHealthState): DailyBriefItem[] {
  return leads
    .filter(isOpenLead)
    .map<DailyBriefItem | null>((lead) => {
      const dueDate = parseDate(lead.nextFollowUpAt);
      const lastTouch = parseDate(lead.lastInteractionAt || lead.updatedAt || lead.createdAt);
      const overdueDays = dueDate && dueDate.getTime() < now.getTime() ? daysBetween(now, dueDate) : null;
      const staleDays = lastTouch ? daysBetween(now, lastTouch) : 0;
      const isDue = overdueDays !== null || lead.status === "follow_up_due";
      const isStale = ["quoted", "qualifying", "waiting_on_customer"].includes(lead.status) && staleDays >= 7 && (lead.estimatedValue ?? 0) >= 5000;
      if (!isDue && !isStale) return null;
      const age = overdueDays !== null ? `${overdueDays} days overdue` : `${staleDays} days since last touch`;
      return {
        id: `lead-stale-${lead.id}`,
        title: lead.customerName,
        detail: `${age} · ${leadDetail(lead)}${valueSuffix(lead.estimatedValue)}`,
        action: lead.nextAction || "Draft follow-up or park with a reason.",
        ownerAction: verifySourceAction(sourceState) || OWNER_ACTIONS.draft_follow_up,
        whyThisMatters: `Stale quoted work can quietly become lost cash; decide whether to chase or park.`,
        sourceLabel: "Leads / Supabase",
        sourceState,
        href: "/leads",
        severity: overdueDays !== null && overdueDays >= 2 ? "urgent" : "action",
      } satisfies DailyBriefItem;
    })
    .filter(isDailyBriefItem)
    .slice(0, SECTION_ITEM_CAP);
}

function orderProductLabel(order: UiOrder): string {
  return order.rawMondayItem || order.product;
}

function buildProductionItems(orders: UiOrder[], now: Date, sourceState: SourceHealthState): DailyBriefItem[] {
  return orders
    .map<DailyBriefItem | null>((order) => {
      const shipDate = parseDate(order.shipDate ?? undefined);
      const dueIn = shipDate ? daysUntil(now, shipDate) : null;
      const missingDate = !order.shipDate && order.status !== "Collected" && order.status !== "Finished" && (order.value ?? 0) >= 5000;
      const late = dueIn !== null && dueIn < 0 && order.status !== "Collected";
      const dueSoonNotStarted = dueIn !== null && dueIn >= 0 && dueIn <= 3 && order.status === "Not Started";
      const blocked = /ordered|to process/i.test(order.rawMondayStatus || "") && dueIn !== null && dueIn <= 7;
      if (!late && !dueSoonNotStarted && !blocked && !missingDate) return null;
      const timing = late
        ? `${Math.abs(dueIn ?? 0)} days late`
        : missingDate
          ? "No ship date"
          : dueIn === 0
            ? "Due today"
            : `Due in ${dueIn} days`;
      return {
        id: `order-production-${order.id}`,
        title: order.customer,
        detail: `${timing} · ${orderProductLabel(order)} · ${order.rawMondayStatus || order.status}`,
        action: late ? "Decide recovery plan and whether a customer update is needed." : "Check whether this can be pulled forward or needs reprioritising.",
        ownerAction: verifySourceAction(sourceState) || (late || missingDate ? OWNER_ACTIONS.needs_guido_decision : OWNER_ACTIONS.ask_nick),
        whyThisMatters: late ? "Late production can force an awkward customer promise; decide the recovery message before the customer has to ask." : "Near-term blocker can still be fixed before it becomes customer-visible.",
        sourceLabel: "Orders / Monday",
        sourceState,
        href: "/production",
        severity: late ? "urgent" : "action",
      } satisfies DailyBriefItem;
    })
    .filter(isDailyBriefItem)
    .slice(0, SECTION_ITEM_CAP);
}

function buildPromiseItems(orders: UiOrder[], now: Date, sourceState: SourceHealthState): DailyBriefItem[] {
  return orders
    .map<DailyBriefItem | null>((order) => {
      if (order.status === "Collected") return null;
      const shipDate = parseDate(order.shipDate ?? undefined);
      const dueIn = shipDate ? daysUntil(now, shipDate) : null;
      const shipDatePassed = dueIn !== null && dueIn < 0;
      const missingFreight = !order.freightRef && order.deliveryLocation && dueIn !== null && dueIn <= 7;
      const missingInvoice = !order.xeroInvoiceNumber && order.value != null && order.value >= 5000;
      if (!shipDatePassed && !missingFreight && !missingInvoice) return null;
      const reasons = [
        shipDatePassed ? "ship date passed" : null,
        missingFreight ? "freight not confirmed" : null,
        missingInvoice ? "invoice link missing" : null,
      ].filter(Boolean).join(" · ");
      return {
        id: `order-promise-${order.id}`,
        title: order.customer,
        detail: `${reasons} · ${orderProductLabel(order)}${valueSuffix(order.value ?? undefined)}`,
        action: shipDatePassed ? "Draft a customer promise update for approval." : "Confirm owner of the promise before it becomes late.",
        ownerAction: verifySourceAction(sourceState) || OWNER_ACTIONS.needs_guido_decision,
        whyThisMatters: missingInvoice ? "Active high-value order has no visible invoice link; cash collection may be harder to verify." : "Customer-visible promise risk needs owner judgement before trust gets dented.",
        sourceLabel: "Orders / Monday",
        sourceState,
        href: "/production/dispatch",
        severity: shipDatePassed ? "urgent" : "watch",
      } satisfies DailyBriefItem;
    })
    .filter(isDailyBriefItem)
    .slice(0, SECTION_ITEM_CAP);
}

function buildFreightSampleItems(input: DailyBriefInput, samplesState: SourceHealthState, freightState: SourceHealthState): DailyBriefItem[] {
  const sampleItems = (input.samples.board?.summary.topUps || []).slice(0, 3).map((cell) => ({
    id: `sample-${cell.mondayItemId}`,
    title: `${cell.species} ${cell.finish} ${cell.sampleType}`,
    detail: `${cell.level === "out" ? "Out" : "Low"} sample stock · count ${cell.count}`,
    action: "Top up samples before the next outbound sample pack.",
    ownerAction: verifySourceAction(samplesState) || OWNER_ACTIONS.ask_nick,
    sourceLabel: "Samples / Monday",
    sourceState: samplesState,
    href: "/production/samples",
    severity: cell.level === "out" ? "action" : "watch",
  } satisfies DailyBriefItem));

  const freightItems = input.freight.rows
    .filter((row) => row.manualCheckOffered || (row.estimateInclGst ?? 0) >= 500 || /failed|manual/i.test(row.status))
    .slice(0, 3)
    .map((row) => ({
      id: `freight-${row.id}`,
      title: row.city || row.addressEntered || row.productHandle || "Freight quote",
      detail: `${row.manualCheckOffered ? "Manual check offered" : row.status}${row.estimateInclGst ? ` · ${money(row.estimateInclGst)}` : ""} · ${row.productHandle || "unknown product"}`,
      action: "Check quote before quoting or promising delivery.",
      ownerAction: verifySourceAction(freightState) || OWNER_ACTIONS.watch_only,
      sourceLabel: "Freight quotes",
      sourceState: freightState,
      href: "/freight-quotes",
      severity: "watch",
    } satisfies DailyBriefItem));

  return [...freightItems, ...sampleItems].slice(0, SECTION_ITEM_CAP);
}

function riskLabel(status: DailyBriefInput["cash"]["riskStatus"]): string {
  if (status === "red") return "Red cash risk";
  if (status === "yellow") return "Yellow cash risk";
  if (status === "green") return "Green cash risk";
  return "Cash risk needs verification";
}

function buildMissingInvoiceItems(orders: UiOrder[], sourceState: SourceHealthState): DailyBriefItem[] {
  return orders
    .filter((order) => order.status !== "Collected" && order.value != null && order.value >= 5000 && !order.xeroInvoiceNumber && !order.xero)
    .slice(0, 2)
    .map((order) => ({
      id: `cash-missing-invoice-${order.id}`,
      title: `${order.customer}: invoice link missing`,
      detail: `${orderProductLabel(order)}${valueSuffix(order.value ?? undefined)} · active order has no visible Xero invoice link`,
      action: "Verify invoice link before relying on this order in cash decisions.",
      ownerAction: verifySourceAction(sourceState) || OWNER_ACTIONS.check_invoice,
      whyThisMatters: "Large active orders without invoice proof can hide collection risk.",
      sourceLabel: "Orders / Monday",
      sourceState,
      href: "/production",
      severity: "action",
    } satisfies DailyBriefItem));
}

function emptyMessage(sourceState: SourceHealthState, clearMessage: string, missingMessage: string): string {
  return sourceState === "missing" || sourceState === "unverified" ? missingMessage : clearMessage;
}

function buildCashItems(input: DailyBriefInput, ordersState: SourceHealthState): DailyBriefItem[] {
  const cash = input.cash;
  const items: DailyBriefItem[] = [];
  const overdueAmount = cash.overdueReceivables?.amountDue ?? 0;
  const overdueCount = cash.overdueReceivables?.count ?? 0;
  const due7 = cash.payableBuckets?.find((bucket) => bucket.label === "7 days");
  const due14 = cash.payableBuckets?.find((bucket) => bucket.label === "14 days");
  const due30 = cash.payableBuckets?.find((bucket) => bucket.label === "30 days");

  items.push({
    id: "cash-risk",
    title: `${riskLabel(cash.riskStatus)}${cash.tenantName ? ` · ${cash.tenantName}` : ""}`,
    detail: cash.detail || "Read-only Xero cash summary is not available; use this card as a source-health warning only.",
    action: cash.source === "live" ? "Check the top cash exception only if this stays red/yellow or pairs with a missing invoice item." : "Treat cash numbers as unverified until the Xero source is live.",
    ownerAction: verifySourceAction(cash.source) || (cash.riskStatus === "red" || cash.riskStatus === "yellow" ? OWNER_ACTIONS.check_invoice : OWNER_ACTIONS.watch_only),
    whyThisMatters: cash.source === "live" ? "This is the owner-level cash exception view, not a full accounting dashboard." : "A missing or unverified Xero source should not silently look healthy.",
    sourceLabel: "Cash / Xero",
    sourceState: cash.source,
    severity: cash.riskStatus === "red" ? "urgent" : cash.riskStatus === "yellow" || cash.source !== "live" ? "action" : "watch",
  });

  if (cash.source === "live" && overdueCount > 0) {
    items.push({
      id: "cash-overdue-receivables",
      title: `${overdueCount} overdue receivable${overdueCount === 1 ? "" : "s"}`,
      detail: `${money(overdueAmount) || "$0"} overdue in Xero`,
      action: "Decide whether the top overdue invoice needs a human follow-up draft.",
      ownerAction: OWNER_ACTIONS.check_invoice,
      whyThisMatters: "Overdue receivables are immediate cash, not general admin.",
      sourceLabel: "Cash / Xero",
      sourceState: cash.source,
      severity: overdueAmount >= 10000 ? "urgent" : "action",
    });
  }

  if (cash.source === "live" && (due7?.count ?? 0) > 0) {
    items.push({
      id: "cash-payables-7-days",
      title: `${due7?.count ?? 0} bill${(due7?.count ?? 0) === 1 ? "" : "s"} due in 7 days`,
      detail: `${money(due7?.amountDue) || "$0"} due soon · 14 days ${money(due14?.amountDue) || "$0"} · 30 days ${money(due30?.amountDue) || "$0"}`,
      action: "Check whether near-term bills change deposit/follow-up priority today.",
      ownerAction: OWNER_ACTIONS.check_invoice,
      whyThisMatters: "Bills due this week can change which receivables and deposits matter most.",
      sourceLabel: "Cash / Xero",
      sourceState: cash.source,
      severity: (due7?.amountDue ?? 0) >= 10000 ? "urgent" : "action",
    });
  }

  return [...items, ...buildMissingInvoiceItems(input.orders.items, ordersState)].slice(0, CASH_ITEM_CAP);
}

function applyHardCap(sections: DailyBrief["sections"]): void {
  let remaining = TOTAL_BRIEF_ITEM_CAP;
  const orderedKeys: Array<keyof DailyBrief["sections"]> = ["customerPromises", "production", "hotLeads", "cash", "staleFollowUps", "freightAndSamples"];
  for (const key of orderedKeys) {
    const section = sections[key];
    section.items = section.items.slice(0, Math.max(0, remaining));
    remaining -= section.items.length;
  }
}

function chooseDecision(sections: DailyBrief["sections"]): DailyBrief["mostImportantDecision"] {
  const cashDecisionItems = sections.cash.items.filter((item) => item.sourceState !== "missing");
  const candidates = [
    ...sections.customerPromises.items,
    ...sections.production.items,
    ...sections.hotLeads.items,
    ...sections.staleFollowUps.items,
    ...cashDecisionItems,
    ...sections.freightAndSamples.items,
  ];
  const urgent = candidates.find((item) => item.severity === "urgent") || candidates[0];
  if (!urgent) {
    return {
      prompt: "No owner decision needed from the connected sources today.",
      sourceLabel: "Daily brief",
      sourceState: "live",
    };
  }
  return {
    prompt: `${urgent.title}: ${urgent.action || urgent.detail}`,
    sourceLabel: urgent.sourceLabel,
    sourceState: urgent.sourceState,
  };
}

export function buildDailyBrief(input: DailyBriefInput): DailyBrief {
  const generatedAt = input.now || new Date().toISOString();
  const now = parseDate(generatedAt) || new Date();
  const leadsState = sourceStateFromLeads(input.leads);
  const ordersState = sourceStateFromOrders(input.orders);
  const samplesState = sourceStateFromSamples(input.samples);
  const freightState = sourceStateFromFreight(input.freight.source, input.freight.error);

  const hotLeadItems = buildHotLeadItems(input.leads.rows, leadsState);
  const staleFollowUpItems = buildStaleLeadItems(input.leads.rows, now, leadsState);
  const productionItems = buildProductionItems(input.orders.items, now, ordersState);
  const promiseItems = buildPromiseItems(input.orders.items, now, ordersState);
  const freightAndSampleItems = buildFreightSampleItems(input, samplesState, freightState);
  const cashItems = buildCashItems(input, ordersState);

  const sections: DailyBrief["sections"] = {
    hotLeads: {
      title: "Hot leads / new enquiries",
      empty: emptyMessage(leadsState, "No hot leads visible in the connected lead source.", "Cannot verify hot leads because the lead source is missing or needs verification."),
      sourceLabel: "Leads / Supabase",
      sourceState: leadsState,
      items: hotLeadItems,
    },
    staleFollowUps: {
      title: "Stale follow-ups",
      empty: emptyMessage(leadsState, "No stale lead follow-ups visible.", "Cannot verify stale follow-ups because the lead source is missing or needs verification."),
      sourceLabel: "Leads / Supabase",
      sourceState: leadsState,
      items: staleFollowUpItems,
    },
    production: {
      title: "Production blockers / due soon",
      empty: emptyMessage(ordersState, "No late or due-soon production blockers visible.", "Cannot verify production blockers because the Monday orders source is missing or needs verification."),
      sourceLabel: "Orders / Monday",
      sourceState: ordersState,
      items: productionItems,
    },
    customerPromises: {
      title: "Customer promises at risk",
      empty: emptyMessage(ordersState, "No customer promise risks visible.", "Cannot verify customer promise risks because the Monday orders source is missing or needs verification."),
      sourceLabel: "Orders / Monday",
      sourceState: ordersState,
      items: promiseItems,
    },
    cash: {
      title: "Cash / Xero signal",
      empty: "Cash source not connected.",
      sourceLabel: "Cash / Xero",
      sourceState: input.cash.source,
      items: cashItems,
    },
    freightAndSamples: {
      title: "Freight / sample issues",
      empty: emptyMessage(freightState === "live" && samplesState === "live" ? "live" : freightState === "missing" && samplesState === "missing" ? "missing" : "unverified", "No freight or sample issues visible.", "Cannot verify freight/sample issues because one or more sources are missing or need verification."),
      sourceLabel: "Freight + Samples",
      sourceState: freightState === "live" && samplesState === "live" ? "live" : freightState === "missing" && samplesState === "missing" ? "missing" : "unverified",
      items: freightAndSampleItems,
    },
  };
  applyHardCap(sections);

  const actionableCashCount = cashItems.filter((item) => item.sourceState !== "missing" && (item.id !== "cash-risk" || input.cash.riskStatus === "red" || input.cash.riskStatus === "yellow")).length;
  const actionableCount = hotLeadItems.length + staleFollowUpItems.length + productionItems.length + promiseItems.length + freightAndSampleItems.length + actionableCashCount;
  const freightAndSamplesState = sections.freightAndSamples.sourceState;
  const hasUnverifiedSources = [leadsState, ordersState, samplesState, freightState, freightAndSamplesState, input.cash.source].some((state) => state === "missing" || state === "unverified");
  const safeToIgnore = actionableCount === 0 && !hasUnverifiedSources;
  const safeToIgnoreMessage = safeToIgnore
    ? "No action needed from you today from the connected sources."
    : actionableCount === 0 && hasUnverifiedSources
      ? "No connected issue is visible, but one or more sources could not be verified."
      : undefined;

  return {
    title: "Owner Daily Brief",
    generatedAt,
    safeToIgnore,
    safeToIgnoreMessage,
    mostImportantDecision: chooseDecision(sections),
    sourceHealth: [
      {
        label: "Leads / Supabase",
        state: leadsState,
        detail: input.leads.error || `${input.leads.rows.length} lead records visible`,
        syncedAt: input.leads.syncedAt,
      },
      {
        label: "Orders / Monday",
        state: ordersState,
        detail: input.orders.mondayError || `${input.orders.items.length} active orders visible`,
        syncedAt: input.orders.syncedAt,
      },
      {
        label: "Samples / Monday",
        state: samplesState,
        detail: input.samples.mondayError || `${input.samples.board?.summary.topUps.length ?? 0} sample top-ups visible`,
        syncedAt: input.samples.syncedAt,
      },
      {
        label: "Freight quotes",
        state: freightState,
        detail: input.freight.error || `${input.freight.rows.length} quote events visible`,
        syncedAt: input.freight.syncedAt,
      },
      {
        label: "Cash / Xero",
        state: input.cash.source,
        detail: input.cash.error || input.cash.detail || input.cash.label,
        syncedAt: input.cash.syncedAt,
      },
    ],
    sections,
  };
}
