'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MissionControlShell } from "@/components/mission-control-shell";
import { Chip } from "@/components/mission-control-ui";
import type { UiOrder } from "@/lib/monday/mapping";
import {
  buildSuggestedPlanForOrder,
  formatOrderedDate,
  selectNewOrderForPlanning,
  summarizeLaneCapacity,
  type LaneCapacitySummary,
  type NewOrderPlanCandidate,
  type SuggestedOrderPlanStep,
} from "@/lib/production/new-order-planning";
import {
  dropTargetFromOverId,
  planLaneId,
  planLayoutsEqual,
  reorderPlanTask,
  type DraggablePlanTask,
} from "@/lib/production/plan-drag";
import {
  DAYS,
  PEOPLE,
  derivePlanGrid as derivePlanWeek,
  groupPlanRowsByWeek,
  type PlanRow,
  type DayKey,
  type Person,
} from "@/lib/monday/production-plan-mapping";

const DT = {
  pageBg: "#f5f3ee",
  cardBg: "#ffffff",
  headerBg: "#1a1a1a",
  teal: "#0c7c7a",
  tealSoft: "rgba(12,124,122,0.08)",
  gold: "#c8a96e",
  sage: "#6e8a6a",
  goldSoft: "rgba(200,169,110,0.06)",
  textPrimary: "#22201a",
  textSecondary: "#5a5549",
  textMuted: "#7c746b",
  textFaint: "#9a9088",
  border: "rgba(0,0,0,0.06)",
  shadow: "0 1px 3px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.02)",
  radius: 14,
  radiusSm: 8,
  sans: "'DM Sans', -apple-system, sans-serif",
  serif: "'Fraunces', Georgia, serif",
};

const newOrderPalette = {
  clayBg: "rgba(111,143,123,0.14)",
  clayPanel: "rgba(249,251,247,0.98)",
  clayBorder: "rgba(111,143,123,0.30)",
  clayBorderStrong: "rgba(111,143,123,0.46)",
  clayAccent: "#55715f",
  clayAccentDark: "#3f5949",
  clayStripe: "#6f8f7b",
  clayGlow: "rgba(111,143,123,0.18)",
  clayTaskBg: "linear-gradient(135deg, rgba(249,251,247,0.98) 0%, rgba(111,143,123,0.20) 100%)",
};

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};
const PERSON_LABELS: Record<Person, string> = { nick: "Nick", dylan: "Dylan" };
const PERSON_SHORT: Record<Person, string> = { nick: "Nick", dylan: "Dylan" };
const CAPACITY_STYLES = {
  ok: { color: "#3f6f3f", bg: "rgba(63,111,63,0.09)", border: "rgba(63,111,63,0.22)", label: "OK" },
  watch: { color: "#9a6a14", bg: "rgba(200,169,110,0.14)", border: "rgba(200,169,110,0.35)", label: "Full" },
  over: { color: "#9b2f22", bg: "rgba(155,47,34,0.10)", border: "rgba(155,47,34,0.34)", label: "Over" },
} as const;
const JOB_TASK_PRESETS = [
  "Material + spec check",
  "Cut / machine / prep",
  "Sand and coat",
  "Second coat",
  "Final QC photos",
  "Pack / wrap",
  "Book freight",
  "Customer update",
  "Custom",
] as const;
type Step = { key: string; label: string; who: string | null; wait: boolean; waitLabel?: string };
const TABLE_STEPS: Step[] = [
  { key: "confirmed", label: "Order Confirmed", who: "Workshop", wait: false },
  { key: "pos", label: "POs Sent", who: "Workshop", wait: false },
  { key: "timber", label: "Timber Pulled", who: "Workshop", wait: false },
  { key: "matWait", label: "Materials Wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Materials Received", who: "Workshop", wait: false },
  { key: "stress", label: "Stress Cuts", who: "Workshop", wait: false },
  { key: "sand", label: "Sand", who: "Workshop", wait: false },
  { key: "coat1", label: "1st Coat", who: "Workshop", wait: false },
  { key: "coat2", label: "2nd Coat", who: "Workshop", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC + Photos", who: "Workshop", wait: false },
  { key: "assemble", label: "Assemble / Box", who: "Workshop", wait: false },
  { key: "freight", label: "Book Freight", who: "Workshop", wait: false },
];
const PANEL_STEPS: Step[] = [
  { key: "confirmed", label: "Order Confirmed", who: "Workshop", wait: false },
  { key: "pos", label: "POs Sent", who: "Workshop", wait: false },
  { key: "matWait", label: "Materials Wait", who: null, wait: true, waitLabel: "~2 weeks" },
  { key: "received", label: "Materials Received", who: "Workshop", wait: false },
  { key: "cut", label: "CNC / Cut", who: "Workshop", wait: false },
  { key: "sand", label: "Sand", who: "Workshop", wait: false },
  { key: "coat1", label: "1st Coat", who: "Workshop", wait: false },
  { key: "coat2", label: "2nd Coat", who: "Workshop", wait: false },
  { key: "cure", label: "Curing", who: null, wait: true, waitLabel: "~1 week" },
  { key: "qc", label: "QC", who: "Workshop", wait: false },
  { key: "wrap", label: "Wrap + Dispatch", who: "Workshop", wait: false },
];
const STEPS_BY_KEY: Record<NonNullable<UiOrder["stepsKey"]>, Step[]> = {
  TABLE_STEPS,
  PANEL_STEPS,
};
type CapacityByLane = Partial<Record<`${DayKey}:${Person}`, LaneCapacitySummary>>;
const laneCapacityKey = (day: DayKey, person: Person): `${DayKey}:${Person}` => `${day}:${person}`;

type OrderHealthLevel = "onTrack" | "watch" | "blocked";
type WorkshopTask = {
  id: string;
  rowId: string;
  rowName: string;
  weekTitle: string;
  day: DayKey;
  person: Person;
  text: string;
  notes: string | null;
  sourceRowUrl: string;
};
type OrderPhoto = { url: string; pathname: string; uploadedAt?: string; size?: number };
type Carrier = "" | "Pinpoint" | "Mainfreight" | "Customer";
type WorkshopPerson = "" | "Nick" | "Dylan" | "Guido" | "Other";
type WorkflowTask = {
  id: string;
  title: string;
  owner: WorkshopPerson;
  scheduledDate: string;
  done: boolean;
  completedAt: string | null;
  completedBy: WorkshopPerson;
  notes: string;
};
type AppPlanTask = {
  id: string;
  orderId: number;
  title: string;
  scheduledDate: string;
  day: DayKey;
  person: Person;
  done: boolean;
};
type PlanTaskLinks = Record<string, number>;
type AssignablePlanTask = DraggablePlanTask & { weekTitle: string };
type PersonFilter = "all" | Person;
type RailFilter = "all" | "blocked" | "thisWeek" | "materials" | "noDate";
type RailSort = "soonest" | "latest" | "customer";
type PlanMode = "workshop" | "planning";
type OrderWorkflowState = {
  orderId: number;
  xeroInvoiceNumber?: string | null;
  collection: {
    status: "open" | "booked" | "collected";
    bookedDay: string;
    bookedTime: string;
    by: Carrier;
    collectedAt: string | null;
  };
  qc: Record<string, { done: boolean; completedAt: string | null; completedBy: WorkshopPerson }>;
  tasks: WorkflowTask[];
  updatedAt: string;
};

function weekBoundaries() {
  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(thisMon.getDate() + monOffset);
  const nextMon = new Date(thisMon);
  nextMon.setDate(nextMon.getDate() + 7);
  const twoMon = new Date(thisMon);
  twoMon.setDate(twoMon.getDate() + 14);
  return { thisMon, nextMon, twoMon };
}

function currentDayKey(date = new Date()): DayKey | null {
  const day = date.getDay();
  if (day < 1 || day > 5) return null;
  return DAYS[day - 1] ?? null;
}

function orderDueThisWeek(order: UiOrder) {
  if (!order.shipDate) return false;
  const { thisMon, nextMon } = weekBoundaries();
  const due = new Date(order.shipDate);
  return due >= thisMon && due < nextMon;
}

function orderDaysUntil(date: string | null) {
  if (!date) return null;
  const due = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 864e5);
}

function orderProgressPct(order: UiOrder) {
  const stepCount = order.stepsKey === "PANEL_STEPS" ? 11 : order.stepsKey === "TABLE_STEPS" ? 13 : 0;
  if (!stepCount) return 0;
  return Math.min(100, Math.round((order.currentStep / Math.max(1, stepCount - 1)) * 100));
}

function stepsForOrder(order: UiOrder) {
  return order.stepsKey ? STEPS_BY_KEY[order.stepsKey] ?? [] : [];
}

function isCompleteOrder(order: UiOrder) {
  return ["Collected", "Finished", "Shipped"].includes(order.status);
}

function orderHealth(order: UiOrder): OrderHealthLevel {
  const diff = orderDaysUntil(order.shipDate);
  const pct = orderProgressPct(order);
  if (!order.shipDate) return "watch";
  if (diff !== null && diff < 0) return "blocked";
  if (diff === 0 && !isCompleteOrder(order)) return "blocked";
  if (order.rawMondayStatus === "Materials Ordered" && diff !== null && diff <= 7) return "blocked";
  if (order.rawMondayStatus === "Materials Ordered") return "watch";
  if (order.rawMondayStatus === "To Process" && diff !== null && diff <= 14) return "watch";
  if (diff !== null && diff <= 7 && pct < 60) return "watch";
  if (diff !== null && diff <= 14 && pct < 30) return "watch";
  return "onTrack";
}

function orderHealthReason(order: UiOrder) {
  const diff = orderDaysUntil(order.shipDate);
  const pct = orderProgressPct(order);
  if (!order.shipDate) return "No due date";
  if (diff !== null && diff < 0) return "Past due";
  if (diff === 0 && !isCompleteOrder(order)) return "Due today: needs truth check";
  if (order.rawMondayStatus === "Materials Ordered" && diff !== null && diff <= 7) return "Materials not ready and due soon";
  if (order.rawMondayStatus === "Materials Ordered") return "Waiting on materials";
  if (order.rawMondayStatus === "To Process" && diff !== null && diff <= 14) return "Not started inside 2 weeks";
  if (diff !== null && diff <= 7 && pct < 60) return "Due soon for current progress";
  if (diff !== null && diff <= 14 && pct < 30) return "Low progress for next fortnight";
  return "No obvious schedule flag";
}

function OrderHealthStrip({ orders }: { orders: UiOrder[] }) {
  const active = orders.filter((order) => !isCompleteOrder(order));
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueThis = active.filter((order) => order.shipDate && new Date(order.shipDate) >= thisMon && new Date(order.shipDate) < nextMon).length;
  const dueNext = active.filter((order) => order.shipDate && new Date(order.shipDate) >= nextMon && new Date(order.shipDate) < twoMon).length;
  const overdue = active.filter((order) => order.shipDate && new Date(order.shipDate) < today).length;
  const blocked = active.filter((order) => orderHealth(order) === "blocked").length;
  const watch = active.filter((order) => orderHealth(order) === "watch").length;
  const onTrack = active.filter((order) => orderHealth(order) === "onTrack").length;
  const cards = [
    { label: "Active Orders", value: active.length, color: DT.textPrimary },
    { label: "On Track", value: onTrack, color: "#15803d" },
    { label: "Watch", value: watch, color: "#b45309" },
    { label: "Blocked", value: blocked || overdue, color: blocked || overdue ? "#991b1b" : "#15803d" },
    { label: "Due This Week", value: dueThis, color: DT.textPrimary },
    { label: "Due Next Week", value: dueNext, color: DT.textPrimary },
  ];
  return (
    <div style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" }}>
      {cards.map((card) => (
        <div key={card.label} style={{ flex: "1 1 88px", minWidth: 88, padding: "7px 9px", background: "rgba(255,255,255,0.72)", borderRadius: 9, border: `1px solid ${DT.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.025)" }}>
          <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: card.color, fontFamily: DT.serif, marginTop: 1, lineHeight: 1 }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

const HEALTH_META: Record<OrderHealthLevel, { label: string; color: string; bg: string; border: string }> = {
  onTrack: { label: "On track", color: "#15803d", bg: "rgba(21,128,61,0.08)", border: "rgba(21,128,61,0.20)" },
  watch: { label: "Watch", color: "#b45309", bg: "rgba(180,83,9,0.09)", border: "rgba(180,83,9,0.22)" },
  blocked: { label: "Blocked", color: "#991b1b", bg: "rgba(153,27,27,0.09)", border: "rgba(153,27,27,0.24)" },
};

function formatShortDate(date: string | null) {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}

function formatCurrencyShort(value: number | null) {
  if (value == null) return "No value";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function dueLabel(order: UiOrder) {
  const diff = orderDaysUntil(order.shipDate);
  if (diff == null) return "No due date";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `${diff}d until due`;
}

function orderItemLabel(order: UiOrder) {
  return order.rawMondayItem || order.product || "Order";
}

function orderStatusLabel(order: UiOrder) {
  return order.rawMondayStatus || order.status;
}

function nextOrderPrompt(order: UiOrder) {
  const health = orderHealth(order);
  if (health === "blocked") return "Needs a clear next move before it can relax.";
  if (health === "watch") return "Worth checking soon so it does not drift.";
  return "No urgent attention flagged.";
}

function addWorkingDays(date: string | null, days: number) {
  if (!date) return null;
  const result = new Date(`${date}T12:00:00`);
  const step = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    result.setDate(result.getDate() + step);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

function formatLongDate(date: Date | null) {
  if (!date) return "Needs due date";
  return date.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

function deliveryMode(order: UiOrder) {
  const text = `${order.freightRef ?? ""} ${order.deliveryLocation ?? ""}`.toLowerCase();
  if (text.includes("mainfreight") || text.includes("freight")) {
    return { label: "Flat-packed", detail: "Mainfreight delivery", workingDays: 2 };
  }
  if (text.includes("pinpoint") || text.includes("christchurch") || text.includes("local")) {
    return { label: "Assembled", detail: "Local / Pinpoint delivery", workingDays: 1 };
  }
  return { label: "Confirm pack mode", detail: "No delivery method captured yet", workingDays: 2 };
}

function normalizeOrderText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function planRowMatchesOrder(row: PlanRow, order: UiOrder | null) {
  if (!order) return false;
  if (row.linkedOrders.some((linked) => Number(linked.mondayItemId) === order.id)) return true;
  const rowName = normalizeOrderText(row.name);
  const customer = normalizeOrderText(order.customer);
  if (!rowName || !customer) return false;
  return customer.includes(rowName) || rowName.includes(customer);
}

function planTaskMatchesOrder(task: DraggablePlanTask, order: UiOrder | null) {
  if (!order) return false;
  if (task.linkedOrderIds.includes(order.id)) return true;
  const rowName = normalizeOrderText(task.rowName);
  const customer = normalizeOrderText(order.customer);
  if (rowName && customer && (customer.includes(rowName) || rowName.includes(customer))) return true;
  return task.linkedOrders.some((linked) => orderNameMatchScore(order, linked.name, task.rowName) >= 2);
}

function assignedOrderIdForTask(task: DraggablePlanTask, links: PlanTaskLinks) {
  const orderId = links[planTaskLinkKey(task)] ?? links[task.id];
  return typeof orderId === "number" && Number.isFinite(orderId) ? orderId : null;
}

function effectiveTaskOrderIds(task: DraggablePlanTask, links: PlanTaskLinks) {
  const assigned = assignedOrderIdForTask(task, links);
  return assigned ? [assigned] : task.linkedOrderIds;
}

const LINK_MATCH_STOP_WORDS = new Set([
  "invoice",
  "inv",
  "from",
  "innate",
  "furniture",
  "limited",
  "ltd",
  "deposit",
  "order",
  "placed",
  "paid",
  "for",
  "the",
  "and",
]);

function matchTokens(value: string | null | undefined) {
  return normalizeOrderText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !LINK_MATCH_STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function orderNameMatchScore(order: UiOrder, ...candidates: Array<string | null | undefined>) {
  const customer = normalizeOrderText(order.customer);
  const customerTokens = new Set(matchTokens(order.customer));
  let best = 0;
  for (const candidate of candidates) {
    const normalized = normalizeOrderText(candidate);
    if (!normalized) continue;
    if (customer && (normalized.includes(customer) || customer.includes(normalized))) best = Math.max(best, 5);
    const tokens = matchTokens(candidate);
    const matches = tokens.filter((token) => customerTokens.has(token)).length;
    if (matches > 0) best = Math.max(best, matches);
  }
  return best;
}

function planTasksForOrder(weeks: PlanWeek[], order: UiOrder | null): WorkshopTask[] {
  if (!order) return [];
  return weeks.flatMap((week) =>
    week.rows.flatMap((row) => {
      if (!planRowMatchesOrder(row, order)) return [];
      return DAYS.flatMap((day) =>
        PEOPLE.flatMap((person) => {
          const text = row.dayTasks[day][person];
          return text
            ? [{
                id: `${row.id}:${day}:${person}`,
                rowId: row.id,
                rowName: row.name,
                weekTitle: displayWeekTitle(week.title),
                day,
                person,
                text,
                notes: row.notes,
                sourceRowUrl: row.mondayUrl,
              }]
            : [];
        })
      );
    })
  );
}

function defaultWorkflowState(orderId: number): OrderWorkflowState {
  return {
    orderId,
    xeroInvoiceNumber: null,
    collection: {
      status: "open",
      bookedDay: "",
      bookedTime: "",
      by: "",
      collectedAt: null,
    },
    qc: {},
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

function useOrderWorkflow(order: UiOrder, onWorkflowChange?: (workflow: OrderWorkflowState | null) => void) {
  const [workflow, setWorkflow] = useState<OrderWorkflowState>(() => defaultWorkflowState(order.id));
  const [workflowStatus, setWorkflowStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/production/order-workflow?orderId=${order.id}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Workflow unavailable")))
      .then((data: { state?: OrderWorkflowState; disabledReason?: string }) => {
        if (cancelled) return;
        const next = data.state ?? defaultWorkflowState(order.id);
        setWorkflow(next);
        onWorkflowChange?.(next);
        setWorkflowStatus(data.disabledReason ?? "");
      })
      .catch((err) => {
        if (!cancelled) setWorkflowStatus(err instanceof Error ? err.message : "Workflow unavailable");
      });
    return () => {
      cancelled = true;
      onWorkflowChange?.(null);
    };
  }, [order.id, onWorkflowChange]);

  function saveWorkflow(next: OrderWorkflowState) {
    setWorkflow(next);
    onWorkflowChange?.(next);
    setWorkflowStatus("Saving...");
    fetch("/api/production/order-workflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: next }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: OrderWorkflowState }) => {
        if (data.state) {
          setWorkflow(data.state);
          onWorkflowChange?.(data.state);
        }
        setWorkflowStatus("Saved");
      })
      .catch((err) => setWorkflowStatus(err instanceof Error ? err.message : "Save failed"));
  }

  function updateWorkflow(patch: (state: OrderWorkflowState) => OrderWorkflowState) {
    saveWorkflow(patch(workflow));
  }

  return { workflow, workflowStatus, updateWorkflow };
}

function dispatchQcItems(order: UiOrder) {
  const isSample = order.rawMondayItem === "Sample";
  if (isSample) {
    return [
      "Correct species",
      "Correct finish",
      "Engraving / label matches",
      "Clean customer-ready sample",
      "Species card + business card included",
      "Photo before packaging",
      "Photo after packaging",
      "Follow-up date set",
    ];
  }
  return [
    "Final QC complete",
    "Final photos uploaded",
    "Freight / collection confirmed",
    "Customer update needed?",
    "Xero link present",
  ];
}

function formatCompletedAt(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function workflowOwnerToPerson(owner: WorkshopPerson): Person | null {
  if (owner === "Nick") return "nick";
  if (owner === "Dylan") return "dylan";
  return null;
}

function dateToDayKey(value: string): DayKey | null {
  if (!value) return null;
  const day = new Date(`${value}T12:00:00`).getDay();
  if (day === 1) return "monday";
  if (day === 2) return "tuesday";
  if (day === 3) return "wednesday";
  if (day === 4) return "thursday";
  if (day === 5) return "friday";
  return null;
}

function workflowTasksForPlan(workflow: OrderWorkflowState | null): AppPlanTask[] {
  if (!workflow) return [];
  return workflow.tasks.flatMap((task) => {
    const person = workflowOwnerToPerson(task.owner);
    const day = dateToDayKey(task.scheduledDate);
    if (!person || !day || !task.title.trim()) return [];
    return [{
      id: task.id,
      orderId: workflow.orderId,
      title: task.title,
      scheduledDate: task.scheduledDate,
      day,
      person,
      done: task.done,
    }];
  });
}

function appTaskFallsInWeek(task: AppPlanTask, week: PlanWeek) {
  const range = weekRangeFromTitle(week.title);
  if (!range) return false;
  const date = new Date(`${task.scheduledDate}T12:00:00`);
  return range.start.getTime() <= date.getTime() && date.getTime() <= range.end.getTime();
}

function OrderRail({
  orders,
  selectedOrder,
  selectedOrderTasks,
  assignmentTask,
  assignmentStatus,
  onAssignTask,
  onRemoveTaskLink,
  onWorkflowChange,
  onSelect,
  onOpenOrder,
  onClear,
  isNarrow,
  canRemoveAssignmentLink,
  newOrderCard,
}: {
  orders: UiOrder[];
  selectedOrder: UiOrder | null;
  selectedOrderTasks: WorkshopTask[];
  assignmentTask: AssignablePlanTask | null;
  assignmentStatus: string;
  onAssignTask: (task: AssignablePlanTask, orderId: number) => void;
  onRemoveTaskLink: (task: AssignablePlanTask) => void;
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
  onSelect: (id: number) => void;
  onOpenOrder: (id: number) => void;
  onClear: () => void;
  isNarrow: boolean;
  canRemoveAssignmentLink: boolean;
  newOrderCard?: ReactNode;
}) {
  const activeOrders = useMemo(() => orders.filter((order) => !isCompleteOrder(order)), [orders]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RailFilter>("all");
  const [sort, setSort] = useState<RailSort>("soonest");
  const filteredOrders = useMemo(() => {
    const normalizedQuery = normalizeOrderText(query);
    const filtered = activeOrders.filter((order) => {
      if (filter === "blocked" && orderHealth(order) !== "blocked") return false;
      if (filter === "thisWeek" && !orderDueThisWeek(order)) return false;
      if (filter === "materials" && order.rawMondayStatus !== "Materials Ordered") return false;
      if (filter === "noDate" && order.shipDate) return false;
      if (!normalizedQuery) return true;
      return normalizeOrderText(`${order.customer} ${orderItemLabel(order)} ${orderStatusLabel(order)} ${order.deliveryLocation ?? ""}`).includes(normalizedQuery);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "customer") return a.customer.localeCompare(b.customer);
      const aTime = a.shipDate ? new Date(a.shipDate).getTime() : null;
      const bTime = b.shipDate ? new Date(b.shipDate).getTime() : null;
      if (aTime === null && bTime === null) return a.customer.localeCompare(b.customer);
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return sort === "latest" ? bTime - aTime : aTime - bTime;
    });
  }, [activeOrders, filter, query, sort]);
  const filterOptions: Array<{ id: RailFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "blocked", label: "Blocked" },
    { id: "thisWeek", label: "This week" },
    { id: "materials", label: "Materials" },
    { id: "noDate", label: "No date" },
  ];
  const railWidth = 318;
  return (
    <aside
      aria-label="Active orders"
      style={{
        alignSelf: "start",
        position: isNarrow ? "static" : "sticky",
        top: isNarrow ? undefined : 14,
        width: isNarrow ? "100%" : railWidth,
        minWidth: isNarrow ? undefined : railWidth,
        maxHeight: isNarrow ? undefined : "calc(100vh - 28px)",
        overflow: "hidden",
        transition: "box-shadow 1000ms ease, border-color 1000ms ease",
        background: "rgba(255,255,255,0.84)",
        border: `1px solid ${selectedOrder ? "rgba(12,124,122,0.24)" : DT.border}`,
        borderRadius: DT.radius,
        boxShadow: selectedOrder ? "0 10px 28px rgba(12,124,122,0.07), 0 2px 10px rgba(0,0,0,0.03)" : DT.shadow,
        backdropFilter: "blur(12px)",
      }}
    >
      <style>{`
        @keyframes orderRailIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 1040px) {
          @keyframes orderRailIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
      <div style={{ padding: "12px 12px 10px", borderBottom: `1px solid ${DT.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint, fontFamily: DT.sans }}>Orders</div>
          <div style={{ marginTop: 2, fontFamily: DT.serif, fontSize: 18, color: DT.textPrimary, lineHeight: 1 }}>{assignmentTask ? "Assign task" : selectedOrder ? "Job command" : `${filteredOrders.length} active`}</div>
        </div>
        {(selectedOrder || assignmentTask) && (
          <button
            type="button"
            onClick={onClear}
            style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "6px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 900, cursor: "pointer" }}
          >
            Back to list
          </button>
        )}
      </div>
      {assignmentTask ? (
        <TaskAssignmentPanel key={`assign-${assignmentTask.id}`} task={assignmentTask} orders={activeOrders} status={assignmentStatus} onAssign={onAssignTask} onRemove={onRemoveTaskLink} canRemoveLink={canRemoveAssignmentLink} />
      ) : selectedOrder ? (
        <OrderRailDetail key={`detail-${selectedOrder.id}`} order={selectedOrder} planTasks={selectedOrderTasks} onWorkflowChange={onWorkflowChange} onOpen={() => onOpenOrder(selectedOrder.id)} />
      ) : (
        <div key="list" style={{ maxHeight: isNarrow ? undefined : "calc(100vh - 96px)", overflowY: "auto", padding: 10, animation: "orderRailIn 1000ms ease both" }}>
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr auto", gap: 6 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search orders"
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, outline: "none" }}
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as RailSort)}
              aria-label="Sort orders"
              style={{ width: isNarrow ? "100%" : 112, border: `1px solid ${DT.border}`, borderRadius: 9, padding: "8px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textMuted, background: DT.cardBg, outline: "none" }}
            >
              <option value="soonest">Due soonest</option>
              <option value="latest">Due latest</option>
              <option value="customer">Customer A-Z</option>
            </select>
          </div>
          {newOrderCard}
          <div style={{ marginTop: newOrderCard ? 8 : 0, display: "flex", gap: 6, flexWrap: "wrap", paddingBottom: 2 }}>
            {filterOptions.map((option) => {
              const active = filter === option.id;
              return (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => setFilter(option.id)}
                  style={{ flex: "0 0 auto", border: `1px solid ${active ? "rgba(12,124,122,0.32)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 900, cursor: "pointer" }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: isNarrow ? "row" : "column", gap: 8, overflowX: isNarrow ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
            {filteredOrders.map((order) => (
              <OrderRailItem key={order.id} order={order} onSelect={onSelect} isNarrow={isNarrow} />
            ))}
            {filteredOrders.length === 0 && (
              <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35, padding: "8px 2px" }}>No active orders match that view.</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function OrderRailItem({ order, onSelect, isNarrow }: { order: UiOrder; onSelect: (id: number) => void; isNarrow: boolean }) {
  const health = HEALTH_META[orderHealth(order)];
  return (
    <button
      type="button"
      onClick={() => onSelect(order.id)}
      style={{
        flex: isNarrow ? "0 0 260px" : undefined,
        width: "100%",
        minWidth: 0,
        textAlign: "left",
        border: `1px solid ${DT.border}`,
        borderLeft: `4px solid ${health.color}`,
        background: DT.cardBg,
        borderRadius: 10,
        padding: "10px 10px 9px",
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.025)",
        transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateX(-2px)";
        event.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateX(0)";
        event.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.025)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 13, fontWeight: 900, color: DT.textPrimary, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
          <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderItemLabel(order)} · {orderStatusLabel(order)}</div>
        </div>
        <div style={{ flex: "0 0 auto", textAlign: "right" }}>
          <div style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 950, color: DT.textPrimary }}>{formatShortDate(order.shipDate)}</div>
          <div style={{ marginTop: 4, display: "inline-flex", border: `1px solid ${health.border}`, background: health.bg, color: health.color, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{health.label}</div>
        </div>
      </div>
    </button>
  );
}

function NewOrderRailCard({
  order,
  showingInMonth,
  approved,
  onOpen,
  onToggleMonthTasks,
  onApprove,
}: {
  order: NewOrderPlanCandidate | null;
  showingInMonth: boolean;
  approved: boolean;
  onOpen: () => void;
  onToggleMonthTasks: () => void;
  onApprove: () => void;
}) {
  if (!order) return null;
  return (
    <div style={{ marginBottom: 8, border: `1px solid ${newOrderPalette.clayBorder}`, borderLeft: `4px solid ${newOrderPalette.clayStripe}`, background: newOrderPalette.clayPanel, borderRadius: 10, padding: "9px 10px", boxShadow: "0 1px 4px rgba(154,82,49,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: newOrderPalette.clayAccent }}>New order</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 12, fontWeight: 950, color: DT.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
          <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, color: DT.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.product || "Order"} · Ordered {formatOrderedDate(order.orderedDate)}</div>
        </div>
        {approved && <span style={{ flex: "0 0 auto", border: `1px solid ${newOrderPalette.clayBorderStrong}`, color: newOrderPalette.clayAccentDark, background: "rgba(255,255,255,0.62)", borderRadius: 999, padding: "3px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>Approved</span>}
      </div>
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button
          type="button"
          onClick={onToggleMonthTasks}
          style={{ border: `1px solid ${newOrderPalette.clayBorder}`, background: "rgba(255,255,255,0.68)", color: newOrderPalette.clayAccentDark, borderRadius: 999, padding: "6px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
        >
          {showingInMonth ? "Hide tasks" : "Show tasks"}
        </button>
        <button
          type="button"
          onClick={onApprove}
          style={{ border: `1px solid ${newOrderPalette.clayBorderStrong}`, background: approved ? "rgba(255,255,255,0.62)" : newOrderPalette.clayAccent, color: approved ? newOrderPalette.clayAccentDark : "#fff", borderRadius: 999, padding: "6px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
        >
          {approved ? "Approved" : "Approve"}
        </button>
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{ marginTop: 6, width: "100%", border: "none", background: "transparent", color: newOrderPalette.clayAccentDark, padding: "2px 0", textAlign: "left", fontFamily: DT.sans, fontSize: 10, fontWeight: 900, cursor: "pointer" }}
      >
        Open full task list
      </button>
    </div>
  );
}

function TaskAssignmentPanel({
  task,
  orders,
  status,
  onAssign,
  onRemove,
  canRemoveLink,
}: {
  task: AssignablePlanTask;
  orders: UiOrder[];
  status: string;
  onAssign: (task: AssignablePlanTask, orderId: number) => void;
  onRemove: (task: AssignablePlanTask) => void;
  canRemoveLink: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeOrderText(query);
  const filteredOrders = useMemo(() => {
    if (!normalizedQuery) return orders.slice(0, 18);
    return orders
      .filter((order) => normalizeOrderText(`${order.customer} ${orderItemLabel(order)} ${orderStatusLabel(order)}`).includes(normalizedQuery))
      .slice(0, 18);
  }, [orders, normalizedQuery]);

  return (
    <div style={{ padding: 10, animation: "orderRailIn 1000ms ease both", maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}>
      <div style={{ border: "1px dashed rgba(125,122,115,0.28)", background: "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(232,230,224,0.55))", borderRadius: 10, padding: 10 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7d7a73" }}>Assign this task to a job</div>
        <h3 style={{ margin: "5px 0 0", fontFamily: DT.serif, fontSize: 18, lineHeight: 1.1, color: DT.textPrimary }}>{task.text}</h3>
        <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>
          {task.weekTitle} · {DAY_LABELS[task.day]} · {PERSON_LABELS[task.person]}
        </div>
        <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textFaint, lineHeight: 1.35, overflowWrap: "anywhere" }}>{task.rowName}</div>
      </div>
      <div style={{ marginTop: 9, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 10, padding: 9 }}>
        <label style={{ display: "block", fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>
          Assign to order
        </label>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer or item"
          style={{ marginTop: 7, width: "100%", boxSizing: "border-box", border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, background: DT.cardBg, outline: "none" }}
        />
        {status && <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 850 }}>{status}</div>}
        {canRemoveLink && (
          <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onRemove(task)}
              style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.74)", color: DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 900, cursor: "pointer" }}
            >
              Remove Tuesday link
            </button>
          </div>
        )}
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {filteredOrders.map((order) => {
            const health = HEALTH_META[orderHealth(order)];
            return (
              <button
                type="button"
                key={order.id}
                onClick={() => onAssign(task, order.id)}
                style={{ width: "100%", minWidth: 0, textAlign: "left", border: `1px solid ${DT.border}`, borderLeft: `4px solid ${health.color}`, background: DT.cardBg, borderRadius: 9, padding: "8px 9px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.025)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DT.sans, fontSize: 12, fontWeight: 900, color: DT.textPrimary, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customer}</div>
                    <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orderItemLabel(order)} · {orderStatusLabel(order)}</div>
                  </div>
                  <div style={{ flex: "0 0 auto", textAlign: "right", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, color: DT.textPrimary }}>{formatShortDate(order.shipDate)}</div>
                </div>
              </button>
            );
          })}
          {filteredOrders.length === 0 && (
            <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No matching active orders.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderRailDetail({ order, planTasks, onWorkflowChange, onOpen }: { order: UiOrder; planTasks: WorkshopTask[]; onWorkflowChange: (workflow: OrderWorkflowState | null) => void; onOpen: () => void }) {
  const health = HEALTH_META[orderHealth(order)];
  const { workflow, workflowStatus } = useOrderWorkflow(order, onWorkflowChange);
  const openJobTasks = workflow.tasks
    .filter((task) => !task.done)
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  const nextJobTask = openJobTasks[0] ?? null;
  const nextPlanTask = planTasks[0] ?? null;
  const qcDone = dispatchQcItems(order).filter((label) => workflow.qc[label]?.done).length;

  return (
    <div style={{ padding: 10, animation: "orderRailIn 1000ms ease both", maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}>
      <div style={{ border: `1px solid ${health.border}`, background: health.bg, borderRadius: 10, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <h3 style={{ margin: 0, fontFamily: DT.serif, fontSize: 19, lineHeight: 1.04, color: DT.textPrimary }}>{order.customer}</h3>
          <span style={{ flex: "0 0 auto", border: `1px solid ${health.border}`, background: DT.cardBg, color: health.color, borderRadius: 999, padding: "4px 7px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950 }}>{health.label}</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, fontWeight: 800, lineHeight: 1.3 }}>{nextOrderPrompt(order)}</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <MiniFact label="Due" value={`${formatShortDate(order.shipDate)} · ${dueLabel(order)}`} />
          <MiniFact label="Item" value={orderItemLabel(order)} />
          <MiniFact label="Next" value={nextJobTask?.title ?? nextPlanTask?.text ?? "No task set"} />
          <MiniFact label="Progress" value={`${orderProgressPct(order)}% · ${order.stepNote || "No step"}`} />
        </div>
        <button
          type="button"
          onClick={onOpen}
          style={{ marginTop: 9, width: "100%", border: `1px solid rgba(12,124,122,0.22)`, background: DT.teal, color: "#fff", borderRadius: 999, padding: "8px 10px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}
        >
          Open order
        </button>
        {workflowStatus && <div style={{ marginTop: 6, textAlign: "center", fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850 }}>{workflowStatus}</div>}
      </div>
      <NextActionCard order={order} nextJobTask={nextJobTask} nextPlanTask={nextPlanTask} openJobTaskCount={openJobTasks.length} planTaskCount={planTasks.length} qcDone={qcDone} qcTotal={dispatchQcItems(order).length} />
    </div>
  );
}

function OrderOverviewOverlay({
  order,
  planTasks,
  onClose,
  onWorkflowChange,
}: {
  order: UiOrder;
  planTasks: WorkshopTask[];
  onClose: () => void;
  onWorkflowChange: (workflow: OrderWorkflowState | null) => void;
}) {
  const isNarrow = useIsNarrow(760);
  const health = HEALTH_META[orderHealth(order)];
  const mode = deliveryMode(order);
  const freightBookBy = addWorkingDays(order.shipDate, -mode.workingDays);
  const { workflow, workflowStatus, updateWorkflow } = useOrderWorkflow(order, onWorkflowChange);
  const progress = orderProgressPct(order);
  const sourceDetails = [
    order.rawMondayTopPanel ? `Top/panel: ${order.rawMondayTopPanel}` : null,
    order.rawMondayLegs ? `Legs/base: ${order.rawMondayLegs}` : null,
    order.notes ? `Notes: ${order.notes}` : null,
  ].filter((detail): detail is string => Boolean(detail));
  const openJobTasks = workflow.tasks
    .filter((task) => !task.done)
    .sort((a, b) => (a.scheduledDate || "").localeCompare(b.scheduledDate || ""));
  const nextJobTask = openJobTasks[0] ?? null;
  const nextPlanTask = planTasks[0] ?? null;
  const qcDone = dispatchQcItems(order).filter((label) => workflow.qc[label]?.done).length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${order.customer} order overview`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 180,
        background: "rgba(34,32,26,0.30)",
        backdropFilter: "blur(6px)",
        display: "flex",
        justifyContent: "center",
        alignItems: isNarrow ? "stretch" : "flex-start",
        padding: isNarrow ? 0 : "30px 18px",
        overflowY: "auto",
        animation: "orderRailIn 220ms ease both",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isNarrow ? "100%" : "min(1180px, calc(100vw - 44px))",
          minHeight: isNarrow ? "100vh" : undefined,
          maxHeight: isNarrow ? undefined : "calc(100vh - 60px)",
          overflowY: "auto",
          borderRadius: isNarrow ? 0 : 18,
          border: isNarrow ? "none" : `1px solid ${DT.border}`,
          background: `linear-gradient(135deg, ${health.bg}, rgba(255,253,249,0.98) 34%, ${DT.cardBg} 100%)`,
          boxShadow: "0 24px 70px rgba(34,32,26,0.24)",
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "rgba(255,253,249,0.92)", backdropFilter: "blur(16px)", borderBottom: `1px solid ${DT.border}`, padding: isNarrow ? "14px 14px 12px" : "18px 22px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: health.color, flex: "0 0 auto" }} />
                <h2 style={{ margin: 0, fontFamily: DT.serif, fontSize: isNarrow ? 27 : 34, lineHeight: 1.02, color: DT.textPrimary }}>{order.customer}</h2>
                <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.68)", color: DT.textMuted, borderRadius: 7, padding: "3px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.05em" }}>{orderItemLabel(order)}</span>
                <span style={{ border: `1px solid ${health.border}`, background: health.bg, color: health.color, borderRadius: 999, padding: "4px 9px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950 }}>{health.label}</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontFamily: DT.sans, fontSize: 12, fontWeight: 850, color: DT.textMuted }}>
                <span>Due {formatShortDate(order.shipDate)}</span>
                <span>{dueLabel(order)}</span>
                <span>{formatCurrencyShort(order.value)}</span>
                {order.xero && <a href={order.xero} target="_blank" rel="noreferrer" style={{ color: DT.teal, textDecoration: "none" }}>Xero invoice</a>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: "0 0 auto", border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "8px 12px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer" }}
            >
              Close
            </button>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 5, background: "rgba(0,0,0,0.045)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: DT.teal, transition: "width 450ms ease" }} />
            </div>
            <span style={{ fontFamily: DT.sans, fontSize: 11, fontWeight: 900, color: DT.textMuted, minWidth: 34, textAlign: "right" }}>{progress}%</span>
          </div>
        </div>
        <div style={{ padding: isNarrow ? "14px 14px 0" : "18px 22px 0" }}>
          <WorkshopSpec order={order} packLabel={mode.label} packDetail={mode.detail} freightBookBy={freightBookBy} freightWorkingDays={mode.workingDays} xeroUrl={order.xero} xeroInvoiceNumber={workflow.xeroInvoiceNumber || order.xeroInvoiceNumber} onInvoiceNumberChange={(invoiceNumber) => updateWorkflow((state) => ({ ...state, xeroInvoiceNumber: invoiceNumber }))} prominent />
        </div>
        <div style={{ padding: isNarrow ? 14 : 22, display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "minmax(320px, 0.86fr) minmax(420px, 1.14fr)", gap: isNarrow ? 12 : 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <NextActionCard order={order} nextJobTask={nextJobTask} nextPlanTask={nextPlanTask} openJobTaskCount={openJobTasks.length} planTaskCount={planTasks.length} qcDone={qcDone} qcTotal={dispatchQcItems(order).length} />
            <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.68)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Production progress</div>
              <div style={{ marginTop: 10 }}>
                <OrderStepTimeline order={order} />
              </div>
            </div>
            {sourceDetails.length > 0 && (
              <div style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.58)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.textFaint }}>Source details</div>
                <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
                  {sourceDetails.map((detail) => (
                    <div key={detail} style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted, lineHeight: 1.35 }}>{detail}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <CollectionControl workflow={workflow} status={workflowStatus} onChange={updateWorkflow} />
            <WorkshopTasks tasks={planTasks} />
            <EditableJobTasks workflow={workflow} onChange={updateWorkflow} />
            <QcChecklist order={order} workflow={workflow} onChange={updateWorkflow} />
            <OrderPhotoTray orderId={order.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderStepTimeline({ order }: { order: UiOrder }) {
  const steps = stepsForOrder(order);
  const repair = order.rawMondayTopPanel === "Repair";
  if (steps.length === 0) {
    return <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textMuted }}>No production steps available for this item yet.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, index) => {
        const done = index < order.currentStep;
        const active = index === order.currentStep;
        const isRepair = repair && active;
        const fill = isRepair ? "#d97706" : DT.teal;
        return (
          <div key={step.key} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
              {index > 0 && <div style={{ width: 2, flex: "1 1 0", minHeight: 4, background: done || active ? fill : "rgba(0,0,0,0.06)" }} />}
              {index === 0 && <div style={{ flex: "1 1 0" }} />}
              {step.wait ? (
                <div style={{ width: 14, height: 14, borderRadius: 3, background: done ? `${fill}18` : active ? "rgba(200,169,110,0.12)" : "rgba(0,0,0,0.03)", border: `1.5px dashed ${done ? fill : active ? DT.gold : "rgba(0,0,0,0.10)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 7 }}>{done ? "✓" : ""}</span>
                </div>
              ) : (
                <div style={{ width: done ? 10 : active ? 14 : 10, height: done ? 10 : active ? 14 : 10, borderRadius: "50%", background: done ? fill : active ? fill : "transparent", border: done || active ? `2px solid ${fill}` : "2px solid rgba(0,0,0,0.08)", boxShadow: active ? `0 0 0 3px ${fill}18` : "none", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done && <span style={{ color: "#fff", fontSize: 7, lineHeight: 1 }}>✓</span>}
                </div>
              )}
              {index < steps.length - 1 && <div style={{ width: 2, flex: "1 1 0", minHeight: 4, background: done ? fill : "rgba(0,0,0,0.06)" }} />}
              {index === steps.length - 1 && <div style={{ flex: "1 1 0" }} />}
            </div>
            <div style={{ padding: "4px 0", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontFamily: DT.sans, fontWeight: active ? 800 : done ? 650 : 500, color: active ? fill : done ? DT.textSecondary : DT.textFaint, textDecoration: done && !active ? "line-through" : "none", textDecorationColor: done ? "rgba(0,0,0,0.12)" : "transparent" }}>
                  {step.label}
                </span>
                {step.who && !done && <span style={{ fontSize: 9, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 500 }}>{step.who}</span>}
                {step.wait && !done && <span style={{ fontSize: 9, color: DT.gold, fontFamily: DT.sans, fontWeight: 650, fontStyle: "italic" }}>{step.waitLabel}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0, border: "1px solid rgba(0,0,0,0.045)", background: "rgba(255,255,255,0.74)", borderRadius: 7, padding: "6px 7px" }}>
      <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>{label}</div>
      <div style={{ marginTop: 2, fontFamily: DT.sans, fontSize: 11, fontWeight: 850, color: DT.textPrimary, lineHeight: 1.22, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

type NextActionSummary = {
  label: string;
  title: string;
  meta: string;
  context: string;
  tone: "task" | "plan" | "qc" | "health";
};

function nextActionForOrder({
  order,
  nextJobTask,
  nextPlanTask,
  qcDone,
  qcTotal,
}: {
  order: UiOrder;
  nextJobTask: WorkflowTask | null;
  nextPlanTask: WorkshopTask | null;
  qcDone: number;
  qcTotal: number;
}): NextActionSummary {
  if (nextJobTask) {
    return {
      label: "Job task",
      title: nextJobTask.title,
      meta: `${nextJobTask.scheduledDate ? formatShortDate(nextJobTask.scheduledDate) : "No day"} · ${nextJobTask.owner || "Unassigned"}`,
      context: nextJobTask.notes || "Added inside Tuesday for this job.",
      tone: "task",
    };
  }
  if (nextPlanTask) {
    return {
      label: "Production Plan",
      title: nextPlanTask.text,
      meta: `${nextPlanTask.weekTitle} · ${DAY_LABELS[nextPlanTask.day]} · ${PERSON_LABELS[nextPlanTask.person]}`,
      context: nextPlanTask.notes || nextPlanTask.rowName,
      tone: "plan",
    };
  }
  const daysUntil = orderDaysUntil(order.shipDate);
  if (qcTotal > 0 && qcDone < qcTotal && daysUntil !== null && daysUntil <= 7) {
    return {
      label: "QC / dispatch",
      title: "Finish QC before due date",
      meta: `${qcDone}/${qcTotal} QC items done · Due ${formatShortDate(order.shipDate)}`,
      context: "Check photos, freight or collection, and customer update before this leaves.",
      tone: "qc",
    };
  }
  return {
    label: "Health check",
    title: nextOrderPrompt(order),
    meta: `${dueLabel(order)} · ${orderHealthReason(order)}`,
    context: "Confirm the real workshop state before changing production truth.",
    tone: "health",
  };
}

function NextActionCard({
  order,
  nextJobTask,
  nextPlanTask,
  openJobTaskCount,
  planTaskCount,
  qcDone,
  qcTotal,
}: {
  order: UiOrder;
  nextJobTask: WorkflowTask | null;
  nextPlanTask: WorkshopTask | null;
  openJobTaskCount: number;
  planTaskCount: number;
  qcDone: number;
  qcTotal: number;
}) {
  const action = nextActionForOrder({ order, nextJobTask, nextPlanTask, qcDone, qcTotal });
  const tone = action.tone === "health" ? HEALTH_META[orderHealth(order)] : { color: DT.sage, bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.22)" };
  return (
    <div style={{ marginTop: 8, border: `1px solid ${tone.border}`, background: `linear-gradient(135deg, ${tone.bg}, rgba(255,255,255,0.82))`, borderRadius: 10, padding: "9px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: tone.color }}>Next Action</div>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, color: DT.textMuted }}>{action.label}</div>
      </div>
      <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 14, fontWeight: 950, color: DT.textPrimary, lineHeight: 1.15, overflowWrap: "anywhere" }}>{action.title}</div>
      <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 10, fontWeight: 800, color: DT.textMuted, lineHeight: 1.3 }}>{action.meta}</div>
      <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, lineHeight: 1.35 }}>{action.context}</div>
      <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <MiniFact label="Job tasks" value={String(openJobTaskCount)} />
        <MiniFact label="Plan tasks" value={String(planTaskCount)} />
        <MiniFact label="QC" value={`${qcDone}/${qcTotal}`} />
      </div>
    </div>
  );
}

function CollectionControl({
  workflow,
  status,
  onChange,
}: {
  workflow: OrderWorkflowState;
  status: string;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const collection = workflow.collection;
  const hasBooking = Boolean(collection.bookedDay || collection.bookedTime || collection.by);
  const bookingLabel = [
    collection.bookedDay ? formatShortDate(collection.bookedDay) : null,
    collection.bookedTime || null,
    collection.by || null,
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 9, padding: "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Collection / dispatch</div>
        {status && <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, fontWeight: 850 }}>{status}</span>}
      </div>
      <label style={{ marginTop: 7, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 7, alignItems: "start", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 850 }}>
        <input
          type="checkbox"
          checked={collection.status === "booked" || collection.status === "collected"}
          onChange={(event) => {
            const checked = event.target.checked;
            onChange((state) => ({
              ...state,
              collection: {
                ...state.collection,
                status: checked ? "booked" : "open",
                collectedAt: checked ? state.collection.collectedAt : null,
              },
            }));
          }}
        />
        <span>
          Booked{hasBooking ? ` · ${bookingLabel}` : ""}
        </span>
      </label>
      <label style={{ marginTop: 5, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 7, alignItems: "start", fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 850 }}>
        <input
          type="checkbox"
          checked={collection.status === "collected"}
          onChange={(event) => {
            const checked = event.target.checked;
            onChange((state) => ({
              ...state,
              collection: {
                ...state.collection,
                status: checked ? "collected" : state.collection.bookedDay ? "booked" : "open",
                collectedAt: checked ? new Date().toISOString() : null,
              },
            }));
          }}
        />
        Collected / gone
      </label>
      <details open={!hasBooking} style={{ marginTop: 6 }}>
        <summary style={{ listStyle: "none", cursor: "pointer", fontFamily: DT.sans, fontSize: 10, color: DT.teal, fontWeight: 900 }}>{hasBooking ? "Edit booking" : "Add booking details"}</summary>
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 74px", gap: 6 }}>
          <input
            type="date"
            value={collection.bookedDay}
            onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, bookedDay: event.target.value, status: state.collection.status === "collected" ? "collected" : event.target.value ? "booked" : "open" } }))}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
          <input
            type="time"
            value={collection.bookedTime}
            onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, bookedTime: event.target.value } }))}
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
        </div>
        <select
          value={collection.by}
          onChange={(event) => onChange((state) => ({ ...state, collection: { ...state.collection, by: event.target.value as Carrier, status: state.collection.status === "collected" ? "collected" : "booked" } }))}
          style={{ marginTop: 6, width: "100%", border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
        >
          <option value="">Booked by...</option>
          <option value="Pinpoint">Pinpoint</option>
          <option value="Mainfreight">Mainfreight</option>
          <option value="Customer">Customer</option>
        </select>
      </details>
      {collection.collectedAt && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted }}>Marked collected {formatCompletedAt(collection.collectedAt)}</div>}
    </div>
  );
}

function WorkshopTasks({ tasks }: { tasks: WorkshopTask[] }) {
  return (
    <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.66)", borderRadius: 9, padding: "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Plan tasks</div>
        <div style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 900, color: DT.teal }}>{tasks.length}</div>
      </div>
      <div style={{ marginTop: 6, display: "grid", gap: 5 }}>
        {tasks.length === 0 ? (
          <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.35 }}>No linked Production Plan tasks found yet.</div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} style={{ display: "grid", gridTemplateColumns: "58px minmax(0, 1fr)", gap: 7, alignItems: "start", borderTop: "1px solid rgba(0,0,0,0.045)", paddingTop: 5 }}>
              <div style={{ fontFamily: DT.sans, fontSize: 9, color: DT.teal, fontWeight: 950, lineHeight: 1.25 }}>{DAY_LABELS[task.day]}<br />{PERSON_LABELS[task.person]}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 12, color: DT.textPrimary, fontWeight: 850, lineHeight: 1.22 }}>{task.text}</div>
                <div style={{ marginTop: 1, fontFamily: DT.sans, fontSize: 9, color: DT.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.weekTitle} · {task.rowName}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PersonSelect({ value, onChange }: { value: WorkshopPerson; onChange: (value: WorkshopPerson) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as WorkshopPerson)}
      style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
    >
      <option value="">By</option>
      <option value="Nick">Nick</option>
      <option value="Dylan">Dylan</option>
      <option value="Guido">Guido</option>
      <option value="Other">Other</option>
    </select>
  );
}

function EditableJobTasks({
  workflow,
  onChange,
}: {
  workflow: OrderWorkflowState;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [draftAction, setDraftAction] = useState<string>(JOB_TASK_PRESETS[0]);
  const [draftCustom, setDraftCustom] = useState("");
  const [draftOwner, setDraftOwner] = useState<WorkshopPerson>("Nick");
  const [draftDate, setDraftDate] = useState(today);
  const open = workflow.tasks.filter((task) => !task.done);
  const done = workflow.tasks.filter((task) => task.done);
  const draftTitle = draftAction === "Custom" ? draftCustom.trim() : draftAction;
  function updateTask(id: string, patch: Partial<WorkflowTask>) {
    onChange((state) => ({
      ...state,
      tasks: state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task),
    }));
  }
  function addTask() {
    if (!draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate) return;
    onChange((state) => ({
      ...state,
      tasks: [
        ...state.tasks,
        {
          id: `task-${Date.now()}`,
          title: draftTitle,
          owner: draftOwner,
          scheduledDate: draftDate,
          done: false,
          completedAt: null,
          completedBy: "",
          notes: "",
        },
      ],
    }));
    setDraftCustom("");
  }
  return (
    <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.66)", borderRadius: 9, padding: "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Job tasks</div>
        <button
          type="button"
          onClick={addTask}
          disabled={!draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate}
          title="Add task to this job and show it on the Production Plan"
          style={{ border: `1px solid rgba(12,124,122,0.18)`, background: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? DT.textFaint : DT.teal, borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: !draftTitle || !workflowOwnerToPerson(draftOwner) || !draftDate ? "not-allowed" : "pointer" }}
        >
          ✓
        </button>
      </div>
      <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 74px", gap: 6 }}>
        <select
          value={draftAction}
          onChange={(event) => setDraftAction(event.target.value)}
          style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
        >
          {JOB_TASK_PRESETS.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
        <select
          value={draftOwner}
          onChange={(event) => setDraftOwner(event.target.value as WorkshopPerson)}
          style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
        >
          <option value="Nick">Nick</option>
          <option value="Dylan">Dylan</option>
        </select>
      </div>
      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: draftAction === "Custom" ? "minmax(0, 1fr) 112px" : "1fr", gap: 6 }}>
        {draftAction === "Custom" && (
          <input
            value={draftCustom}
            onChange={(event) => setDraftCustom(event.target.value)}
            placeholder="Write task"
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
        )}
        <input
          type="date"
          value={draftDate}
          onChange={(event) => setDraftDate(event.target.value)}
          style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 7, padding: "6px 7px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
        />
      </div>
      <div style={{ marginTop: 6, display: "grid", gap: 5 }}>
        {workflow.tasks.length === 0 && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>No extra job tasks yet.</div>}
        {[...open, ...done].map((task) => (
          <div key={task.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 6, borderTop: "1px solid rgba(0,0,0,0.045)", paddingTop: 5 }}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={(event) => {
                const checked = event.target.checked;
                updateTask(task.id, {
                  done: checked,
                  completedAt: checked ? new Date().toISOString() : null,
                  completedBy: checked ? (task.completedBy || task.owner) : "",
                });
              }}
              style={{ marginTop: 5 }}
            />
            <div style={{ minWidth: 0 }}>
              <input
                value={task.title}
                onChange={(event) => updateTask(task.id, { title: event.target.value })}
                style={{ width: "100%", border: "none", background: "transparent", padding: 0, fontFamily: DT.sans, fontSize: 12, fontWeight: 850, color: task.done ? DT.textMuted : DT.textPrimary, textDecoration: task.done ? "line-through" : "none", outline: "none" }}
              />
              <div style={{ marginTop: 4, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                <PersonSelect value={task.owner} onChange={(value) => updateTask(task.id, { owner: value })} />
                <input
                  type="date"
                  value={task.scheduledDate || ""}
                  onChange={(event) => updateTask(task.id, { scheduledDate: event.target.value })}
                  style={{ border: `1px solid ${DT.border}`, borderRadius: 7, padding: "4px 5px", fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, background: DT.cardBg }}
                />
                {task.done && <PersonSelect value={task.completedBy} onChange={(value) => updateTask(task.id, { completedBy: value })} />}
                {task.completedAt && <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted }}>{formatCompletedAt(task.completedAt)}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QcChecklist({
  order,
  workflow,
  onChange,
}: {
  order: UiOrder;
  workflow: OrderWorkflowState;
  onChange: (patch: (state: OrderWorkflowState) => OrderWorkflowState) => void;
}) {
  const items = dispatchQcItems(order);
  function toggle(label: string, checked: boolean) {
    onChange((state) => ({
      ...state,
      qc: {
        ...state.qc,
        [label]: {
          done: checked,
          completedAt: checked ? new Date().toISOString() : null,
          completedBy: checked ? (state.qc[label]?.completedBy || "") : "",
        },
      },
    }));
  }
  return (
    <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.66)", borderRadius: 9, padding: "8px 9px" }}>
      <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>QC</div>
      <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
        {items.map((label) => {
          const item = workflow.qc[label] ?? { done: false, completedAt: null, completedBy: "" as WorkshopPerson };
          return (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 6, alignItems: "start", borderTop: "1px solid rgba(0,0,0,0.045)", paddingTop: 5 }}>
              <input type="checkbox" checked={item.done} onChange={(event) => toggle(label, event.target.checked)} style={{ marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: DT.sans, fontSize: 11, color: item.done ? DT.textMuted : DT.textPrimary, fontWeight: 800, lineHeight: 1.25 }}>{label}</div>
                {item.done && (
                  <div style={{ marginTop: 3, display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                    <PersonSelect
                      value={item.completedBy}
                      onChange={(value) => onChange((state) => ({ ...state, qc: { ...state.qc, [label]: { ...item, completedBy: value } } }))}
                    />
                    <span style={{ fontFamily: DT.sans, fontSize: 9, color: DT.textMuted }}>{formatCompletedAt(item.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


type XeroProofInvoice = {
  invoiceNumber: string | null;
  contact: string | null;
  status: string | null;
  dueDate: string | null;
  total: number | null;
  amountDue: number | null;
  amountPaid: number | null;
  xeroUrl: string | null;
  lineItems?: Array<{ description: string; quantity?: number | null; unitAmount?: number | null; lineAmount?: number | null }>;
};

type XeroProofState = {
  loading: boolean;
  invoice: XeroProofInvoice | null;
  error: string;
  notFound: boolean;
};

function xeroPaymentLabel(invoice: XeroProofInvoice | null, loading: boolean, error: string, notFound: boolean, invoiceNumber?: string | null) {
  if (!invoiceNumber) return "Invoice number needed";
  if (loading) return "Checking Xero";
  if (error) return "Xero error";
  if (notFound || !invoice) return "Not found";
  if ((invoice.status || "").toUpperCase() === "PAID" || invoice.amountDue === 0) return "Paid";
  if ((invoice.status || "").toUpperCase() === "DRAFT") return "Draft";
  return "Awaiting payment";
}

function xeroPaymentTone(label: string) {
  if (label === "Paid") return { bg: "rgba(64,128,72,0.10)", border: "rgba(64,128,72,0.22)", color: "#408048" };
  if (label === "Awaiting payment" || label === "Draft") return { bg: "rgba(178,97,36,0.09)", border: "rgba(178,97,36,0.20)", color: "#b26124" };
  if (label === "Xero error" || label === "Not found") return { bg: "rgba(146,42,35,0.08)", border: "rgba(146,42,35,0.18)", color: "#922a23" };
  return { bg: "rgba(110,138,106,0.10)", border: "rgba(110,138,106,0.20)", color: DT.sage };
}

function parseXeroWorkshopSpec(invoice: XeroProofInvoice | null) {
  const text = (invoice?.lineItems || []).map((line) => line.description || "").filter(Boolean).join("\n\n");
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const dimensionLine = lines.find((line) => /\d{3,5}\s*[x×]\s*\d{2,5}/i.test(line));
  const finishLine = lines.find((line) => line !== dimensionLine && /(finish|coat|oil|stain|wash|t[oō]tara|rimu|beech|oak|ash|walnut|macrocarpa|clear)/i.test(line));
  const deliveredIndex = lines.findIndex((line) => /delivered\s+to|delivery\s+to|deliver\s+to/i.test(line));
  const delivery = deliveredIndex >= 0 ? lines.slice(deliveredIndex + 1, deliveredIndex + 5).join(", ") : "";
  return {
    dimensions: dimensionLine || "",
    finish: finishLine || "",
    delivery,
  };
}

function formatXeroMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function formatXeroQuantity(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function WorkshopSpec({
  order,
  packLabel,
  packDetail,
  freightBookBy,
  freightWorkingDays,
  xeroUrl,
  xeroInvoiceNumber,
  onInvoiceNumberChange,
  prominent = false,
}: {
  order: UiOrder;
  packLabel: string;
  packDetail: string;
  freightBookBy: Date | null;
  freightWorkingDays: number;
  xeroUrl?: string | null;
  xeroInvoiceNumber?: string | null;
  onInvoiceNumberChange?: (invoiceNumber: string | null) => void;
  prominent?: boolean;
}) {
  const [showInvoiceDetails, setShowInvoiceDetails] = useState(true);
  const [invoiceDraft, setInvoiceDraft] = useState(xeroInvoiceNumber ?? "");
  const [xeroProof, setXeroProof] = useState<XeroProofState>({ loading: false, invoice: null, error: "", notFound: false });

  useEffect(() => {
    setInvoiceDraft(xeroInvoiceNumber ?? "");
  }, [xeroInvoiceNumber]);

  useEffect(() => {
    let cancelled = false;
    async function loadXeroInvoice() {
      if (!xeroInvoiceNumber) {
        setXeroProof({ loading: false, invoice: null, error: "", notFound: false });
        return;
      }
      setXeroProof({ loading: true, invoice: null, error: "", notFound: false });
      try {
        const response = await fetch(`/api/xero/proof?invoiceNumber=${encodeURIComponent(xeroInvoiceNumber)}&includeLineItems=1`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { ok?: boolean; invoiceCount?: number; invoices?: XeroProofInvoice[]; error?: string } | null;
        if (!response.ok || !data?.ok) throw new Error(data?.error || "Xero lookup failed");
        const invoice = data.invoices?.[0] ?? null;
        if (!cancelled) setXeroProof({ loading: false, invoice, error: "", notFound: !invoice });
      } catch (error) {
        if (!cancelled) setXeroProof({ loading: false, invoice: null, error: error instanceof Error ? error.message : "Xero lookup failed", notFound: false });
      }
    }
    void loadXeroInvoice();
    return () => {
      cancelled = true;
    };
  }, [xeroInvoiceNumber]);

  function saveInvoiceDraft() {
    onInvoiceNumberChange?.(invoiceDraft.trim() ? invoiceDraft.trim().toUpperCase() : null);
  }

  const parsedXeroSpec = parseXeroWorkshopSpec(xeroProof.invoice);
  const paymentLabel = xeroPaymentLabel(xeroProof.invoice, xeroProof.loading, xeroProof.error, xeroProof.notFound, xeroInvoiceNumber);
  const paymentTone = xeroPaymentTone(paymentLabel);
  const xeroSourceUrl = xeroProof.invoice?.xeroUrl || xeroUrl;
  const lineItems = xeroProof.invoice?.lineItems?.filter((line) => line.description?.trim()) ?? [];
  const logistics = [
    { label: "Pack", value: `${packLabel} - ${packDetail}` },
    { label: "Book freight", value: `${formatLongDate(freightBookBy)} - ${freightWorkingDays} workday${freightWorkingDays === 1 ? "" : "s"} before due` },
    { label: "Delivery", value: parsedXeroSpec.delivery || order.deliveryLocation || order.freightRef || "No delivery detail captured yet" },
  ];

  return (
    <div style={{ marginTop: prominent ? 0 : 8, border: `1px solid ${prominent ? "rgba(110,138,106,0.26)" : DT.border}`, background: prominent ? "linear-gradient(135deg, rgba(255,253,249,0.96), rgba(110,138,106,0.08))" : "rgba(255,255,255,0.66)", borderRadius: prominent ? 13 : 9, padding: prominent ? "11px 12px" : "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: prominent ? DT.sage : DT.textFaint }}>Workshop spec</div>
          <div style={{ marginTop: 3, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, fontWeight: 750 }}>Exact Xero invoice items are the source of truth.</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {xeroInvoiceNumber && (
            <button
              type="button"
              onClick={() => setShowInvoiceDetails((current) => !current)}
              style={{ border: "1px solid rgba(110,138,106,0.22)", background: showInvoiceDetails ? "rgba(110,138,106,0.14)" : "rgba(255,255,255,0.68)", color: DT.sage, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: "pointer" }}
            >
              {showInvoiceDetails ? "Hide invoice details" : "View invoice details"}
            </button>
          )}
          {xeroSourceUrl && (
            <a href={xeroSourceUrl} target="_blank" rel="noreferrer" style={{ border: "1px solid rgba(12,124,122,0.18)", background: "rgba(255,255,255,0.74)", color: DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, textDecoration: "none" }}>
              Open Xero
            </a>
          )}
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ border: `1px solid ${paymentTone.border}`, background: paymentTone.bg, color: paymentTone.color, borderRadius: 999, padding: "4px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950 }}>
          Xero: {paymentLabel}
        </span>
        {xeroInvoiceNumber && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>From {xeroInvoiceNumber}</span>}
        {xeroProof.invoice?.dueDate && <span style={{ fontFamily: DT.sans, fontSize: 10, fontWeight: 850, color: DT.textMuted }}>Invoice due {formatShortDate(xeroProof.invoice.dueDate)}</span>}
      </div>
      {onInvoiceNumberChange && (
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: prominent ? "minmax(0, 1fr) auto" : "1fr", gap: 6, alignItems: "center" }}>
          <input
            value={invoiceDraft}
            onChange={(event) => setInvoiceDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveInvoiceDraft();
              }
            }}
            placeholder="Xero invoice number, e.g. INV-1123"
            style={{ minWidth: 0, border: `1px solid ${DT.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: DT.sans, fontSize: 11, color: DT.textPrimary, background: DT.cardBg }}
          />
          <button
            type="button"
            onClick={saveInvoiceDraft}
            disabled={(invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "")}
            style={{ border: `1px solid rgba(110,138,106,0.24)`, background: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? "rgba(0,0,0,0.035)" : "rgba(110,138,106,0.13)", color: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? DT.textFaint : DT.sage, borderRadius: 999, padding: "7px 10px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: (invoiceDraft.trim().toUpperCase() || "") === (xeroInvoiceNumber || "") ? "not-allowed" : "pointer" }}
          >
            Save Xero link
          </button>
        </div>
      )}
      {showInvoiceDetails && xeroInvoiceNumber && (
        <div style={{ marginTop: 10, border: `1px solid rgba(110,138,106,0.20)`, borderRadius: 10, background: "rgba(255,255,255,0.72)", overflow: "hidden" }}>
          <div style={{ padding: "8px 9px", display: "grid", gridTemplateColumns: prominent ? "repeat(auto-fit, minmax(118px, 1fr))" : "1fr 1fr", gap: 6, borderBottom: `1px solid ${DT.border}` }}>
            <MiniFact label="Invoice" value={xeroProof.invoice?.invoiceNumber || xeroInvoiceNumber} />
            <MiniFact label="Contact" value={xeroProof.invoice?.contact || "Checking Xero"} />
            <MiniFact label="Status" value={xeroProof.invoice?.status || paymentLabel} />
            <MiniFact label="Total" value={formatXeroMoney(xeroProof.invoice?.total)} />
            <MiniFact label="Paid" value={formatXeroMoney(xeroProof.invoice?.amountPaid)} />
            <MiniFact label="Owing" value={formatXeroMoney(xeroProof.invoice?.amountDue)} />
          </div>
          <div style={{ padding: "8px 9px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Invoice items</div>
              <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 800, color: DT.textMuted }}>{lineItems.length} line item{lineItems.length === 1 ? "" : "s"}</div>
            </div>
            <div style={{ marginTop: 6, display: "grid", gap: 6, maxHeight: prominent ? 310 : 200, overflowY: "auto", paddingRight: 3 }}>
              {xeroProof.loading && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>Loading invoice details...</div>}
              {!xeroProof.loading && lineItems.map((line, index) => (
                <div key={`${index}-${line.description.slice(0, 24)}`} style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, borderRadius: 8, padding: "7px 8px", display: "grid", gridTemplateColumns: prominent ? "minmax(0, 1fr) 58px 72px 82px" : "1fr", gap: prominent ? 8 : 5, alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: DT.sans, fontSize: 11, lineHeight: 1.35, color: DT.textPrimary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{line.description}</div>
                  </div>
                  <MiniFact label="Qty" value={formatXeroQuantity(line.quantity)} />
                  <MiniFact label="Unit" value={formatXeroMoney(line.unitAmount)} />
                  <MiniFact label="Line" value={formatXeroMoney(line.lineAmount)} />
                </div>
              ))}
              {!xeroProof.loading && lineItems.length === 0 && <div style={{ fontFamily: DT.sans, fontSize: 11, color: DT.textMuted }}>No line item text returned from Xero yet.</div>}
            </div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: prominent ? "repeat(auto-fit, minmax(170px, 1fr))" : "1fr", gap: prominent ? 8 : 0 }}>
        {logistics.map((detail) => (
          <div key={detail.label} style={{ borderTop: prominent ? "none" : `1px solid ${DT.border}`, border: prominent ? `1px solid ${DT.border}` : undefined, background: prominent ? "rgba(255,255,255,0.62)" : undefined, borderRadius: prominent ? 9 : undefined, padding: prominent ? "8px 9px" : "5px 0" }}>
            <div style={{ fontFamily: DT.sans, fontSize: 8, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.06em", color: DT.textFaint }}>{detail.label}</div>
            <div style={{ marginTop: prominent ? 3 : 0, fontFamily: DT.sans, fontSize: prominent ? 12 : 11, fontWeight: 850, color: DT.textPrimary, lineHeight: 1.28 }}>{detail.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 7, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted, lineHeight: 1.3 }}>
        {xeroProof.invoice ? "Tuesday is reading these details directly from Xero. Use Open Xero only when you need the original invoice screen." : xeroInvoiceNumber ? "No Xero invoice text found yet; keep checking the source invoice." : "Add the Xero invoice number to unlock exact invoice items here."}
      </div>
      {xeroProof.error && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: "#922a23", lineHeight: 1.3 }}>{xeroProof.error}</div>}
    </div>
  );
}
function OrderPhotoTray({ orderId }: { orderId: number }) {
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [status, setStatus] = useState<string>("");
  const [disabledReason, setDisabledReason] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/production/order-photos?orderId=${orderId}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Photo store unavailable")))
      .then((data: { photos?: OrderPhoto[]; disabledReason?: string }) => {
        if (!cancelled) {
          setPhotos(data.photos ?? []);
          setDisabledReason(data.disabledReason ?? "");
        }
      })
      .catch((err) => {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Photo store unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);


  async function deletePhoto(photo: OrderPhoto) {
    setStatus("Deleting photo...");
    const params = new URLSearchParams({ orderId: String(orderId), pathname: photo.pathname });
    const response = await fetch(`/api/production/order-photos?${params.toString()}`, { method: "DELETE" });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(data?.error || "Delete failed");
    setPhotos((current) => current.filter((item) => item.pathname !== photo.pathname));
    setStatus("Photo deleted");
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("orderId", String(orderId));
    form.append("file", file);
    setStatus("Uploading photo...");
    const response = await fetch("/api/production/order-photos", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Upload failed");
    setPhotos((current) => [data.photo as OrderPhoto, ...current]);
    setStatus("Photo uploaded");
  }

  return (
    <div style={{ marginTop: 8, border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.66)", borderRadius: 9, padding: "8px 9px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontFamily: DT.sans, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: DT.textFaint }}>Order photos</div>
        <label style={{ border: `1px solid rgba(12,124,122,0.18)`, background: disabledReason ? "rgba(0,0,0,0.035)" : DT.tealSoft, color: disabledReason ? DT.textFaint : DT.teal, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, fontSize: 10, fontWeight: 950, cursor: disabledReason ? "not-allowed" : "pointer" }}>
          Upload
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={Boolean(disabledReason)}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.currentTarget.value = "";
              Promise.all(files.map(uploadPhoto)).catch((err) => setStatus(err instanceof Error ? err.message : "Upload failed"));
            }}
            style={{ display: "none" }}
          />
        </label>
      </div>
      {(status || disabledReason) && <div style={{ marginTop: 5, fontFamily: DT.sans, fontSize: 10, color: DT.textMuted }}>{status || disabledReason}</div>}
      <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5 }}>
        {photos.map((photo) => (
          <div key={photo.pathname} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden", border: `1px solid ${DT.border}`, background: DT.cardBg }}>
            <a href={photo.url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="Order upload" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </a>
            <button
              type="button"
              onClick={() => deletePhoto(photo).catch((err) => setStatus(err instanceof Error ? err.message : "Delete failed"))}
              style={{ position: "absolute", right: 4, top: 4, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,253,249,0.92)", color: DT.textMuted, borderRadius: 999, width: 20, height: 20, fontFamily: DT.sans, fontSize: 11, fontWeight: 950, cursor: "pointer", lineHeight: "18px" }}
              aria-label="Delete photo"
              title="Delete photo"
            >
              x
            </button>
          </div>
        ))}
        {photos.length === 0 && <div style={{ gridColumn: "1 / -1", fontFamily: DT.sans, fontSize: 11, color: DT.textMuted, lineHeight: 1.3 }}>No photos yet.</div>}
      </div>
    </div>
  );
}

function hasDayAssignments(row: PlanRow): boolean {
  return DAYS.some((d) => PEOPLE.some((p) => row.dayTasks[d][p]));
}

function isArchiveWeek(title: string): boolean {
  return title.toLowerCase().includes("done") || title.toLowerCase().includes("dust");
}


type FeedbackLabel = "Useful" | "Check" | "Add detail" | "Workshop input" | "Decision needed" | "Better wording";
const FEEDBACK_LABELS: FeedbackLabel[] = ["Useful", "Check", "Add detail", "Workshop input", "Decision needed", "Better wording"];

function feedbackStorageKey(scope: string, id: string | number) {
  return `tuesday:feedback:${scope}:${id}`;
}

function useIsNarrow(breakpoint = 760) {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < breakpoint);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [breakpoint]);
  return isNarrow;
}

function FeedbackButtons({ scope, id }: { scope: string; id: string | number }) {
  const key = feedbackStorageKey(scope, id);
  const [selected, setSelected] = useState<FeedbackLabel[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(window.localStorage.getItem(key) || "[]") as FeedbackLabel[];
    } catch {
      return [];
    }
  });
  function toggle(label: FeedbackLabel) {
    const next = selected.includes(label) ? selected.filter((x) => x !== label) : [...selected, label];
    setSelected(next);
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(next));
  }
  return (
    <details style={{ maxWidth: "100%" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", color: DT.textMuted, fontSize: 10, fontFamily: DT.sans, fontWeight: 850 }}>
        Local feedback{selected.length ? ` · ${selected.length}` : ""}
      </summary>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }} aria-label="Local Production Plan feedback">
        {FEEDBACK_LABELS.map((label) => {
          const active = selected.includes(label);
          return (
            <button key={label} type="button" onClick={() => toggle(label)} style={{ border: `1px solid ${active ? "rgba(79,95,168,0.30)" : "rgba(0,0,0,0.07)"}`, background: active ? DT.tealSoft : DT.cardBg, color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "3px 7px", fontSize: 9, fontFamily: DT.sans, fontWeight: 800, cursor: "pointer" }}>
              {active ? "✓ " : ""}{label}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function displayWeekTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  const match = trimmed.match(/^([A-Za-z]+)\s*[-–]?\s*(.+)$/);
  if (!match || !/\d/.test(match[2])) return trimmed;
  const month = match[1];
  let range = match[2]
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, "$1")
    .replace(/^[-–]\s*/, "")
    .replace(/\s*[-–]\s*/g, "–")
    .trim();
  const days = range.match(/^(\d+)–(\d+)$/);
  if (days) {
    const start = Number(days[1]);
    const end = Number(days[2]);
    if (end - start === 3) {
      const mi = monthIndex(month);
      if (mi >= 0) {
        const friday = new Date(new Date().getFullYear(), mi, start + 4);
        const fridayMonth = friday.toLocaleString("en-NZ", { month: "long" });
        range = fridayMonth === month ? `${start}–${friday.getDate()}` : `${start}–${fridayMonth} ${friday.getDate()}`;
      }
    }
  }
  return `${month} ${range}`;
}

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function nzWorkshopNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

function planningVisibleStart(now = new Date()) {
  const nzNow = nzWorkshopNow(now);
  const start = weekStart(nzNow);
  const day = nzNow.getDay();
  const afterFridayCutoff = day === 5 && nzNow.getHours() >= 18;
  const weekend = day === 0 || day === 6;
  if (afterFridayCutoff || weekend) start.setDate(start.getDate() + 7);
  return start;
}

function monthIndex(name: string) {
  const key = name.toLowerCase().slice(0, 3);
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
}

function weekRangeFromTitle(title: string, now = new Date()) {
  const normalized = displayWeekTitle(title).replace(/\u2013/g, "-");
  const match = normalized.trim().match(/^([A-Za-z]+)\s+(\d+)(?:\D+(?:([A-Za-z]+)\s+)?(\d+))?/);
  if (!match) return null;
  const month = monthIndex(match[1]);
  if (month < 0) return null;
  const year = nzWorkshopNow(now).getFullYear();
  const startDay = Number(match[2]);
  const endMonth = match[3] ? monthIndex(match[3]) : month;
  let endMonthIndex = endMonth >= 0 ? endMonth : month;
  const endDay = Number(match[4] ?? startDay + 4);
  if (!match[3] && endDay < startDay) endMonthIndex = month === 11 ? 0 : month + 1;
  const endYear = month === 11 && endMonthIndex === 0 ? year + 1 : year;
  const start = new Date(year, month, startDay);
  const end = new Date(endYear, endMonthIndex, endDay);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

type PlanWeek = { id: string; title: string; rows: PlanRow[] };

function weekStartTime(week: PlanWeek, now = new Date()): number {
  return weekRangeFromTitle(week.title, now)?.start.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function weekEndTime(week: PlanWeek, now = new Date()): number {
  return weekRangeFromTitle(week.title, now)?.end.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function splitPlanWeeks(weeks: PlanWeek[], now = new Date()) {
  const visibleStart = planningVisibleStart(now);
  const sorted = [...weeks].sort((a, b) => weekStartTime(a, now) - weekStartTime(b, now));
  const previous = sorted.filter((week) => weekEndTime(week, now) < visibleStart.getTime()).reverse();
  const currentAndUpcoming = sorted.filter((week) => weekEndTime(week, now) >= visibleStart.getTime()).slice(0, 9);
  return { currentAndUpcoming, previous };
}

function monthTaskCount(rows: PlanRow[]): number {
  return rows.reduce(
    (count, row) =>
      count + DAYS.reduce(
        (dayCount, day) => dayCount + PEOPLE.filter((person) => row.dayTasks[day][person]).length,
        0
      ),
    0
  );
}

function planTaskFingerprint(value: string) {
  const normalized = normalizeOrderText(value).slice(0, 80);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function planTaskLinkKey(task: Pick<DraggablePlanTask, "rowId" | "text">) {
  return `plan-task:${task.rowId}:${planTaskFingerprint(task.text)}`;
}

function sourceTasksForWeek(rows: PlanRow[]): DraggablePlanTask[] {
  return rows.flatMap((row) =>
    DAYS.flatMap((day) =>
      PEOPLE.flatMap((person) => {
        const text = row.dayTasks[day][person];
        return text
          ? [{
              id: `${row.id}:${day}:${person}`,
              rowId: row.id,
              rowName: row.name,
              rowNotes: row.notes,
              day,
              person,
              text,
              linkedOrderIds: row.linkedOrders.map((linked) => Number(linked.mondayItemId)).filter((id) => Number.isFinite(id)),
              linkedOrders: row.linkedOrders,
            }]
          : [];
      })
    )
  );
}

function loadDraftTasks(weekId: string, sourceTasks: DraggablePlanTask[]) {
  void weekId;
  return sourceTasks;
}

function saveDraftTasks(weekId: string, tasks: DraggablePlanTask[]) {
  void weekId;
  void tasks;
}

function LinkedOrderPill({ row, onOpenOrder }: { row: PlanRow; onOpenOrder?: (orderId: number) => void }) {
  if (row.linkedOrders.length === 0) return null;
  const linked = row.appLinkedOrder;
  if (linked && onOpenOrder) {
    return (
      <button
        type="button"
        onClick={() => onOpenOrder(Number(linked.mondayItemId))}
        title={`Open ${linked.name} in the Production Plan order overview`}
        style={{
          fontSize: 10,
          color: DT.teal,
          background: DT.tealSoft,
          border: "1px solid rgba(12,124,122,0.16)",
          borderRadius: 4,
          padding: "2px 6px",
          fontFamily: DT.sans,
          fontWeight: 850,
          cursor: "pointer",
        }}
      >
        Open job: {linked.name}
      </button>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: DT.textMuted,
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.04)",
        borderRadius: 4,
        padding: "2px 6px",
        fontFamily: DT.sans,
        fontStyle: "italic",
        lineHeight: 1.25,
        whiteSpace: "normal",
      }}
      title={row.linkedOrders.map((l) => `${l.name} (${l.boardName})`).join("\n")}
    >
      Linked: {row.linkedOrders.map((l) => l.name).join(" · ")}
    </span>
  );
}
function DayPills({ row }: { row: PlanRow }) {
  if (!hasDayAssignments(row)) {
    return (
      <span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans, fontStyle: "italic" }}>
        no day assignments
      </span>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {DAYS.flatMap((day) =>
        PEOPLE.map((person) => {
          const text = row.dayTasks[day][person];
          if (!text) return null;
          const isToday = text.toLowerCase() === "today";
          return (
            <span
              key={`${day}-${person}`}
              style={{
                fontSize: 10,
                fontFamily: DT.sans,
                background: DT.cardBg,
                border: `1px solid ${DT.border}`,
                borderRadius: 4,
                padding: "2px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontStyle: isToday ? "italic" : "normal",
                color: isToday ? DT.textFaint : DT.textSecondary,
              }}
            >
              <span style={{ fontWeight: 700, color: DT.textFaint, fontSize: 9 }}>
                {DAY_LABELS[day]} {PERSON_SHORT[person]}
              </span>
              <span>{text}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

function NewOrderHalo({
  order,
  suggestions,
  open,
  approved,
  showingInMonth,
  onStepChange,
  onShowInMonth,
  onApprove,
  onClose,
  capacityByLane,
}: {
  order: NewOrderPlanCandidate | null;
  suggestions: SuggestedOrderPlanStep[];
  open: boolean;
  approved: boolean;
  showingInMonth: boolean;
  onStepChange: (id: string, patch: Partial<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours">>) => void;
  onShowInMonth: () => void;
  onApprove: () => void;
  onClose: () => void;
  capacityByLane: CapacityByLane;
}) {
  const isNarrow = useIsNarrow();
  if (!order) return null;
  const detailCards = [
    ["Customer", order.customer],
    ["Item", order.rawMondayItem ?? order.product],
    ["Date ordered", formatOrderedDate(order.orderedDate)],
    ["Due date", order.shipDate ? formatOrderedDate(order.shipDate) : "No date yet"],
    ["Value", order.value ? `$${Math.round(order.value).toLocaleString("en-NZ")}` : "Value missing"],
    ["Status", order.rawMondayStatus ?? order.status],
    ["Hours", `${suggestions.reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0)}h draft`],
  ];
  return (
    <>
      {open && (
        <section style={{ border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 12, background: `linear-gradient(135deg, ${newOrderPalette.clayPanel} 0%, ${newOrderPalette.clayBg} 100%)`, boxShadow: `0 1px 8px ${newOrderPalette.clayGlow}`, padding: 12 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase", color: newOrderPalette.clayAccentDark, fontFamily: DT.sans }}>Suggested task list</div>
                <h3 style={{ margin: "3px 0 0", fontFamily: DT.serif, color: DT.textPrimary, fontSize: 18, letterSpacing: "-0.03em" }}>{order.customer}</h3>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <Chip label={order.rawMondayStatus ?? order.status} tone="amber" />
                  <Chip label={order.rawMondayItem ?? order.product} tone="teal" />
                  <Chip label={approved ? "Approved plan" : "Suggested plan"} tone={approved ? "amber" : "grey"} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", color: DT.textMuted, borderRadius: 999, padding: "8px 13px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Hide full list
                </button>
                <button
                  type="button"
                  onClick={onShowInMonth}
                  style={{ border: `1px solid ${newOrderPalette.clayBorderStrong}`, background: showingInMonth ? DT.goldSoft : "rgba(255,255,255,0.74)", color: newOrderPalette.clayAccentDark, borderRadius: 999, padding: "8px 13px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {showingInMonth ? "Hide tasks from schedule" : "Show tasks in schedule"}
                </button>
                <button
                  type="button"
                  onClick={onApprove}
                  style={{ border: `1px solid ${newOrderPalette.clayBorderStrong}`, background: newOrderPalette.clayAccent, color: "white", borderRadius: 999, padding: "8px 13px", fontFamily: DT.sans, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Approve tasks to month view
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "repeat(2, minmax(0, 1fr))" : "repeat(8, minmax(0, 1fr))", gap: 6 }}>
              {detailCards.map(([label, value]) => (
                <div key={label} style={{ padding: "7px 8px", borderRadius: 9, border: `1px solid ${newOrderPalette.clayBorder}`, background: "rgba(255,255,255,0.52)" }}>
                  <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: DT.textFaint }}>{label}</div>
                  <div style={{ marginTop: 3, fontSize: 11, lineHeight: 1.35, color: DT.textPrimary, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
              {order.xero && (
                <a href={order.xero} target="_blank" rel="noreferrer" style={{ padding: "7px 8px", borderRadius: 9, border: `1px solid ${newOrderPalette.clayBorder}`, background: "rgba(255,255,255,0.56)", color: DT.teal, textDecoration: "none", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center" }}>
                  Xero invoice
                </a>
              )}
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: newOrderPalette.clayAccentDark }}>Editable task suggestions</div>
              <div style={{ display: "grid", gap: 6, marginTop: 7 }}>
                {suggestions.map((step, index) => (
                  <div key={step.id} style={{ display: "grid", gridTemplateColumns: isNarrow ? "24px minmax(0, 1fr)" : "24px minmax(180px, 1.5fr) minmax(104px, 0.7fr) minmax(110px, 0.7fr) 70px minmax(140px, 0.9fr)", gap: 6, alignItems: "center", padding: 7, borderRadius: 9, border: `1px solid ${newOrderPalette.clayBorderStrong}`, borderLeft: `4px solid ${newOrderPalette.clayStripe}`, background: newOrderPalette.clayTaskBg }}>
                    <div style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.70)", color: newOrderPalette.clayAccentDark, fontSize: 10, fontWeight: 900 }}>{index + 1}</div>
                    <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "subgrid", gridColumn: isNarrow ? undefined : "2 / -1", gap: 7, alignItems: "center" }}>
                      <input
                        aria-label={`Step ${index + 1} title`}
                        value={step.title}
                        onChange={(event) => onStepChange(step.id, { title: event.target.value })}
                      style={{ width: "100%", minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", color: DT.textPrimary, fontSize: 12, fontWeight: 850, fontFamily: DT.sans, background: "rgba(255,255,255,0.82)" }}
                      />
                        <select aria-label={`Step ${index + 1} day`} value={step.day} onChange={(event) => onStepChange(step.id, { day: event.target.value as DayKey })} style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}>
                          {DAYS.map((day) => <option key={day} value={day}>{DAY_LABELS[day]} {step.day === day ? step.dateLabel : ""}</option>)}
                        </select>
                        <select aria-label={`Step ${index + 1} owner`} value={step.person} onChange={(event) => onStepChange(step.id, { person: event.target.value as Person })} style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}>
                          {PEOPLE.map((person) => <option key={person} value={person}>{PERSON_LABELS[person]}</option>)}
                        </select>
                        <input
                          aria-label={`Step ${index + 1} estimated hours`}
                          type="number"
                          min="0"
                          step="0.5"
                          value={step.estimatedHours}
                          onChange={(event) => onStepChange(step.id, { estimatedHours: Number(event.target.value) })}
                        style={{ minWidth: 0, border: `1px solid ${newOrderPalette.clayBorder}`, borderRadius: 7, padding: "6px 8px", fontSize: 11, color: DT.textMuted, background: "rgba(255,255,255,0.82)" }}
                        />
                      {(() => {
                        const capacity = capacityByLane[laneCapacityKey(step.day, step.person)];
                        if (!capacity) return null;
                        const style = CAPACITY_STYLES[capacity.status];
                        return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, border: `1px solid ${style.border}`, background: style.bg, borderRadius: 8, padding: "6px 7px", fontSize: 10, color: style.color, fontWeight: 850, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{DAY_LABELS[step.day]} {PERSON_LABELS[step.person]}</span>
                          <span style={{ whiteSpace: "nowrap" }}>{style.label} · {capacity.label}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function PlanRowCard({ row, onOpenOrder }: { row: PlanRow; onOpenOrder?: (orderId: number) => void }) {
  return (
    <div
      style={{
        background: DT.cardBg,
        border: `1px solid ${DT.border}`,
        borderRadius: DT.radius,
        padding: "11px 14px",
        boxShadow: DT.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: DT.textPrimary,
            fontFamily: DT.sans,
          }}
        >
          {row.name}
        </span>
        <LinkedOrderPill row={row} onOpenOrder={onOpenOrder} />
      </div>
      <DayPills row={row} />
      {row.notes && (
        <p
          style={{
            fontSize: 12,
            color: DT.textSecondary,
            lineHeight: 1.5,
            margin: 0,
            fontFamily: DT.sans,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.015)",
            borderRadius: 6,
          }}
        >
          {row.notes}
        </p>
      )}
      <div style={{ paddingTop: 7, borderTop: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: DT.textFaint, fontFamily: DT.sans }}>Plan row · check the order details before changing production truth</span>
        <FeedbackButtons scope="plan" id={row.id} />
      </div>
    </div>
  );
}

function WeekSection({
  title,
  rows,
  defaultOpen,
}: {
  title: string;
  rows: PlanRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: 18 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "7px 0",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: DT.textPrimary,
            fontFamily: DT.serif,
            letterSpacing: "-0.01em",
          }}
        >
          {displayWeekTitle(title)}
        </span>
        <span
          style={{
            fontSize: 10,
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontWeight: 500,
          }}
        >
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.04)" }} />
        <span
          style={{
            fontSize: 12,
            color: DT.textFaint,
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))",
            gap: 9,
          }}
        >
          {rows.map((r) => (
            <PlanRowCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function WeekView({ rows, weekTitle }: { rows: PlanRow[]; weekTitle: string }) {
  const weekGrid = useMemo(() => derivePlanWeek(rows), [rows]);
  const anyTasks = DAYS.some((d) =>
    PEOPLE.some((p) => weekGrid[d][p].length > 0)
  );

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: DT.textFaint,
          fontFamily: DT.sans,
          marginBottom: 10,
        }}
      >
        Week for {displayWeekTitle(weekTitle)} · {rows.length} row{rows.length === 1 ? "" : "s"} ·
        tasks derived from day-columns (empty day/workshop lanes are hidden only when completely empty)
      </div>
      {!anyTasks && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: DT.textFaint,
            fontFamily: DT.sans,
            fontSize: 13,
          }}
        >
          No day-column assignments for this week.
        </div>
      )}
      {anyTasks && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 1fr",
            gap: 3,
          }}
        >
          <div />
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.nick}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: DT.textFaint,
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: DT.sans,
              padding: "4px 0",
            }}
          >
            {PERSON_LABELS.dylan}
          </div>
          {DAYS.map((day) => (
            <WeekRow key={day} day={day} weekGrid={weekGrid} />
          ))}
        </div>
      )}
    </div>
  );
}
void WeekSection;
void WeekView;

function WeekRow({
  day,
  weekGrid,
}: {
  day: DayKey;
  weekGrid: ReturnType<typeof derivePlanWeek>;
}) {
  return (
    <>
      <div style={{ paddingTop: 6 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: DT.textMuted,
            fontFamily: DT.sans,
          }}
        >
          {DAY_LABELS[day]}
        </div>
      </div>
      {PEOPLE.map((person) => (
        <div
          key={person}
          style={{
            background: DT.cardBg,
            borderRadius: 6,
            border: `1px solid ${DT.border}`,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 3,
            minHeight: 28,
          }}
        >
          {weekGrid[day][person].map((t, i) => {
            const isToday = t.text.toLowerCase() === "today";
            return (
              <div
                key={`${t.sourceRowId}-${i}`}
                style={{
                  display: "block",
                  padding: "4px 6px",
                  borderRadius: 4,
                  background: "rgba(12,124,122,0.05)",
                  border: `1px solid ${DT.border}`,
                  textDecoration: "none",
                  color: DT.textPrimary,
                  fontFamily: DT.sans,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.3,
                    fontStyle: isToday ? "italic" : "normal",
                    color: isToday ? DT.textFaint : DT.textPrimary,
                  }}
                >
                  {t.text}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: DT.textFaint,
                    marginTop: 1,
                  }}
                >
                  {t.sourceRowName}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}


function shouldInsertAfterOver(event: Pick<DragOverEvent, "active" | "over">) {
  const overRect = event.over?.rect;
  const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial;
  if (!overRect || !activeRect) return false;
  return activeRect.top + activeRect.height / 2 > overRect.top + overRect.height / 2;
}

function PlanTaskDragCard({ task }: { task: DraggablePlanTask }) {
  return (
    <div style={{ width: 220, maxWidth: "min(260px, 70vw)", pointerEvents: "none", border: "1px solid rgba(110,138,106,0.36)", borderLeft: "4px solid #6e8a6a", background: "rgba(255,253,249,0.98)", borderRadius: 8, padding: "7px 8px", boxShadow: "0 14px 34px rgba(34,32,26,0.20)", fontFamily: DT.sans }}>
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: DT.textPrimary, lineHeight: 1.18, overflowWrap: "anywhere" }}>{task.text}</div>
          <div style={{ marginTop: 3, fontSize: 10, fontWeight: 750, color: DT.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.rowName}</div>
        </div>
        <span style={{ flex: "0 0 auto", border: "1px solid rgba(110,138,106,0.22)", background: "rgba(110,138,106,0.09)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontSize: 9, fontWeight: 950 }}>1h</span>
      </div>
    </div>
  );
}

function SortablePlanTaskCard({
  task,
  selectedOrder,
  planTaskLinks,
  resolveTaskOrderId,
  onTaskSelect,
  isNextTask = false,
}: {
  task: DraggablePlanTask;
  selectedOrder?: UiOrder | null;
  planTaskLinks: PlanTaskLinks;
  resolveTaskOrderId?: (task: DraggablePlanTask) => number | null;
  onTaskSelect?: (task: DraggablePlanTask) => void;
  isNextTask?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "plan-task" },
  });
  const resolvedOrderId = resolveTaskOrderId?.(task) ?? null;
  const effectiveOrderIds = resolvedOrderId ? [resolvedOrderId] : effectiveTaskOrderIds(task, planTaskLinks);
  const assignedOrderId = assignedOrderIdForTask(task, planTaskLinks);
  const isSelectedOrderTask = selectedOrder ? effectiveOrderIds.includes(selectedOrder.id) || planTaskMatchesOrder(task, selectedOrder) : false;
  const isUnlinkedTask = effectiveOrderIds.length === 0;
  const taskBackground = isSelectedOrderTask
    ? "linear-gradient(135deg, rgba(12,124,122,0.17), rgba(255,255,255,0.88))"
    : isNextTask && !isUnlinkedTask
      ? "linear-gradient(135deg, rgba(255,253,249,0.98), rgba(110,138,106,0.12))"
      : isUnlinkedTask
        ? "linear-gradient(135deg, rgba(255,255,255,0.90), rgba(232,230,224,0.52))"
        : task.person === "nick"
          ? "rgba(255,253,249,0.90)"
          : "rgba(247,251,250,0.88)";
  const taskBorder = isSelectedOrderTask
    ? "rgba(12,124,122,0.55)"
    : isNextTask && !isUnlinkedTask
      ? "rgba(110,138,106,0.30)"
      : isUnlinkedTask
        ? "rgba(125,122,115,0.24)"
        : "rgba(0,0,0,0.075)";
  const taskStripe = isSelectedOrderTask ? DT.teal : isUnlinkedTask ? "#aaa49b" : isNextTask ? DT.sage : undefined;
  const taskShadow = isDragging
    ? "0 0 0 2px rgba(110,138,106,0.12)"
    : isSelectedOrderTask
      ? "0 0 0 3px rgba(12,124,122,0.10), 0 5px 14px rgba(12,124,122,0.10)"
      : isNextTask && !isUnlinkedTask
        ? "0 2px 8px rgba(110,138,106,0.08)"
        : "0 1px 2px rgba(0,0,0,0.025)";
  const taskBadge = isUnlinkedTask ? "Assign" : isSelectedOrderTask ? "Selected" : assignedOrderId ? "Linked" : null;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-plan-task-id={task.id}
      role="button"
      tabIndex={0}
      onClick={() => onTaskSelect?.(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onTaskSelect?.(task);
        }
      }}
      title="Drag to reorder or move to another day or lane"
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        textDecoration: "none",
        color: isUnlinkedTask ? "#4f4b46" : DT.textPrimary,
        background: taskBackground,
        border: `1px ${isUnlinkedTask ? "dashed" : "solid"} ${taskBorder}`,
        borderLeft: taskStripe ? `4px solid ${taskStripe}` : undefined,
        borderRadius: 8,
        padding: isNextTask ? "7px 7px" : "5px 6px",
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.28 : 1,
        boxShadow: taskShadow,
        outline: "none",
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 180ms ease, opacity 120ms ease, box-shadow 120ms ease",
        touchAction: "none",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          {isNextTask && !isUnlinkedTask && (
            <span style={{ display: "inline-flex", marginBottom: 4, border: "1px solid rgba(110,138,106,0.22)", background: "rgba(110,138,106,0.10)", color: DT.sage, borderRadius: 999, padding: "1px 6px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950 }}>Start here</span>
          )}
          <div style={{ fontSize: isNextTask ? 12.5 : 12, fontFamily: DT.sans, fontWeight: isUnlinkedTask ? 780 : 920, lineHeight: 1.18, overflowWrap: "anywhere" }}>{task.text}</div>
          <div style={{ marginTop: 3, fontSize: 10, color: isUnlinkedTask ? "#8d8880" : DT.textMuted, fontFamily: DT.sans, fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.rowName}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
          <span style={{ border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>1h</span>
          {taskBadge && (
            <span style={{ color: isUnlinkedTask ? "#7d7a73" : DT.teal, background: isUnlinkedTask ? "rgba(125,122,115,0.08)" : DT.tealSoft, border: `1px solid ${isUnlinkedTask ? "rgba(125,122,115,0.16)" : "rgba(12,124,122,0.14)"}`, borderRadius: 999, padding: "1px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap" }}>{taskBadge}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DroppablePlanLane({
  id,
  day,
  person,
  items,
  isTodayColumn,
  isDropTarget,
  capacity,
  children,
}: {
  id: string;
  day: DayKey;
  person: Person;
  items: string[];
  isTodayColumn: boolean;
  isDropTarget: boolean;
  capacity: LaneCapacitySummary;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id, data: { type: "plan-lane", day, person } });
  const capacityStyle = CAPACITY_STYLES[capacity.status];
  const capacityText = capacity.status === "ok" ? capacity.label : `${capacityStyle.label} · ${capacity.label}`;
  return (
    <div
      ref={setNodeRef}
      style={{ minHeight: 54, minWidth: 0, overflow: "hidden", padding: 5, borderRadius: 9, border: `1px dashed ${isDropTarget ? "rgba(110,138,106,0.62)" : isTodayColumn ? "rgba(12,124,122,0.34)" : "rgba(0,0,0,0.09)"}`, background: isDropTarget ? "rgba(110,138,106,0.085)" : isTodayColumn ? "rgba(12,124,122,0.045)" : "rgba(255,255,255,0.34)", transition: "background 160ms ease, border-color 160ms ease" }}
    >
      <div style={{ marginBottom: 5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 9, color: person === "nick" ? "#8a6d3b" : DT.teal, fontFamily: DT.sans, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{PERSON_LABELS[person]}</span>
        <span title={capacity.detail} style={{ border: `1px solid ${capacityStyle.border}`, background: capacityStyle.bg, color: capacityStyle.color, borderRadius: 999, padding: "2px 5px", fontSize: 8, fontFamily: DT.sans, fontWeight: 950, lineHeight: 1, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {capacityText}
        </span>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>{children}</div>
      </SortableContext>
    </div>
  );
}

function MonthWeekSection({
  week,
  suggestedSteps = [],
  approvedSuggestions = false,
  selectedOrder = null,
  appTasks = [],
  planTaskLinks = {},
  resolveTaskOrderId,
  onTaskSelect,
  onAppTaskSelect,
  personFilter = "all",
  weekHeaderControl,
}: {
  week: PlanWeek;
  suggestedSteps?: SuggestedOrderPlanStep[];
  approvedSuggestions?: boolean;
  selectedOrder?: UiOrder | null;
  appTasks?: AppPlanTask[];
  planTaskLinks?: PlanTaskLinks;
  resolveTaskOrderId?: (task: DraggablePlanTask) => number | null;
  onTaskSelect?: (task: DraggablePlanTask) => void;
  onAppTaskSelect?: (task: AppPlanTask) => void;
  personFilter?: PersonFilter;
  weekHeaderControl?: ReactNode;
}) {
  const sourceTasks = useMemo(() => sourceTasksForWeek(week.rows), [week.rows]);
  const weekAppTasks = useMemo(() => appTasks.filter((task) => appTaskFallsInWeek(task, week)), [appTasks, week]);
  const isNarrow = useIsNarrow();
  const visiblePeople = personFilter === "all" ? PEOPLE : [personFilter];
  const [showFriday, setShowFriday] = useState(false);
  const visibleDays = showFriday ? DAYS : DAYS.filter((day) => day !== "friday");
  const todayKey = currentDayKey();
  const weekRange = weekRangeFromTitle(week.title);
  const now = new Date();
  const visibleStart = planningVisibleStart(now);
  const isCurrentWeek = Boolean(weekRange && weekRange.start.getTime() === visibleStart.getTime());
  const [tasks, setTasks] = useState<DraggablePlanTask[]>(() => loadDraftTasks(week.id, sourceTasks));
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ day: DayKey; person: Person; overTaskId?: string; insertAfter?: boolean } | null>(null);
  const undoLayoutsRef = useRef<DraggablePlanTask[][]>([]);
  const dragStartTasksRef = useRef<DraggablePlanTask[] | null>(null);
  const lastPreviewRef = useRef<string | null>(null);
  const visibleTaskCount = monthTaskCount(week.rows);
  const hasVisibleTasks = visibleTaskCount > 0 || weekAppTasks.length > 0;
  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) ?? null : null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const isDraftChanged = tasks.some((task, index) => {
    const original = sourceTasks.find((source) => source.id === task.id);
    return original && (original.day !== task.day || original.person !== task.person || sourceTasks[index]?.id !== task.id);
  });

  function previewTaskMove(event: DragOverEvent) {
    const overId = event.over?.id ? String(event.over.id) : null;
    const taskId = String(event.active.id);
    if (!overId) return;

    const target = dropTargetFromOverId(tasks, overId);
    if (!target) return;

    const insertAfter = target.overTaskId ? shouldInsertAfterOver(event) : true;
    const previewKey = [taskId, target.day, target.person, target.overTaskId ?? "lane", insertAfter ? "after" : "before"].join(":");
    if (lastPreviewRef.current === previewKey) return;

    lastPreviewRef.current = previewKey;
    setDropPreview({ day: target.day, person: target.person, overTaskId: target.overTaskId, insertAfter });
  }

  function handleDragStart(event: DragStartEvent) {
    const taskId = String(event.active.id);
    dragStartTasksRef.current = tasks;
    lastPreviewRef.current = null;
    setActiveTaskId(taskId);
    const task = tasks.find((current) => current.id === taskId);
    if (task) setDropPreview({ day: task.day, person: task.person, insertAfter: true });
  }

  function handleDragEnd(event: DragEndEvent) {
    const original = dragStartTasksRef.current;
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) {
      if (original) setTasks(original);
      clearDragState();
      return;
    }

    setTasks((current) => {
      const target = dropTargetFromOverId(current, overId);
      const finalLayout = target
        ? reorderPlanTask(current, String(event.active.id), target.day, target.person, target.overTaskId, target.overTaskId ? shouldInsertAfterOver(event) : true)
        : current;
      const undoLayout = original ?? current;
      if (!planLayoutsEqual(undoLayout, finalLayout)) {
        undoLayoutsRef.current = [undoLayout, ...undoLayoutsRef.current].slice(0, 12);
        saveDraftTasks(week.id, finalLayout);
      }
      return finalLayout;
    });
    clearDragState();
  }

  function handleDragCancel() {
    if (dragStartTasksRef.current) setTasks(dragStartTasksRef.current);
    clearDragState();
  }

  function clearDragState() {
    dragStartTasksRef.current = null;
    lastPreviewRef.current = null;
    setActiveTaskId(null);
    setDropPreview(null);
  }

  function resetDraftLayout() {
    undoLayoutsRef.current = [tasks, ...undoLayoutsRef.current].slice(0, 12);
    setTasks(sourceTasks);
    saveDraftTasks(week.id, sourceTasks);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !isTyping && undoLayoutsRef.current.length > 0) {
        event.preventDefault();
        const [previous, ...rest] = undoLayoutsRef.current;
        undoLayoutsRef.current = rest;
        setTasks(previous);
        saveDraftTasks(week.id, previous);
      }
      if (event.key === "Escape" && activeTaskId) {
        event.preventDefault();
        handleDragCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // The undo stack and drag snapshot live in refs; this listener only needs to refresh when the active drag/week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, week.id]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={previewTaskMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section style={{ background: DT.cardBg, border: `1px solid ${isCurrentWeek ? "rgba(12,124,122,0.22)" : DT.border}`, borderRadius: DT.radius, boxShadow: isCurrentWeek ? "0 0 0 3px rgba(12,124,122,0.05), 0 2px 12px rgba(0,0,0,0.04)" : DT.shadow, overflow: "hidden", minWidth: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${DT.border}`, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", background: weekHeaderControl ? "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(110,138,106,0.055))" : undefined }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: DT.serif, color: DT.textPrimary, fontSize: 20, lineHeight: 1 }}>{displayWeekTitle(week.title)}</h2>
            {weekHeaderControl && <div style={{ marginTop: 4, fontFamily: DT.sans, fontSize: 9, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em", color: DT.sage }}>Workshop view · Today at a glance</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 520px" }}>
            {weekHeaderControl}
            {isDraftChanged && <Chip label="Draft layout changed" tone="amber" />}
            {isDraftChanged && (
              <button
                type="button"
                onClick={resetDraftLayout}
                style={{ border: `1px solid ${DT.border}`, background: DT.cardBg, color: DT.textMuted, borderRadius: 999, padding: "5px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 800, cursor: "pointer" }}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowFriday((value) => !value)}
              style={{ border: `1px solid ${showFriday ? "rgba(12,124,122,0.26)" : DT.border}`, background: showFriday ? DT.tealSoft : "rgba(255,255,255,0.72)", color: showFriday ? DT.teal : DT.textMuted, borderRadius: 999, padding: "5px 8px", fontSize: 10, fontFamily: DT.sans, fontWeight: 900, cursor: "pointer" }}
            >
              {showFriday ? "Hide Friday" : "Show Friday"}
            </button>
            <span style={{ border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.72)", borderRadius: 999, padding: "5px 8px", fontSize: 10, color: DT.textMuted, fontFamily: DT.sans, fontWeight: 850 }}>
              {week.rows.length} plan row{week.rows.length === 1 ? "" : "s"}{!hasVisibleTasks ? " · no day assignments" : ""}
            </span>
          </div>
        </div>
        <div style={{ display: isNarrow ? "flex" : "grid", gridTemplateColumns: isNarrow ? undefined : `repeat(${visibleDays.length}, minmax(0, 1fr))`, overflowX: isNarrow ? "auto" : "hidden", WebkitOverflowScrolling: isNarrow ? "touch" : undefined, minWidth: 0 }}>
          {visibleDays.map((day) => {
            const isTodayColumn = isCurrentWeek && todayKey === day;
            return (
              <div key={day} style={{ flex: isNarrow ? "0 0 250px" : undefined, minWidth: 0, minHeight: hasVisibleTasks ? 146 : 42, padding: 8, borderLeft: day === "monday" || isNarrow ? "none" : `1px solid ${DT.border}`, borderRight: isNarrow ? `1px solid ${DT.border}` : undefined, background: isTodayColumn ? "linear-gradient(180deg, rgba(12,124,122,0.08), rgba(255,255,255,0))" : undefined }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, marginBottom: hasVisibleTasks ? 7 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: isTodayColumn ? DT.teal : DT.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: DT.sans }}>{DAY_LABELS[day]}</span>
                  {isTodayColumn && <span style={{ border: "1px solid rgba(12,124,122,0.22)", background: DT.tealSoft, color: DT.teal, borderRadius: 999, padding: "2px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950 }}>Today</span>}
                </div>
                {hasVisibleTasks && (
                  <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                    {visiblePeople.map((person) => {
                      const laneTasks = tasks.filter((task) => task.day === day && task.person === person);
                      const laneAppTasks = weekAppTasks.filter((task) => task.day === day && task.person === person);
                      const laneOpenAppTasks = laneAppTasks.filter((task) => !task.done);
                      const laneSuggestions = suggestedSteps.filter((step) => step.day === day && step.person === person);
                      const laneDraftHours = laneSuggestions.reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0);
                      const capacity = summarizeLaneCapacity({ existingTaskCount: laneTasks.length, draftHours: laneDraftHours + laneOpenAppTasks.length });
                      const laneId = planLaneId(day, person);
                      const isDropTarget = Boolean(activeTaskId && dropPreview?.day === day && dropPreview.person === person);
                      const showDropSlot = (taskId?: string, insertAfter = false) => Boolean(isDropTarget && dropPreview?.overTaskId === taskId && Boolean(dropPreview?.insertAfter) === insertAfter);
                      const dropSlot = <div aria-hidden="true" style={{ height: 7, borderRadius: 999, background: "rgba(110,138,106,0.42)", boxShadow: "0 0 0 3px rgba(110,138,106,0.10)", margin: "1px 2px" }} />;
                      return (
                        <DroppablePlanLane
                          key={laneId}
                          id={laneId}
                          day={day}
                          person={person}
                          items={laneTasks.map((task) => task.id)}
                          isTodayColumn={isTodayColumn}
                          isDropTarget={isDropTarget}
                          capacity={capacity}
                        >
                          {laneTasks.map((task, laneIndex) => (
                            <div key={task.id} style={{ display: "contents" }}>
                              {showDropSlot(task.id, false) && dropSlot}
                              <SortablePlanTaskCard
                                task={task}
                                selectedOrder={selectedOrder}
                                planTaskLinks={planTaskLinks}
                                resolveTaskOrderId={resolveTaskOrderId}
                                onTaskSelect={onTaskSelect}
                                isNextTask={laneIndex === 0}
                              />
                              {showDropSlot(task.id, true) && dropSlot}
                            </div>
                          ))}
                          {isDropTarget && !dropPreview?.overTaskId && dropSlot}
                          {laneAppTasks.map((task) => (
                            <div
                              key={`app-${task.id}`}
                              role="button"
                              tabIndex={0}
                              onClick={() => onAppTaskSelect?.(task)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onAppTaskSelect?.(task);
                                }
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                maxWidth: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                overflow: "hidden",
                                color: DT.textPrimary,
                                background: "linear-gradient(135deg, rgba(12,124,122,0.15), rgba(255,255,255,0.90))",
                                border: "1px solid rgba(12,124,122,0.48)",
                                borderLeft: `4px solid ${DT.teal}`,
                                borderRadius: 8,
                                padding: "6px 7px",
                                cursor: onAppTaskSelect ? "pointer" : "default",
                                opacity: task.done ? 0.55 : 1,
                                boxShadow: "0 0 0 3px rgba(12,124,122,0.08), 0 4px 12px rgba(12,124,122,0.08)",
                                outline: "none",
                              }}
                            >
                              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "start", minWidth: 0 }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 11, fontFamily: DT.sans, fontWeight: 880, lineHeight: 1.2, overflowWrap: "anywhere", textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                                  {selectedOrder && <div style={{ marginTop: 3, fontSize: 9, color: DT.textMuted, fontFamily: DT.sans, lineHeight: 1.28, overflowWrap: "anywhere", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedOrder.customer}</div>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: "0 0 auto" }}>
                                  <span style={{ border: "1px solid rgba(110,138,106,0.20)", background: "rgba(110,138,106,0.08)", color: DT.sage, borderRadius: 999, padding: "2px 6px", fontFamily: DT.sans, fontSize: 9, fontWeight: 950, lineHeight: 1 }}>1h</span>
                                  <span style={{ color: DT.teal, background: DT.tealSoft, border: "1px solid rgba(12,124,122,0.14)", borderRadius: 999, padding: "1px 5px", fontFamily: DT.sans, fontSize: 8, fontWeight: 950, whiteSpace: "nowrap" }}>{task.done ? "Done" : "Job"}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {laneSuggestions.map((step) => (
                            <div
                              key={step.id}
                              style={{
                                display: "block",
                                width: "100%",
                                maxWidth: "100%",
                                minWidth: 0,
                                boxSizing: "border-box",
                                overflow: "hidden",
                                textDecoration: "none",
                                color: DT.textPrimary,
                                background: newOrderPalette.clayTaskBg,
                                border: `1px solid ${newOrderPalette.clayBorderStrong}`,
                                borderLeft: `4px solid ${newOrderPalette.clayStripe}`,
                                borderRadius: 8,
                                padding: "6px 7px",
                                boxShadow: `0 0 0 3px ${newOrderPalette.clayBg}, 0 2px 6px rgba(0,0,0,0.04)`,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 9, color: newOrderPalette.clayAccent, fontFamily: DT.sans, fontWeight: 950 }}>{approvedSuggestions ? "✓ Approved plan" : "New order draft"}</span>
                                <span style={{ fontSize: 9, color: DT.textFaint, fontFamily: DT.sans, fontWeight: 850 }}>{step.dateLabel} · {step.estimatedHours}h</span>
                              </div>
                              <div style={{ marginTop: 2, fontSize: 11, fontFamily: DT.sans, fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>{step.title}</div>
                              <div style={{ marginTop: 2, fontSize: 9, color: DT.textMuted, fontFamily: DT.sans, lineHeight: 1.28, overflowWrap: "anywhere" }}>{step.noWriteLabel}</div>
                            </div>
                          ))}
                          {laneTasks.length === 0 && laneAppTasks.length === 0 && laneSuggestions.length === 0 && (
                            <div style={{ padding: "6px 4px", borderRadius: 6, color: "rgba(124,116,107,0.54)", fontSize: 9, fontFamily: DT.sans, fontStyle: "italic", textAlign: "center" }}>Drop task</div>
                          )}
                        </DroppablePlanLane>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <DragOverlay dropAnimation={null}>{activeTask ? <PlanTaskDragCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}


function PlanModeToggle({ mode, onModeChange }: { mode: PlanMode; onModeChange: (mode: PlanMode) => void }) {
  const options: Array<{ id: PlanMode; label: string }> = [
    { id: "workshop", label: "Workshop" },
    { id: "planning", label: "Planning" },
  ];
  return (
    <div style={{ display: "inline-flex", padding: 3, border: `1px solid rgba(110,138,106,0.18)`, borderRadius: 999, background: "rgba(255,255,255,0.68)", boxShadow: "0 1px 2px rgba(0,0,0,0.03)", gap: 3 }}>
      {options.map((option) => {
        const active = mode === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onModeChange(option.id)}
            style={{ border: "none", borderRadius: 999, background: active ? "linear-gradient(135deg, rgba(220,191,124,0.92), rgba(110,138,106,0.74))" : "transparent", color: active ? DT.textPrimary : DT.textMuted, padding: "7px 12px", fontFamily: DT.sans, fontSize: 12, fontWeight: 950, cursor: "pointer", boxShadow: active ? "0 2px 8px rgba(44,37,32,0.10)" : "none" }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanHeaderAccessory({ mode, onModeChange, orders }: { mode: PlanMode; onModeChange: (mode: PlanMode) => void; orders: UiOrder[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
      {mode === "planning" && <OrderHealthStrip orders={orders} />}
      <PlanModeToggle mode={mode} onModeChange={onModeChange} />
    </div>
  );
}

function MonthView({ weeks, newOrder, orders, mode }: { weeks: PlanWeek[]; newOrder: NewOrderPlanCandidate | null; orders: UiOrder[]; mode: PlanMode }) {
  return <MonthViewState key={`${newOrder?.id ?? "none"}-${mode}`} weeks={weeks} newOrder={newOrder} ordersForHealth={orders} mode={mode} />;
}

function WorkshopFocusBar({
  personFilter,
  onPersonFilterChange,
  todayCounts,
  historyControl,
}: {
  personFilter: PersonFilter;
  onPersonFilterChange: (filter: PersonFilter) => void;
  todayCounts: Record<Person, number>;
  historyControl?: ReactNode;
}) {
  const options: Array<{ id: PersonFilter; label: string; sublabel: string }> = [
    { id: "all", label: "All", sublabel: `${todayCounts.nick + todayCounts.dylan} today` },
    { id: "nick", label: "Nick", sublabel: `${todayCounts.nick} today` },
    { id: "dylan", label: "Dylan", sublabel: `${todayCounts.dylan} today` },
  ];
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
      {options.map((option) => {
        const active = personFilter === option.id;
        return (
          <button
            type="button"
            key={option.id}
            onClick={() => onPersonFilterChange(option.id)}
            style={{ border: `1px solid ${active ? "rgba(12,124,122,0.34)" : DT.border}`, background: active ? DT.tealSoft : "rgba(255,255,255,0.72)", color: active ? DT.teal : DT.textMuted, borderRadius: 999, padding: "5px 8px", fontFamily: DT.sans, cursor: "pointer", minWidth: 72, textAlign: "left" }}
          >
            <span style={{ fontSize: 11, fontWeight: 950, lineHeight: 1 }}>{option.label}</span>
            <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 850, lineHeight: 1, color: active ? DT.teal : DT.textFaint }}>{option.sublabel}</span>
          </button>
        );
      })}
      {historyControl}
    </div>
  );
}

function MonthViewState({ weeks, newOrder, ordersForHealth, mode }: { weeks: PlanWeek[]; newOrder: NewOrderPlanCandidate | null; ordersForHealth: UiOrder[]; mode: PlanMode }) {
  const { currentAndUpcoming, previous } = useMemo(() => splitPlanWeeks(weeks), [weeks]);
  const isWorkshopMode = mode === "workshop";
  const visibleWeeks = isWorkshopMode ? currentAndUpcoming.slice(0, 1) : currentAndUpcoming;
  const [personFilter, setPersonFilter] = useState<PersonFilter>("all");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const baseSuggestedSteps = useMemo(() => buildSuggestedPlanForOrder(newOrder), [newOrder]);
  const [editableSteps, setEditableSteps] = useState<SuggestedOrderPlanStep[]>(baseSuggestedSteps);
  const [showTasksInMonth, setShowTasksInMonth] = useState(false);
  const [approvedSteps, setApprovedSteps] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<OrderWorkflowState | null>(null);
  const [selectedAssignmentTask, setSelectedAssignmentTask] = useState<AssignablePlanTask | null>(null);
  const [planTaskLinks, setPlanTaskLinks] = useState<PlanTaskLinks>({});
  const [assignmentStatus, setAssignmentStatus] = useState("");
  const isRailNarrow = useIsNarrow(1040);
  const selectedOrder = useMemo(
    () => ordersForHealth.find((order) => order.id === selectedOrderId) ?? null,
    [ordersForHealth, selectedOrderId]
  );
  const openOrder = useMemo(
    () => ordersForHealth.find((order) => order.id === openOrderId) ?? null,
    [ordersForHealth, openOrderId]
  );
  const openOrderTasks = useMemo(
    () => planTasksForOrder(weeks, openOrder),
    [weeks, openOrder]
  );
  const selectedOrderTasks = useMemo(
    () => planTasksForOrder(weeks, selectedOrder),
    [weeks, selectedOrder]
  );
  const selectedAppTasks = useMemo(() => workflowTasksForPlan(selectedWorkflow), [selectedWorkflow]);
  const keepOverlayWorkflow = useCallback((workflow: OrderWorkflowState | null) => {
    if (workflow) setSelectedWorkflow(workflow);
  }, []);
  const closeOrderOverview = useCallback(() => {
    setOpenOrderId(null);
  }, []);
  const todayCounts = useMemo<Record<Person, number>>(() => {
    const today = currentDayKey();
    if (!today) return { nick: 0, dylan: 0 };
    const now = new Date();
    const currentWeek = currentAndUpcoming.find((week) => {
      const range = weekRangeFromTitle(week.title);
      return range ? range.start.getTime() <= now.getTime() && now.getTime() <= range.end.getTime() : false;
    });
    if (!currentWeek) return { nick: 0, dylan: 0 };
    const tasks = sourceTasksForWeek(currentWeek.rows);
    return {
      nick: tasks.filter((task) => task.day === today && task.person === "nick").length,
      dylan: tasks.filter((task) => task.day === today && task.person === "dylan").length,
    };
  }, [currentAndUpcoming]);

  function resolveOrderIdForPlanTask(task: DraggablePlanTask) {
    const assignedId = assignedOrderIdForTask(task, planTaskLinks);
    if (assignedId && ordersForHealth.some((order) => order.id === assignedId)) return assignedId;
    const linkedId = task.linkedOrderIds.find((id) => ordersForHealth.some((order) => order.id === id));
    if (linkedId) return linkedId;
    const scored = ordersForHealth
      .map((order) => ({ order, score: orderNameMatchScore(order, task.rowName, ...task.linkedOrders.map((linked) => linked.name)) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score || ((orderDaysUntil(a.order.shipDate) ?? 999) - (orderDaysUntil(b.order.shipDate) ?? 999)));
    return scored[0]?.order.id ?? null;
  }

  function selectOrder(id: number) {
    setSelectedAssignmentTask(null);
    setSelectedWorkflow(null);
    setSelectedOrderId(id);
  }

  function openOrderOverview(id: number) {
    setSelectedAssignmentTask(null);
    setSelectedOrderId(id);
    setOpenOrderId(id);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/production/plan-task-links")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Task links unavailable")))
      .then((data: { state?: { links?: PlanTaskLinks }; disabledReason?: string }) => {
        if (cancelled) return;
        setPlanTaskLinks(data.state?.links ?? {});
        setAssignmentStatus(data.disabledReason ?? "");
      })
      .catch((err) => {
        if (!cancelled) setAssignmentStatus(err instanceof Error ? err.message : "Task links unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenOrderId(null);
      setSelectedAssignmentTask(null);
      setShowNewOrder(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectOrderForPlanTask(task: AssignablePlanTask) {
    const orderId = resolveOrderIdForPlanTask(task);
    if (orderId) {
      openOrderOverview(orderId);
      return;
    }
    if (isWorkshopMode) return;
    setSelectedWorkflow(null);
    setSelectedOrderId(null);
    setSelectedAssignmentTask(task);
  }

  function assignPlanTaskToOrder(task: AssignablePlanTask, orderId: number) {
    const taskKey = planTaskLinkKey(task);
    setPlanTaskLinks((current) => ({ ...current, [taskKey]: orderId }));
    setAssignmentStatus("Saving link...");
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: taskKey, legacyTaskId: task.id, orderId }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: { links?: PlanTaskLinks } }) => {
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        setAssignmentStatus("Linked in Tuesday");
        selectOrder(orderId);
      })
      .catch((err) => {
        setAssignmentStatus(err instanceof Error ? err.message : "Save failed");
        setPlanTaskLinks((current) => {
          const next = { ...current };
          delete next[taskKey];
          return next;
        });
      });
  }

  function removePlanTaskLink(task: AssignablePlanTask) {
    const taskKey = planTaskLinkKey(task);
    setPlanTaskLinks((current) => {
      const next = { ...current };
      delete next[taskKey];
      delete next[task.id];
      return next;
    });
    setAssignmentStatus("Removing link...");
    fetch("/api/production/plan-task-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: taskKey, legacyTaskId: task.id, orderId: null }),
    })
      .then((response) => response.ok ? response.json() : response.json().then((body) => Promise.reject(new Error(body.error || "Save failed"))))
      .then((data: { state?: { links?: PlanTaskLinks } }) => {
        if (data.state?.links) setPlanTaskLinks(data.state.links);
        setAssignmentStatus("Link removed");
      })
      .catch((err) => setAssignmentStatus(err instanceof Error ? err.message : "Save failed"));
  }

  function updateSuggestedStep(id: string, patch: Partial<Pick<SuggestedOrderPlanStep, "title" | "detail" | "day" | "person" | "estimatedHours">>) {
    setEditableSteps((current) => current.map((step) => (step.id === id ? { ...step, ...patch } : step)));
    setApprovedSteps(false);
  }

  function bringBackNewOrderPanel() {
    setShowNewOrder(true);
  }

  function hideNewOrderPanel() {
    setShowNewOrder(false);
  }

  function approveNewOrderTasks() {
    setShowTasksInMonth(true);
    setApprovedSteps(true);
    setShowNewOrder(false);
  }

  function toggleNewOrderTasksInSchedule() {
    if (showTasksInMonth || approvedSteps) {
      setShowTasksInMonth(false);
      setApprovedSteps(false);
      return;
    }
    setShowTasksInMonth(true);
  }

  const suggestedWeekIndex = useMemo(() => {
    const firstDate = editableSteps[0]?.dateIso;
    if (!firstDate) return 0;
    const suggestedTime = new Date(`${firstDate}T12:00:00`).getTime();
    const found = currentAndUpcoming.findIndex((week) => {
      const range = weekRangeFromTitle(week.title);
      return range ? range.start.getTime() <= suggestedTime && suggestedTime <= range.end.getTime() : false;
    });
    return found >= 0 ? found : 0;
  }, [currentAndUpcoming, editableSteps]);

  const capacityByLane = useMemo<CapacityByLane>(() => {
    const suggestedWeek = currentAndUpcoming[suggestedWeekIndex];
    const existingTasks = suggestedWeek ? sourceTasksForWeek(suggestedWeek.rows) : [];
    const summaries: CapacityByLane = {};
    for (const day of DAYS) {
      for (const person of PEOPLE) {
        const existingTaskCount = existingTasks.filter((task) => task.day === day && task.person === person).length;
        const draftHours = editableSteps
          .filter((step) => step.day === day && step.person === person)
          .reduce((sum, step) => sum + Number(step.estimatedHours || 0), 0);
        summaries[laneCapacityKey(day, person)] = summarizeLaneCapacity({ existingTaskCount, draftHours });
      }
    }
    return summaries;
  }, [currentAndUpcoming, suggestedWeekIndex, editableSteps]);

  const historyControl = !isWorkshopMode && previous.length > 0 ? (
      <details style={{ position: "relative" }}>
        <summary style={{ listStyle: "none", border: `1px solid ${DT.border}`, background: "rgba(255,255,255,0.68)", color: DT.textMuted, borderRadius: 999, padding: "6px 9px", fontSize: 10, fontFamily: DT.sans, fontWeight: 900, cursor: "pointer" }}>
          History · {previous.length}
        </summary>
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 40, width: isRailNarrow ? "min(90vw, 360px)" : "min(860px, calc(100vw - 420px))", maxHeight: "70vh", overflowY: "auto", padding: 10, background: "rgba(255,253,249,0.96)", border: `1px solid ${DT.border}`, borderRadius: 12, boxShadow: "0 18px 44px rgba(44,37,32,0.14)", display: "flex", flexDirection: "column", gap: 12 }}>
          {previous.map((week) => (
            <MonthWeekSection key={week.id} week={week} selectedOrder={selectedOrder} appTasks={selectedAppTasks} planTaskLinks={planTaskLinks} personFilter={personFilter} resolveTaskOrderId={resolveOrderIdForPlanTask} onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })} onAppTaskSelect={(task) => selectOrder(task.orderId)} />
          ))}
        </div>
      </details>
  ) : null;

  const workshopHeaderControl = (
    <WorkshopFocusBar personFilter={personFilter} onPersonFilterChange={setPersonFilter} todayCounts={todayCounts} historyControl={historyControl} />
  );

  const newOrderPanel = !isWorkshopMode && showNewOrder ? (
    <NewOrderHalo
      order={newOrder}
      suggestions={editableSteps}
      open={showNewOrder}
      approved={approvedSteps}
      showingInMonth={showTasksInMonth || approvedSteps}
      onStepChange={updateSuggestedStep}
      onShowInMonth={toggleNewOrderTasksInSchedule}
      onApprove={approveNewOrderTasks}
      onClose={hideNewOrderPanel}
      capacityByLane={capacityByLane}
    />
  ) : null;

  const railNewOrderCard = !isWorkshopMode ? (
    <NewOrderRailCard
      order={newOrder}
      showingInMonth={showTasksInMonth || approvedSteps}
      approved={approvedSteps}
      onOpen={bringBackNewOrderPanel}
      onToggleMonthTasks={toggleNewOrderTasksInSchedule}
      onApprove={approveNewOrderTasks}
    />
  ) : null;

  const weekSections = visibleWeeks.map((week, index) => (
    <MonthWeekSection
      key={week.id}
      week={week}
      suggestedSteps={!isWorkshopMode && (showTasksInMonth || approvedSteps) && index === suggestedWeekIndex ? editableSteps : []}
      approvedSuggestions={approvedSteps}
      selectedOrder={selectedOrder}
      appTasks={selectedAppTasks}
      planTaskLinks={planTaskLinks}
      personFilter={personFilter}
      resolveTaskOrderId={resolveOrderIdForPlanTask}
      onTaskSelect={(task) => selectOrderForPlanTask({ ...task, weekTitle: displayWeekTitle(week.title) })}
      onAppTaskSelect={(task) => selectOrder(task.orderId)}
      weekHeaderControl={index === 0 ? workshopHeaderControl : undefined}
    />
  ));

  const orderRail = (
    <OrderRail
      orders={ordersForHealth}
      selectedOrder={selectedOrder}
      selectedOrderTasks={selectedOrderTasks}
      assignmentTask={selectedAssignmentTask}
      assignmentStatus={assignmentStatus}
      onAssignTask={assignPlanTaskToOrder}
      onRemoveTaskLink={removePlanTaskLink}
      canRemoveAssignmentLink={selectedAssignmentTask ? Boolean(assignedOrderIdForTask(selectedAssignmentTask, planTaskLinks)) : false}
      newOrderCard={railNewOrderCard}
      onWorkflowChange={setSelectedWorkflow}
      onSelect={selectOrder}
      onOpenOrder={openOrderOverview}
      onClear={() => {
        setSelectedAssignmentTask(null);
        setSelectedWorkflow(null);
        setSelectedOrderId(null);
      }}
      isNarrow={isRailNarrow}
    />
  );

  if (isRailNarrow || isWorkshopMode) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: isWorkshopMode ? 10 : 14 }}>
        {newOrderPanel}
        {weekSections}
        {!isWorkshopMode && orderRail}
        {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 318px",
        gap: 14,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {newOrderPanel}
        {weekSections}
      </div>
      {orderRail}
      {openOrder && <OrderOverviewOverlay key={`overlay-${openOrder.id}`} order={openOrder} planTasks={openOrderTasks} onClose={closeOrderOverview} onWorkflowChange={keepOverlayWorkflow} />}
    </div>
  );
}

export type PlanClientProps = {
  rows: PlanRow[];
  orders: UiOrder[];
  syncedAt: string;
  source: "fresh" | "cache" | "snapshot" | "none";
  mondayError?: string;
};

export default function PlanClient({
  rows,
  orders,
  syncedAt,
  source,
  mondayError,
}: PlanClientProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [mode, setMode] = useState<PlanMode>("workshop");
  useEffect(() => {
    const id = window.setTimeout(() => setHasMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const weeks = useMemo(() => groupPlanRowsByWeek(rows), [rows]);
  const activeWeeks = weeks.filter((w) => !isArchiveWeek(w.title));
  const plannedOrderIds = useMemo(
    () => new Set(rows.flatMap((row) => row.appLinkedOrder ? [Number(row.appLinkedOrder.mondayItemId)] : [])),
    [rows]
  );
  const plannedNames = useMemo(() => new Set(rows.map((row) => row.name)), [rows]);
  const newOrder = useMemo(() => selectNewOrderForPlanning(orders, plannedOrderIds, plannedNames), [orders, plannedOrderIds, plannedNames]);

  return (
    <MissionControlShell
      section="plan"
      pageTitle="Production Plan"
      syncedAt={syncedAt}
      source={source}
      mondayError={mondayError}
      pageTitleAccessory={hasMounted ? <PlanHeaderAccessory mode={mode} onModeChange={setMode} orders={orders} /> : undefined}
    >
        {rows.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              fontSize: 13,
              color: DT.textFaint,
              fontFamily: DT.sans,
            }}
          >
            No Production Plan rows. {mondayError && `(${mondayError})`}
          </div>
        ) : !hasMounted ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              fontSize: 13,
              color: DT.textFaint,
              fontFamily: DT.sans,
            }}
          >
            Loading Production Plan...
          </div>
        ) : (
          <MonthView weeks={activeWeeks} newOrder={newOrder} orders={orders} mode={mode} />
        )}
    </MissionControlShell>
  );
}
