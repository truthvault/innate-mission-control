import {
  buildDiningTableProcessPlan,
  type WorkshopProcessOwner,
  type WorkshopProcessTask,
} from "@/lib/production/workshop-process-rules";
import {
  TABLE_STEPS as ORDER_TABLE_STEPS,
  PANEL_STEPS as ORDER_PANEL_STEPS,
  SAMPLE_STEPS as ORDER_SAMPLE_STEPS,
  type ProductionStep,
} from "@/lib/production/production-steps";

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

const BUILT_CNC_DINING_TEMPLATE_TASKS = buildDiningTableProcessPlan({
  orderId: "cnc-dining",
  text: "Danish oval dining table West Coast Beech clear Crossroads steel base",
  startIso: PROCESS_TEMPLATE_START_ISO,
});

function taskFromPlan(
  plan: WorkshopProcessTask[],
  title: string,
  fallback: { owner: WorkshopProcessOwner; estimatedHours: number; note?: string }
): ProcessTemplateTask {
  const match = plan.find((task) => task.title.toLowerCase() === title.toLowerCase());
  return {
    title,
    owner: match?.owner ?? fallback.owner,
    estimatedHours: match?.estimatedHours ?? fallback.estimatedHours,
    note: fallback.note ?? match?.detail,
  };
}

function flowStep(key: string, label: string, who: string | null, wait = false, waitLabel?: string): ProcessTemplateFlowStep {
  return { key, label, who, wait, waitLabel };
}

const STANDARD_DINING_TEMPLATE_TASKS: ProcessTemplateTask[] = [
  { title: "Order/spec/payment/customer promise checked", owner: "Guido", estimatedHours: 1, note: "Check the order is loaded, spec is clear, payment evidence is present, and customer promise is realistic before workshop trust." },
  { title: "Production spec and workshop timber confirmed", owner: "Nick", estimatedHours: 0.5, note: "Confirm production spec, steel-frame details, species, finish, and workshop timber availability before sending supplier POs. For rimu/tōtara, confirm the Timbers of NZ timber PO if required; for beech/in-stock timber, keep the process on the simple workshop-stock path." },
  { title: "Send Tube Fab PO", owner: "Nick", estimatedHours: 0.25, note: "Send the purchase order to Tube Fab for the steel components, frame, or base." },
  { title: "Send Westimber PO / lamination confirmation", owner: "Nick", estimatedHours: 0.25, note: "Send the Westimber purchase order or confirm the lamination job/spec before timber leaves the workshop." },
  { title: "Pull timber from workshop", owner: "Dylan", estimatedHours: 1, note: "Pull the selected workshop timber and strap it ready for Westimber." },
  { title: "Timber to Westimber for lamination", owner: "Nick", estimatedHours: 0.5, note: "Get the strapped timber to Westimber against the confirmed lamination job." },
  { title: "Westimber lamination wait", owner: "Other", estimatedHours: 0, note: "Planning gate only. Westimber laminated panels are about 2 weeks after PO/spec confirmation." },
  { title: "Receive/check laminated top back at workshop", owner: "Nick", estimatedHours: 0.5, note: "Check the laminated top is back, sound, correctly sized, and ready for workshop processing." },
  { title: "Stress cuts + C-channels", owner: "Nick", estimatedHours: 1, note: "Make stress cuts and fit/check C-channels before sanding and coating." },
  { title: "Bottom prep", owner: "Dylan", estimatedHours: 1, note: "Choose bottom face, prep underside, and resolve insert/flat-pack details if needed." },
  { title: "Bottom coat", owner: "Dylan", estimatedHours: 1, note: "Sand and coat the underside before top-side finishing." },
  { title: "Sand top/sides/edges", owner: "Dylan", estimatedHours: 1, note: "Fill defects, sand top/sides/ends, arise edges, remove dust, and check under light." },
  { title: "First coat", owner: "Dylan", estimatedHours: 1, note: "Apply first coat after final surface prep." },
  { title: "Second coat", owner: "Dylan", estimatedHours: 1, note: "Allow at least one working day between coats; two is better where possible." },
  { title: "Final coat", owner: "Dylan", estimatedHours: 1, note: "Clear finish is normally three clear coats total. Blackwash uses two stain coats plus two clear coats." },
  { title: "Cure", owner: "Other", estimatedHours: 0, note: "Planning gate only. Let finish cure before final handling; a full week is better where possible." },
  { title: "QC + photos", owner: "Nick", estimatedHours: 1, note: "Final proof photos, spec check, finish check, and customer-ready quality review." },
  { title: "Fit/check steel frame/base/assembly", owner: "Nick", estimatedHours: 1, note: "Fit or check the steel frame/base and confirm assembly before packing." },
  { title: "Box/pack/wrap", owner: "Dylan", estimatedHours: 0.75, note: "Protect the top/base for freight, delivery, or collection." },
  { title: "Balance invoice/payment release check", owner: "Guido", estimatedHours: 0.5, note: "Issue/check balance invoice and confirm payment release before the order leaves." },
  { title: "Book freight/delivery or customer collection", owner: "Guido", estimatedHours: 0.5, note: "Book freight/delivery or confirm customer collection details." },
  { title: "Customer update", owner: "Guido", estimatedHours: 0.25, note: "Send the confirmed dispatch, delivery, or collection update." },
];

const STANDARD_DINING_FLOW_STEPS: ProcessTemplateFlowStep[] = ORDER_TABLE_STEPS;

const CNC_DINING_TEMPLATE_TASKS: ProcessTemplateTask[] = [
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "Order Loaded", { owner: "Guido", estimatedHours: 1, note: "Check invoice, spec, payment evidence, promised due date, supplier needs, and delivery method before workshop trust." }),
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "POs sent", { owner: "Nick", estimatedHours: 0.5 }),
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "Timber pulled", { owner: "Dylan", estimatedHours: 1 }),
  { title: "Westimber lamination wait", owner: "Other", estimatedHours: 0, note: "Planning gate only. Westimber laminated panels are about 2 weeks after PO/spec confirmation." },
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "Precision Woodworks CNC", { owner: "Guido", estimatedHours: 0.25, note: "Non-standard shapes go to Precision Woodworks after Westimber." }),
  { title: "Precision CNC wait", owner: "Other", estimatedHours: 0, note: "Planning gate only. Precision Woodworks CNC shape cutting adds about 2 weeks after Westimber." },
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "Book Pinpoint return", { owner: "Guido", estimatedHours: 0.25, note: "Book Pinpoint to return CNC-cut panel(s) from Precision Woodworks to the workshop." }),
  taskFromPlan(BUILT_CNC_DINING_TEMPLATE_TASKS, "Materials received", { owner: "Dylan", estimatedHours: 0.5 }),
  ...STANDARD_DINING_TEMPLATE_TASKS.slice(8),
];

const CNC_DINING_FLOW_STEPS: ProcessTemplateFlowStep[] = [
  flowStep("confirmed", "Order confirmed", "Guido"),
  flowStep("pos", "POs sent", "Nick"),
  flowStep("timber", "Timber pulled", "Dylan"),
  flowStep("westimber-wait", "Westimber wait", null, true, "~2 weeks"),
  flowStep("precision-cnc", "Precision CNC", "Guido"),
  flowStep("precision-wait", "CNC wait", null, true, "~2 weeks"),
  flowStep("pinpoint-return", "Pinpoint return booked", "Guido"),
  flowStep("received", "Materials received", "Dylan"),
  ...STANDARD_DINING_FLOW_STEPS.slice(8),
];
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
    title: "Standard rectangular steel-frame dining table",
    subtitle: "Simple repeatable rectangular dining table with workshop timber, Westimber lamination, and steel-frame fit/check.",
    detection: ["Product: Dining table", "Shape: rectangular", "Steel frame/base", "Workshop timber stock available"],
    suggestedTasks: STANDARD_DINING_TEMPLATE_TASKS,
    orderFlow: STANDARD_DINING_FLOW_STEPS,
    issueLevel: "aligned",
    issueLabel: "Dining table path aligned to SOP-level production events",
  },
  {
    id: "cnc-dining-table",
    title: "Dining table - non-standard shape",
    subtitle: "Danish oval, classic oval, pebble, organic, or custom shape.",
    detection: ["Shape not rectangle / square / round / pill", "Precision Woodworks CNC adds about 2 weeks", "Pinpoint return booking is required"],
    suggestedTasks: CNC_DINING_TEMPLATE_TASKS,
    orderFlow: CNC_DINING_FLOW_STEPS,
    issueLevel: "aligned",
    issueLabel: "CNC path includes Westimber, Precision, and Pinpoint gates",
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
