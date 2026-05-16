import type { UiOrder } from "@/lib/monday/mapping";

export type ProductionStep = { key: string; label: string; who: string | null; wait: boolean; waitLabel?: string };

export const TABLE_STEPS: ProductionStep[] = [
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

export const PANEL_STEPS: ProductionStep[] = [
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
  { key: "wrap", label: "Wrap + Ship", who: "Workshop", wait: false },
];

export const SAMPLE_STEPS: ProductionStep[] = [
  { key: "received", label: "Request Received", who: "Workshop", wait: false },
  { key: "species", label: "Species Selected", who: "Workshop", wait: false },
  { key: "cut", label: "Samples Cut", who: "Workshop", wait: false },
  { key: "sand", label: "Sanded", who: "Workshop", wait: false },
  { key: "coat", label: "Coated", who: "Workshop", wait: false },
  { key: "pack", label: "Packed", who: "Workshop", wait: false },
  { key: "sent", label: "Sent / Collected", who: null, wait: false },
  { key: "followup", label: "Follow-up Due", who: "Customer follow-up", wait: false },
];

export type DisplayOrder = UiOrder & {
  steps: ProductionStep[];
  repair: boolean;
  displayStatus: string;
  nextAction: string;
  attention: string[];
  dataFlags: string[];
};

const STEPS_BY_KEY: Record<string, ProductionStep[]> = { TABLE_STEPS, PANEL_STEPS };

export function toDisplayOrder(o: UiOrder): DisplayOrder {
  const isSample = o.rawMondayItem === "Sample";
  const steps = isSample ? SAMPLE_STEPS : o.stepsKey ? STEPS_BY_KEY[o.stepsKey] ?? [] : [];
  const currentStep = isSample ? sampleCurrentStep(o) : o.currentStep;
  const stepNote = isSample ? sampleStepNote(o, currentStep) : displayStepNote(o);
  return {
    ...o,
    currentStep,
    stepNote,
    steps,
    repair: o.rawMondayTopPanel === "Repair",
    displayStatus: displayStatus(o),
    nextAction: nextAction(o, currentStep),
    attention: attentionFlags(o),
    dataFlags: dataQualityFlags(o),
  };
}

export function displayStatus(o: UiOrder): string {
  if (o.rawMondayStatus === "Materials Ordered") return "Materials Ordered";
  if (o.rawMondayStatus === "Materials Ready") return "Materials Ready";
  if (o.rawMondayStatus === "To Process") return "To Process";
  return o.status;
}

export function sampleCurrentStep(o: UiOrder): number {
  const status = o.rawMondayStatus;
  const top = o.rawMondayTopPanel;
  if (status === "Finished" || status === "Collected") return 6;
  if (top === "Done / NA") return status === "Booked" ? 6 : 5;
  if (top === "Final coat" || top === "2nd Colour" || top === "coated-check over") return 4;
  if (top === "Bottom coat" || top === "1st coat" || top === "1st Colour") return 4;
  if (status === "Materials Ready" || status === "In production") return 2;
  if (status === "Materials Ordered") return 1;
  return 0;
}

export function sampleStepNote(o: UiOrder, currentStep: number): string {
  if (o.status === "Collected") return "Sample collected";
  if (o.status === "Finished") return "Sample ready / sent";
  if (o.rawMondayStatus === "To Process") return "Sample request ready to process";
  if (o.rawMondayStatus === "Materials Ordered") return "Waiting on sample material";
  return SAMPLE_STEPS[Math.min(currentStep, SAMPLE_STEPS.length - 1)]?.label ?? "Sample in progress";
}

export function displayStepNote(o: UiOrder): string {
  if (o.rawMondayStatus === "Materials Ordered") return "Waiting on materials";
  if (o.rawMondayStatus === "To Process") return "Ready to process";
  return o.stepNote;
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 864e5);
}

export function attentionFlags(o: UiOrder): string[] {
  const flags: string[] = [];
  const diff = daysUntil(o.shipDate);
  if (diff !== null && diff < 0) flags.push("Overdue");
  if (diff === 0) flags.push("Due today");
  if (!o.shipDate) flags.push("Needs due date");
  if (o.rawMondayItem === "Sample" && diff !== null && diff <= 2 && o.rawMondayStatus === "To Process") flags.push("Sample due soon");
  if (o.rawMondayStatus === "Materials Ordered") flags.push("Waiting on materials");
  if (o.rawMondayStatus === "In production" && o.rawMondayTopPanel == null) flags.push("Needs step update");
  return flags;
}

export function dataQualityFlags(o: UiOrder): string[] {
  const flags: string[] = [];
  if (!o.shipDate) flags.push("No due date");
  if (o.value == null) flags.push("No value");
  if (!o.xero) flags.push("No Xero link");
  if (!o.rawMondayStatus) flags.push("No Monday status");
  return flags;
}

export function nextAction(o: UiOrder, currentStep: number): string {
  if (!o.shipDate) return "Set due date in the source order";
  if (o.rawMondayStatus === "Materials Ordered") return "Confirm material arrival / supplier timing";
  if (o.rawMondayStatus === "To Process") return o.rawMondayItem === "Sample" ? "Cut / prepare sample pack" : "Confirm production plan";
  if (o.rawMondayTopPanel === "Repair") return "Resolve repair, then update Monday";
  if (o.rawMondayItem === "Sample") {
    if (currentStep < 5) return SAMPLE_STEPS[Math.min(currentStep + 1, SAMPLE_STEPS.length - 1)]?.label ?? "Move sample forward";
    return "Send / confirm follow-up";
  }
  if (o.status === "Finished") return "Confirm collection / delivery close-out";
  if (o.status === "Collected") return "Complete";
  const steps = o.product === "Table" ? TABLE_STEPS : o.product === "Panel" ? PANEL_STEPS : [];
  return steps[Math.min(currentStep + 1, steps.length - 1)]?.label ?? "Update next production step";
}

export function isComplete(o: UiOrder): boolean {
  return ["Collected", "Finished", "Shipped"].includes(o.status);
}

export function sortByShipDate(a: UiOrder, b: UiOrder): number {
  if (!a.shipDate && !b.shipDate) return 0;
  if (!a.shipDate) return 1;
  if (!b.shipDate) return -1;
  return new Date(a.shipDate).getTime() - new Date(b.shipDate).getTime();
}

export type DueBucket = "due" | "thisWeek" | "nextWeek" | "later" | "noDate";

export function weekBoundaries() {
  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(thisMon.getDate() + monOffset);
  const nextMon = new Date(thisMon);
  nextMon.setDate(nextMon.getDate() + 7);
  const twoMon = new Date(thisMon);
  twoMon.setDate(thisMon.getDate() + 14);
  return { thisMon, nextMon, twoMon };
}

export function dueBucket(o: UiOrder): DueBucket {
  if (!o.shipDate) return "noDate";
  const diff = daysUntil(o.shipDate);
  if (diff !== null && diff <= 0) return "due";
  const { thisMon, nextMon, twoMon } = weekBoundaries();
  const d = new Date(o.shipDate);
  if (d >= thisMon && d < nextMon) return "thisWeek";
  if (d >= nextMon && d < twoMon) return "nextWeek";
  return "later";
}

export function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : "—";
}

export function fmtCurrency(v: number | null): string {
  return v == null ? "—" : "$" + v.toLocaleString("en-NZ");
}
