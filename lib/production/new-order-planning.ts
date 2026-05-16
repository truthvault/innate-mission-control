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
export const EXISTING_PLAN_TASK_ESTIMATED_HOURS = 2;

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

const TABLE_STEPS: Array<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours">> = [
  { title: "Material + spec check", detail: "Confirm timber, base, finish, hardware, delivery notes, and any customer-specific details before workshop scheduling.", day: "monday", person: "nick", estimatedHours: 1 },
  { title: "Cut / machine / prep", detail: "Prepare top or components, resolve any machining questions, and flag missing information before finish work starts.", day: "tuesday", person: "nick", estimatedHours: 1 },
  { title: "Sanding + first finish", detail: "Surface prep, first coat, and photo proof while there is still time to catch any detail issue.", day: "wednesday", person: "dylan", estimatedHours: 1 },
  { title: "Second finish + cure buffer", detail: "Second coat and drying/cure buffer so dispatch or assembly is not guessed at the end of the week.", day: "thursday", person: "dylan", estimatedHours: 1 },
  { title: "QC photos + dispatch prep", detail: "Final proof photos, underside/base check, wrap/dispatch decision, and customer update trigger.", day: "friday", person: "nick", estimatedHours: 1 },
];

const PANEL_STEPS: Array<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours">> = [
  { title: "Material + measurements check", detail: "Confirm species, thickness, measurements, joins, and any cut-out/detail notes.", day: "monday", person: "nick", estimatedHours: 1 },
  { title: "Cut / laminate / flatten", detail: "Prepare panel blanks and resolve any stock/yield issue before sanding.", day: "tuesday", person: "nick", estimatedHours: 1 },
  { title: "Sand + edge detail", detail: "Final sanding and edge work, with any quality issue flagged while it can still move.", day: "wednesday", person: "dylan", estimatedHours: 1 },
  { title: "Finish / oil / cure", detail: "Apply finish and allow drying/cure buffer before handling or freight.", day: "thursday", person: "dylan", estimatedHours: 1 },
  { title: "QC photos + pack", detail: "Final proof photos, packaging decision, freight/customer update trigger.", day: "friday", person: "nick", estimatedHours: 1 },
];

const DAY_OFFSETS: Record<DayKey, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
};

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
  const start = nextMonday(from);
  const template = order.product === "Panel" ? PANEL_STEPS : TABLE_STEPS;
  return template.map((step, index) => {
    const stepDate = new Date(start);
    stepDate.setDate(start.getDate() + DAY_OFFSETS[step.day]);
    return {
      ...step,
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
