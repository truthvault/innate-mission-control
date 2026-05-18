import type { UiOrder } from "../monday/mapping";
import type { DayKey, Person } from "../monday/production-plan-mapping";

export type NewOrderPlanCandidate = UiOrder & { orderedDate: string | null };

export type SuggestedOrderPlanStep = {
  id: string;
  title: string;
  detail: string;
  day: DayKey;
  person: Person;
  estimatedHours: number;
  dateLabel: string;
  dateIso: string;
  noWriteLabel: "Suggested plan";
};

export type ApprovedSuggestedPlanTask = {
  id: string;
  rowName: string;
  text: string;
  detail: string;
  day: DayKey;
  person: Person;
  dateIso: string;
  dateLabel: string;
  estimatedHours: number;
  noWriteLabel: "Approved plan";
};

export const DAILY_PERSON_CAPACITY_HOURS = 7;
export const EXISTING_PLAN_TASK_ESTIMATED_HOURS = 1;
export const STANDARD_DINING_TABLE_TEMPLATE_LABEL = "Standard dining table";

export type LaneCapacitySummary = {
  existingTaskCount: number;
  existingEstimatedHours: number;
  draftHours: number;
  totalHours: number;
  capacityHours: number;
  status: "ok" | "watch" | "over";
  label: string;
  detail: string;
};

type TemplateStep = Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours"> & {
  key?: string;
  afterMaterialWait?: boolean;
  afterCuringWait?: boolean;
};

const TABLE_STEPS: TemplateStep[] = [
  { title: "Material + spec check", detail: "Confirm timber, base, finish, hardware, delivery notes, and any customer-specific details before workshop scheduling.", day: "monday", person: "nick", estimatedHours: 1 },
  { title: "Cut / machine / prep", detail: "Prepare top or components, resolve any machining questions, and flag missing information before finish work starts.", day: "tuesday", person: "nick", estimatedHours: 1 },
  { title: "Sanding + first finish", detail: "Surface prep, first coat, and photo proof while there is still time to catch any detail issue.", day: "wednesday", person: "dylan", estimatedHours: 1 },
  { title: "Second finish + cure buffer", detail: "Second coat and drying/cure buffer so dispatch or assembly is not guessed at the end of the week.", day: "thursday", person: "dylan", estimatedHours: 1 },
  { title: "QC photos + dispatch prep", detail: "Final proof photos, underside/base check, wrap/dispatch decision, and customer update trigger.", day: "friday", person: "nick", estimatedHours: 1 },
];

const STEEL_DINING_TABLE_STEPS: TemplateStep[] = [
  { key: "pull-timber", title: "Pull timber", detail: "Dylan: pull and check timber against the invoice/spec before purchase orders or workshop slots are trusted.", day: "monday", person: "dylan", estimatedHours: 1 },
  { key: "send-pos", title: "Send POs", detail: "Nick: send/confirm purchase orders and flag any missing material lead-time before production scheduling.", day: "tuesday", person: "nick", estimatedHours: 1 },
  { key: "bottom-prep", title: "Bottom: stress cuts + inserts", detail: "Dylan: stress cuts, L-channels, underside sand/coat, and inserts. Materials wait is normally about 2 weeks before this starts.", day: "wednesday", person: "dylan", estimatedHours: 1, afterMaterialWait: true },
  { key: "top-first-coat", title: "Top: sand + 1st coat", detail: "Dylan: final sand and first top coat.", day: "thursday", person: "dylan", estimatedHours: 1 },
  { key: "top-second-coat", title: "Top: 2nd coat", detail: "Dylan: second top coat.", day: "monday", person: "dylan", estimatedHours: 0.5 },
  { key: "top-third-coat", title: "Top: 3rd coat", detail: "Dylan: third/final top coat, then leave curing time before handling/boxing.", day: "tuesday", person: "dylan", estimatedHours: 0.5 },
  { key: "qc-dispatch", title: "QC + photos + dispatch prep", detail: "Dylan: QC, final photos, and either box/wrap for freight or assemble for local delivery after curing.", day: "monday", person: "dylan", estimatedHours: 2, afterCuringWait: true },
  { key: "book-freight", title: "Book freight", detail: "Nick: prepare freight or local delivery details for Guido approval once QC/pack mode is clear.", day: "tuesday", person: "nick", estimatedHours: 0.5 },
];

const PANEL_STEPS: TemplateStep[] = [
  { title: "Material + measurements check", detail: "Confirm species, thickness, measurements, joins, and any cut-out/detail notes.", day: "monday", person: "nick", estimatedHours: 1 },
  { title: "Cut / machine / flatten", detail: "Dylan: prepare the benchtop/panel blank, resolve any stock/yield issue, and check cut-outs before finishing.", day: "tuesday", person: "dylan", estimatedHours: 1 },
  { title: "Sand + 1st coat", detail: "Dylan: final sand, edge detail, first coat, and flag any quality issue while it can still move.", day: "wednesday", person: "dylan", estimatedHours: 1 },
  { title: "2nd coat + cure", detail: "Dylan: second coat and drying/cure buffer before handling or freight.", day: "thursday", person: "dylan", estimatedHours: 1 },
  { title: "QC photos + wrap", detail: "Final proof photos, packaging decision, freight/customer update trigger.", day: "monday", person: "dylan", estimatedHours: 1 },
];

const SAMPLE_STEPS: TemplateStep[] = [
  { title: "Check samples + labels", detail: "Confirm the requested species/colours are in stock, clean, labelled, and match the customer request.", day: "monday", person: "nick", estimatedHours: 1 },
  { title: "Pack + book courier", detail: "Pack the sample set, include the card/note, book courier or confirm collection, and paste tracking into the order.", day: "tuesday", person: "dylan", estimatedHours: 1 },
  { title: "Confirm sent / collected", detail: "Tick sent or collected in the order. Tuesday will keep the one-week follow-up date beside the dispatch details.", day: "wednesday", person: "nick", estimatedHours: 1 },
];

const WORKSHOP_DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday"];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(date: Date) {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function nextMonday(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const daysUntilNextMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + daysUntilNextMonday);
  return d;
}

function dayKeyForDate(date: Date): DayKey | null {
  if (date.getDay() === 1) return "monday";
  if (date.getDay() === 2) return "tuesday";
  if (date.getDay() === 3) return "wednesday";
  if (date.getDay() === 4) return "thursday";
  if (date.getDay() === 5) return "friday";
  return null;
}

function addWorkshopPlanningDays(start: Date, offset: number) {
  const d = new Date(start);
  let remaining = offset;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = dayKeyForDate(d);
    if (day && WORKSHOP_DAYS.includes(day)) remaining -= 1;
  }
  return d;
}

function nextWorkshopPlanningDay(from: Date) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  while (true) {
    const day = dayKeyForDate(d);
    if (day && WORKSHOP_DAYS.includes(day)) return d;
    d.setDate(d.getDate() + 1);
  }
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function twoWeekMaterialReadyDate(order: NewOrderPlanCandidate, from: Date) {
  const base = order.orderedDate ? new Date(`${order.orderedDate}T00:00:00`) : new Date(from);
  if (Number.isNaN(base.getTime())) return new Date(from);
  base.setDate(base.getDate() + 14);
  return base;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function looksPlannedByName(orderName: string, plannedNames: Set<string>) {
  const orderTokens = normalizeName(orderName).split(" ").filter((token) => token.length > 2);
  const orderLast = orderTokens.at(-1);
  if (!orderLast) return false;
  return Array.from(plannedNames).some((planned) => {
    const plannedTokens = new Set(normalizeName(planned).split(" ").filter((token) => token.length > 2));
    const matches = orderTokens.filter((token) => plannedTokens.has(token)).length;
    return plannedTokens.has(orderLast) && matches >= 2;
  });
}

export function isStandardDiningTableOrder(order: Pick<NewOrderPlanCandidate, "product" | "rawMondayItem" | "customer">) {
  const item = normalizeName(order.rawMondayItem ?? order.product ?? "");
  const customer = normalizeName(order.customer ?? "");
  if (order.product !== "Table") return false;
  if (item.includes("sample") || item.includes("bench") || item.includes("custom")) return false;
  if (customer.includes("sample")) return false;
  return item === "table" || item.includes("dining table") || /\bsteel\b.*\btable\b|\btable\b.*\bsteel\b/.test(item);
}

function isChristchurchDelivery(order: Pick<NewOrderPlanCandidate, "deliveryLocation">) {
  return /christchurch|kaiapoi|rangiora|lincoln|rolleston|lyttelton/i.test(order.deliveryLocation ?? "");
}

function steelTableStartIndex(order: NewOrderPlanCandidate) {
  const status = order.rawMondayStatus;
  const top = order.rawMondayTopPanel;
  const legs = order.rawMondayLegs;
  if (status === "Finished" || status === "Collected" || status === "Booked") return STEEL_DINING_TABLE_STEPS.length;
  if (top === "Done / NA" && legs === "Done / NA" && status === "In production") return 6;
  if (top === "3rd coat" || top === "Final coat") return 6;
  if (top === "2nd coat" || top === "2nd Colour" || top === "coated-check over" || top === "coated -check over") return 5;
  if (top === "1st coat" || top === "Bottom coat" || top === "1st Colour") return 4;
  if ((status === "Materials Ready" || status === "In production") && top === "Unstarted") return 2;
  if (status === "Materials Ordered") return 2;
  return 0;
}

export function buildStandardDiningTablePlanForOrder(
  order: NewOrderPlanCandidate | null,
  from = new Date()
): SuggestedOrderPlanStep[] {
  if (!order || !isStandardDiningTableOrder(order)) return [];
  const startIndex = steelTableStartIndex(order);
  if (startIndex >= STEEL_DINING_TABLE_STEPS.length) return [];

  const nextStart = nextWorkshopPlanningDay(nextMonday(from));
  const materialReadyStart = nextWorkshopPlanningDay(maxDate(nextStart, twoWeekMaterialReadyDate(order, from)));
  const localAssembled = isChristchurchDelivery(order);
  let currentDate = startIndex === 2 ? materialReadyStart : nextStart;
  let lastStepDate: Date | null = null;

  return STEEL_DINING_TABLE_STEPS.slice(startIndex).map((template, index) => {
    if (index > 0) currentDate = addWorkshopPlanningDays(currentDate, 1);
    if (template.afterMaterialWait && lastStepDate && startIndex < 2) {
      currentDate = nextWorkshopPlanningDay(addWorkshopPlanningDays(lastStepDate, 8));
    }
    if (template.afterCuringWait && (lastStepDate || startIndex >= 6)) {
      currentDate = nextWorkshopPlanningDay(addWorkshopPlanningDays(lastStepDate ?? currentDate, 4));
    }
    const stepDate = new Date(currentDate);
    lastStepDate = stepDate;
    const day = dayKeyForDate(stepDate) ?? "monday";
    const dispatchTitle = localAssembled ? "QC + photos + assemble" : "QC + photos + box/wrap";
    const title = template.key === "qc-dispatch" ? dispatchTitle : template.title;
    const detail = template.key === "qc-dispatch"
      ? `${template.detail} ${localAssembled ? "Local Christchurch delivery: assemble, allow about 1 hour." : "Out-of-town delivery: box/wrap, allow about 2 hours."}`
      : template.detail;
    return {
      title,
      detail,
      day,
      person: template.person,
      estimatedHours: template.key === "qc-dispatch" && localAssembled ? 1 : template.estimatedHours,
      id: `steel-table-${order.id}-${template.key}`,
      dateLabel: dateLabel(stepDate),
      dateIso: isoDate(stepDate),
      noWriteLabel: "Suggested plan" as const,
    };
  });
}

export function selectNewOrderForPlanning(
  orders: NewOrderPlanCandidate[],
  plannedOrderIds: Set<number>,
  plannedNames: Set<string> = new Set()
): NewOrderPlanCandidate | null {
  const candidates = orders
    .filter((order) => !plannedOrderIds.has(order.id))
    .filter((order) => !looksPlannedByName(order.customer, plannedNames))
    .filter((order) => order.status === "Not Started" || order.rawMondayStatus === "To Process")
    .filter((order) => order.product === "Table" || order.product === "Panel")
    .sort((a, b) => {
      const aTime = a.orderedDate ? new Date(a.orderedDate).getTime() : 0;
      const bTime = b.orderedDate ? new Date(b.orderedDate).getTime() : 0;
      return bTime - aTime || b.id - a.id;
    });
  return candidates[0] ?? null;
}

export function buildSuggestedPlanForOrder(
  order: NewOrderPlanCandidate | null,
  from = new Date()
): SuggestedOrderPlanStep[] {
  if (!order) return [];
  const standardTablePlan = buildStandardDiningTablePlanForOrder(order, from);
  if (standardTablePlan.length > 0) return standardTablePlan;
  const isSampleOrder = order.rawMondayItem === "Sample" || normalizeName(order.customer).includes("sample");
  const start = nextMonday(from);
  const template = isSampleOrder ? SAMPLE_STEPS : order.product === "Panel" ? PANEL_STEPS : TABLE_STEPS;
  return template.map((step, index) => {
    const stepDate = addWorkshopPlanningDays(start, index);
    const day = dayKeyForDate(stepDate) ?? "monday";
    return {
      ...step,
      day,
      id: `new-order-${order.id}-${index + 1}`,
      dateLabel: dateLabel(stepDate),
      dateIso: isoDate(stepDate),
      noWriteLabel: "Suggested plan" as const,
    };
  });
}

export function approveSuggestedPlanSteps(
  order: NewOrderPlanCandidate | null,
  steps: SuggestedOrderPlanStep[]
): ApprovedSuggestedPlanTask[] {
  if (!order) return [];
  return steps.map((step) => ({
    id: `approved-${step.id}`,
    rowName: order.customer,
    text: step.title,
    detail: step.detail,
    day: step.day,
    person: step.person,
    dateIso: step.dateIso,
    dateLabel: step.dateLabel,
    estimatedHours: step.estimatedHours,
    noWriteLabel: "Approved plan" as const,
  }));
}

export function summarizeLaneCapacity({
  existingTaskCount,
  draftHours,
  capacityHours = DAILY_PERSON_CAPACITY_HOURS,
  existingTaskEstimatedHours = EXISTING_PLAN_TASK_ESTIMATED_HOURS,
}: {
  existingTaskCount: number;
  draftHours: number;
  capacityHours?: number;
  existingTaskEstimatedHours?: number;
}): LaneCapacitySummary {
  const safeExistingTaskCount = Math.max(0, existingTaskCount);
  const safeDraftHours = Math.max(0, draftHours);
  const existingEstimatedHours = safeExistingTaskCount * existingTaskEstimatedHours;
  const totalHours = existingEstimatedHours + safeDraftHours;
  const status: LaneCapacitySummary["status"] = totalHours > capacityHours ? "over" : totalHours >= capacityHours ? "watch" : "ok";
  const existingLabel = `${safeExistingTaskCount} existing ${safeExistingTaskCount === 1 ? "task" : "tasks"}`;
  const draftLabel = safeDraftHours > 0 ? ` + ${safeDraftHours}h draft` : "";
  const statusLabel = status === "over" ? "Over capacity" : status === "watch" ? "At capacity" : "Capacity ok";
  return {
    existingTaskCount: safeExistingTaskCount,
    existingEstimatedHours,
    draftHours: safeDraftHours,
    totalHours,
    capacityHours,
    status,
    label: `${totalHours}h / ${capacityHours}h`,
    detail: `${existingLabel} (~${existingEstimatedHours}h)${draftLabel} · ${statusLabel}`,
  };
}

export function formatOrderedDate(orderedDate: string | null): string {
  if (!orderedDate) return "Date ordered missing";
  const parsed = new Date(`${orderedDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return orderedDate;
  return parsed.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}
