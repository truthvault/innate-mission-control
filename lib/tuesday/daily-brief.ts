import type { LeadsResult, Lead } from "@/lib/leads/types";
import type { OrdersFetchResult } from "@/lib/monday/fetch-orders";
import type { SampleStockFetchResult } from "@/lib/monday/fetch-sample-stock";
import type { UiOrder } from "@/lib/monday/mapping";

export type DailyBriefTone = "good" | "neutral" | "warning" | "danger";
export type DailyBriefSource = "supabase" | "monday" | "blob" | "xero" | "fallback";

export type DailyBriefItem = {
  title: string;
  detail: string;
  tone: DailyBriefTone;
  source: DailyBriefSource;
  href?: string;
  meta?: string;
};

export type DailyBriefSection = {
  id: "decisions" | "leads" | "production" | "samples" | "cash" | "source-health";
  title: string;
  subtitle: string;
  items: DailyBriefItem[];
};

export type DailyBriefDecision = {
  label: string;
  detail: string;
  tone: DailyBriefTone;
};

export type DailyBriefSummary = {
  hotLeads: number;
  productionRisks: number;
  sampleIssues: number;
  sourcesWithWarnings: number;
};

export type DailyBriefXeroStatus = {
  source: "read_only" | "not_connected";
  label: string;
  tone: "neutral" | "warning" | "danger" | "good";
  detail?: string;
};

export type BuildDailyBriefInput = {
  now?: string;
  leads: LeadsResult;
  orders: OrdersFetchResult;
  sampleStock: SampleStockFetchResult;
  xero?: DailyBriefXeroStatus;
};

export type DailyBrief = {
  title: "Owner Daily Brief";
  generatedAt: string;
  decision: DailyBriefDecision;
  summary: DailyBriefSummary;
  sections: DailyBriefSection[];
};

const ACTIVE_LEAD_STATUSES = new Set<Lead["status"]>(["new", "qualifying", "quoted", "follow_up_due", "waiting_on_customer"]);
const ACTIVE_ORDER_STATUSES = new Set<UiOrder["status"]>(["Not Started", "In Production", "Finished"]);

function dateOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${dateOnly(start)}T00:00:00.000Z`);
  const endDate = new Date(`${dateOnly(end)}T00:00:00.000Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function currency(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "value unknown";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function humanDate(isoOrDate?: string | null): string {
  if (!isoOrDate) return "no date";
  return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", day: "numeric", month: "short" }).format(new Date(`${dateOnly(isoOrDate)}T12:00:00.000Z`));
}

function leadUrgency(lead: Lead, now: string): { score: number; tone: DailyBriefTone; detail: string } {
  const missingAction = !lead.nextAction?.trim();
  const followUpDue = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() <= new Date(now).getTime() : false;
  const daysLate = lead.nextFollowUpAt ? Math.max(0, daysBetween(lead.nextFollowUpAt, now)) : 0;
  let score = lead.priority === "hot" ? 50 : 10;
  if (followUpDue) score += 35 + Math.min(daysLate, 10);
  if (missingAction) score += 20;
  if (lead.estimatedValue) score += Math.min(lead.estimatedValue / 1000, 25);
  const flags = [
    followUpDue ? `Follow-up due ${humanDate(lead.nextFollowUpAt)}${daysLate ? ` (${daysLate}d late)` : ""}` : null,
    missingAction ? "Missing next action" : lead.nextAction,
    `${currency(lead.estimatedValue)} estimate`,
  ].filter(Boolean);
  return {
    score,
    tone: followUpDue || missingAction ? "danger" : lead.priority === "hot" ? "warning" : "neutral",
    detail: flags.join(" · "),
  };
}

function buildLeadItems(leads: Lead[], now: string): DailyBriefItem[] {
  return leads
    .filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status))
    .filter((lead) => lead.priority === "hot" || lead.status === "follow_up_due" || !lead.nextAction?.trim())
    .map((lead) => {
      const urgency = leadUrgency(lead, now);
      return {
        title: lead.customerName,
        detail: urgency.detail,
        tone: urgency.tone,
        source: "supabase" as const,
        href: lead.sourceUrl || (lead.mondayItemId ? `https://innatefurniture.monday.com/boards/18535649924/pulses/${lead.mondayItemId}` : undefined),
        meta: lead.source || lead.sourceSystem,
        score: urgency.score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((scored) => ({
      title: scored.title,
      detail: scored.detail,
      tone: scored.tone,
      source: scored.source,
      href: scored.href,
      meta: scored.meta,
    }));
}

function productionRisk(order: UiOrder, now: string): { score: number; item: DailyBriefItem } | null {
  if (!ACTIVE_ORDER_STATUSES.has(order.status)) return null;
  const daysToShip = order.shipDate ? daysBetween(now, order.shipDate) : null;
  const late = daysToShip != null && daysToShip < 0;
  const dueSoon = daysToShip != null && daysToShip >= 0 && daysToShip <= 7;
  const notStartedDueSoon = order.status === "Not Started" && (dueSoon || late);
  const missingPromiseDetail = !order.shipDate || !order.deliveryLocation || !order.xeroInvoiceNumber;
  if (!late && !notStartedDueSoon && !missingPromiseDetail) return null;

  const detailParts = [
    late ? `${Math.abs(daysToShip ?? 0)}d late` : dueSoon ? `due ${humanDate(order.shipDate)}` : order.shipDate ? `due ${humanDate(order.shipDate)}` : "no due date",
    order.status === "Not Started" ? "Not started" : order.status,
    !order.xeroInvoiceNumber ? "missing Xero link" : null,
    !order.deliveryLocation ? "missing delivery detail" : null,
    !order.freightRef ? "freight not visible" : null,
  ].filter(Boolean);

  return {
    score: (late ? 80 : notStartedDueSoon ? 58 : 28) + (!order.xeroInvoiceNumber ? 8 : 0) + (!order.deliveryLocation ? 8 : 0),
    item: {
      title: order.customer,
      detail: detailParts.join(" · "),
      tone: late || notStartedDueSoon ? "danger" : "warning",
      source: "monday",
      href: `https://innatefurniture.monday.com/boards/18404972673/pulses/${order.id}`,
      meta: order.rawMondayItem || order.product,
    },
  };
}

function buildProductionItems(orders: UiOrder[], now: string): DailyBriefItem[] {
  return orders
    .map((order) => productionRisk(order, now))
    .filter((item): item is { score: number; item: DailyBriefItem } => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((risk) => risk.item);
}

function warningItem(title: string, detail: string, source: DailyBriefSource): DailyBriefItem {
  return { title, detail, tone: "warning", source };
}

export function buildDailyBrief(input: BuildDailyBriefInput): DailyBrief {
  const now = input.now ?? new Date().toISOString();
  const leadItems = buildLeadItems(input.leads.rows, now);
  const productionItems = buildProductionItems(input.orders.items, now);
  const sampleSummary = input.sampleStock.board?.summary;
  const sampleIssues = sampleSummary ? sampleSummary.outCount + sampleSummary.lowCount : 0;
  const sampleItems: DailyBriefItem[] = sampleSummary && sampleIssues > 0
    ? sampleSummary.topUps.slice(0, 4).map((cell) => ({
        title: `${cell.sampleType}: ${cell.species} ${cell.finish}`,
        detail: cell.level === "out" ? "Out of stock sample cell" : `Low sample cell (${cell.count} left)`,
        tone: cell.level === "out" ? "danger" : "warning",
        source: "monday" as const,
        href: cell.mondayUrl,
        meta: "sample stock",
      }))
    : [{ title: "No urgent sample top-ups", detail: "Samples board has no out/low summary issues visible.", tone: "good", source: "monday" }];

  const xero = input.xero ?? { source: "not_connected", label: "Xero not connected", tone: "warning" as const };
  const cashItems: DailyBriefItem[] = [{
    title: xero.label,
    detail: xero.detail ?? (xero.source === "read_only" ? "Read-only cash signal available." : "Cash/Xero is not yet wired into the owner daily brief."),
    tone: xero.tone,
    source: "xero",
  }];

  const sourceWarnings: DailyBriefItem[] = [];
  if (input.leads.source === "none") sourceWarnings.push(warningItem("Leads source unavailable", input.leads.error || "Supabase leads did not load.", "supabase"));
  if (input.orders.source === "snapshot") sourceWarnings.push(warningItem("Orders are using a snapshot", input.orders.mondayError || "Monday orders cache fell back to snapshot.", "monday"));
  if (input.orders.source === "none") sourceWarnings.push(warningItem("Orders source unavailable", input.orders.mondayError || "Monday orders did not load.", "monday"));
  if (input.sampleStock.source === "snapshot") sourceWarnings.push(warningItem("Samples stock is using a snapshot", input.sampleStock.mondayError || "Monday sample stock fell back to snapshot.", "monday"));
  if (input.sampleStock.source === "none") sourceWarnings.push(warningItem("Samples stock source unavailable", input.sampleStock.mondayError || "Monday sample stock did not load.", "monday"));
  if (xero.source === "not_connected") sourceWarnings.push(warningItem("Xero cash signal not connected", "Shown as a placeholder until read-only cash signals are added.", "xero"));

  const decision: DailyBriefDecision = leadItems[0]
    ? { label: `Follow up ${leadItems[0].title}`, detail: leadItems[0].detail, tone: leadItems[0].tone }
    : productionItems[0]
      ? { label: `Check ${productionItems[0].title}`, detail: productionItems[0].detail, tone: productionItems[0].tone }
      : { label: "No action needed from you today", detail: "No hot leads or production promises are currently shouting louder than the system warnings.", tone: "good" };

  const sections: DailyBriefSection[] = [
    {
      id: "decisions",
      title: "Decision queue",
      subtitle: "The one thing most likely to need Guido.",
      items: [{ title: decision.label, detail: decision.detail, tone: decision.tone, source: "fallback" }],
    },
    {
      id: "leads",
      title: "Hot / stale leads",
      subtitle: "Cash-first follow-up signals from Supabase leads.",
      items: leadItems.length ? leadItems : [{ title: "No hot lead follow-up due", detail: "No active hot, overdue, or missing-action leads in the current lead result.", tone: "good", source: "supabase" }],
    },
    {
      id: "production",
      title: "Production promises at risk",
      subtitle: "Late, due-soon, or missing-detail active orders from Monday.",
      items: productionItems.length ? productionItems : [{ title: "No production promise fire", detail: "No late/due-soon active order risk detected in the current order result.", tone: "good", source: "monday" }],
    },
    {
      id: "samples",
      title: "Freight / samples issues",
      subtitle: "Current sample stock top-up pressure; freight queue will join this lane next.",
      items: sampleItems,
    },
    {
      id: "cash",
      title: "Cash / Xero signal",
      subtitle: "Read-only cash status placeholder until full Xero cockpit is wired.",
      items: cashItems,
    },
    {
      id: "source-health",
      title: "Source health",
      subtitle: "Honest labels for unavailable, snapshot, or not-yet-connected sources.",
      items: sourceWarnings.length ? sourceWarnings : [{ title: "Core sources fresh enough", detail: "Leads, orders, and samples did not report source warnings.", tone: "good", source: "fallback" }],
    },
  ];

  return {
    title: "Owner Daily Brief",
    generatedAt: now,
    decision,
    summary: {
      hotLeads: leadItems.length,
      productionRisks: productionItems.length,
      sampleIssues,
      sourcesWithWarnings: sourceWarnings.length,
    },
    sections,
  };
}
