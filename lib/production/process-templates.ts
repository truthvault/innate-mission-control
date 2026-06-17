import {
  buildDiningTableProcessPlan,
  type WorkshopProcessOwner,
  type WorkshopProcessTask,
} from "@/lib/production/workshop-process-rules";
import {
  PANEL_STEPS as ORDER_PANEL_STEPS,
  SAMPLE_STEPS as ORDER_SAMPLE_STEPS,
  TABLE_STEPS as ORDER_TABLE_STEPS,
  type ProductionStep,
} from "@/lib/production/order-display";

export type ProcessTemplateIssueLevel = "aligned" | "watch" | "gap";
export type ProcessTemplateTask = Pick<WorkshopProcessTask, "title" | "owner" | "estimatedHours"> & {
  note?: string;
};
export type ProcessTemplateFlowStep = ProductionStep;
export type ProcessTemplatePreview = {
  id: string;
  title: string;
  subtitle: string;
  detection: string[];
  suggestedTasks: ProcessTemplateTask[];
  orderFlow: ProcessTemplateFlowStep[];
  issueLevel: ProcessTemplateIssueLevel;
  issueLabel: string;
};

export const PROCESS_TEMPLATE_START_ISO = "2026-06-16";
const PROCESS_ISSUE_LEVELS: ProcessTemplateIssueLevel[] = ["aligned", "watch", "gap"];
const PROCESS_OWNERS: WorkshopProcessOwner[] = ["Nick", "Dylan", "Guido", "Other"];

const STANDARD_DINING_TEMPLATE_TASKS = buildDiningTableProcessPlan({
  orderId: "standard-dining",
  text: "rectangle dining table West Coast Beech clear Crossroads steel base",
  startIso: PROCESS_TEMPLATE_START_ISO,
});
const CNC_DINING_TEMPLATE_TASKS = buildDiningTableProcessPlan({
  orderId: "cnc-dining",
  text: "Danish oval dining table West Coast Beech clear Crossroads steel base",
  startIso: PROCESS_TEMPLATE_START_ISO,
});
const PANEL_TEMPLATE_TASKS: ProcessTemplateTask[] = [
  { title: "Order Loaded", owner: "Guido", estimatedHours: 1, note: "Spec/payment/customer promise checked before workshop trust." },
  { title: "Cut / machine / prep", owner: "Nick", estimatedHours: 1 },
  { title: "Sand and coat", owner: "Dylan", estimatedHours: 1 },
  { title: "QC + photos", owner: "Nick", estimatedHours: 1 },
  { title: "Pack / wrap", owner: "Dylan", estimatedHours: 0.5 },
];
const SUPPLY_ONLY_TEMPLATE_TASKS: ProcessTemplateTask[] = [
  { title: "Order Loaded", owner: "Guido", estimatedHours: 1 },
  { title: "Confirm supplier / collection path", owner: "Guido", estimatedHours: 0.5 },
  { title: "Customer update", owner: "Guido", estimatedHours: 0.25 },
  { title: "Confirm collected / gone", owner: "Guido", estimatedHours: 0.25 },
];
const SAMPLE_TEMPLATE_TASKS: ProcessTemplateTask[] = ORDER_SAMPLE_STEPS.map((step) => ({
  title: step.label,
  owner: step.who === "Customer follow-up" ? "Guido" : "Dylan",
  estimatedHours: 0.25,
}));

export const DEFAULT_PROCESS_TEMPLATE_PREVIEWS: ProcessTemplatePreview[] = [
  {
    id: "standard-dining-table",
    title: "Dining table",
    subtitle: "Rectangle, square, round, or pill unless a special route is triggered.",
    detection: ["Product: Table", "Shape: rectangle / square / round / pill", "Finish decides clear vs blackwash coating steps"],
    suggestedTasks: STANDARD_DINING_TEMPLATE_TASKS,
    orderFlow: ORDER_TABLE_STEPS,
    issueLevel: "watch",
    issueLabel: "Flow still shows broad table stages",
  },
  {
    id: "cnc-dining-table",
    title: "Dining table - non-standard shape",
    subtitle: "Danish oval, classic oval, pebble, organic, or custom shape.",
    detection: ["Shape not rectangle / square / round / pill", "Precision Woodworks CNC adds about 2 weeks", "Pinpoint return booking is required"],
    suggestedTasks: CNC_DINING_TEMPLATE_TASKS,
    orderFlow: ORDER_TABLE_STEPS,
    issueLevel: "gap",
    issueLabel: "Order-detail flow needs conditional CNC stages",
  },
  {
    id: "panel-benchtop",
    title: "Panel / benchtop",
    subtitle: "Standard panel production without a custom table-shape route.",
    detection: ["Product: Panel", "Top / panel work", "No table base dependency unless explicit"],
    suggestedTasks: PANEL_TEMPLATE_TASKS,
    orderFlow: ORDER_PANEL_STEPS,
    issueLevel: "watch",
    issueLabel: "Panel rules need the same source-of-truth builder as tables",
  },
  {
    id: "supply-only",
    title: "Supply-only / customer collection",
    subtitle: "Supplier pickup or customer collection where workshop production is not needed.",
    detection: ["No workshop machining/coating", "Supplier or customer collection path", "Completion can happen from order popup"],
    suggestedTasks: SUPPLY_ONLY_TEMPLATE_TASKS,
    orderFlow: [],
    issueLevel: "gap",
    issueLabel: "Needs its own short order flow",
  },
  {
    id: "samples",
    title: "Samples",
    subtitle: "Sample requests and follow-up.",
    detection: ["Monday item: Sample", "Sample stage from sample-specific status/top-panel fields"],
    suggestedTasks: SAMPLE_TEMPLATE_TASKS,
    orderFlow: ORDER_SAMPLE_STEPS,
    issueLevel: "aligned",
    issueLabel: "Sample flow is already separate",
  },
];

function text(value: unknown, fallback: string, max = 220) {
  const clean = typeof value === "string" ? value.trim().slice(0, max) : "";
  return clean || fallback;
}

function optionalText(value: unknown, max = 240) {
  const clean = typeof value === "string" ? value.trim().slice(0, max) : "";
  return clean || undefined;
}

function hours(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 4) / 4);
}

function owner(value: unknown): WorkshopProcessOwner {
  return PROCESS_OWNERS.includes(value as WorkshopProcessOwner) ? value as WorkshopProcessOwner : "Other";
}

function issueLevel(value: unknown): ProcessTemplateIssueLevel {
  return PROCESS_ISSUE_LEVELS.includes(value as ProcessTemplateIssueLevel) ? value as ProcessTemplateIssueLevel : "watch";
}

function normalizeTask(value: unknown, index: number): ProcessTemplateTask {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    title: text(source.title, `Task ${index + 1}`),
    owner: owner(source.owner),
    estimatedHours: hours(source.estimatedHours),
    note: optionalText(source.note),
  };
}

function normalizeFlowStep(value: unknown, index: number): ProcessTemplateFlowStep {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    key: text(source.key, `step-${index + 1}`, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `step-${index + 1}`,
    label: text(source.label, `Flow step ${index + 1}`),
    who: optionalText(source.who, 80) ?? null,
    wait: typeof source.wait === "boolean" ? source.wait : false,
    waitLabel: optionalText(source.waitLabel, 80),
  };
}

export function normalizeProcessTemplates(value: unknown): ProcessTemplatePreview[] {
  const source = Array.isArray(value) ? value : DEFAULT_PROCESS_TEMPLATE_PREVIEWS;
  return source.slice(0, 30).map((template, index) => {
    const fallback = DEFAULT_PROCESS_TEMPLATE_PREVIEWS[index] ?? DEFAULT_PROCESS_TEMPLATE_PREVIEWS[0];
    const record = template && typeof template === "object" && !Array.isArray(template) ? template as Record<string, unknown> : {};
    return {
      id: text(record.id, fallback.id, 80).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || fallback.id,
      title: text(record.title, fallback.title),
      subtitle: text(record.subtitle, fallback.subtitle, 320),
      detection: Array.isArray(record.detection)
        ? record.detection.map((item, itemIndex) => text(item, `Rule ${itemIndex + 1}`, 240)).slice(0, 20)
        : fallback.detection,
      suggestedTasks: Array.isArray(record.suggestedTasks)
        ? record.suggestedTasks.map(normalizeTask).slice(0, 80)
        : fallback.suggestedTasks,
      orderFlow: Array.isArray(record.orderFlow)
        ? record.orderFlow.map(normalizeFlowStep).slice(0, 80)
        : fallback.orderFlow,
      issueLevel: issueLevel(record.issueLevel),
      issueLabel: text(record.issueLabel, fallback.issueLabel, 160),
    };
  });
}
