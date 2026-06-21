export type WorkshopProcessOwner = "Nick" | "Dylan" | "Guido" | "Other";
export type WorkshopProcessTask = {
  key: string;
  title: string;
  detail: string;
  owner: WorkshopProcessOwner;
  scheduledDate: string;
  estimatedHours: number;
  sortOrder: number;
};

export const WORKSHOP_PROCESS_RULES = {
  people: {
    Nick: { workshopDays: [1, 2, 3], label: "Nick works workshop Mon-Wed" },
    Dylan: { workshopDays: [1, 2, 3, 4], label: "Dylan works workshop Mon-Thu" },
    Guido: { workshopDays: [1, 2, 3, 4, 5], label: "Guido owns admin/freight for now" },
    Other: { workshopDays: [1, 2, 3, 4, 5], label: "Confirm owner" },
  },
  supplierLeadTimes: {
    steelFabricationPowdercoat: {
      normalWorkingDays: 10,
      saferWorkingDays: 15,
      label: "steel fabrication/powder coating is normally 2 weeks; 3 weeks safer",
    },
    westimberLaminatedPanel: {
      normalWorkingDays: 10,
      saferWorkingDays: 10,
      label: "Westimber laminated panels are normally about 2 weeks",
    },
    precisionWoodworksCncShapeCut: {
      normalWorkingDays: 10,
      saferWorkingDays: 10,
      label: "Precision Woodworks CNC shape cutting adds about 2 weeks after Westimber",
    },
  },
  finishing: {
    minWorkingDaysBetweenCoats: 1,
    idealWorkingDaysBetweenCoats: 2,
    minCureWorkingDaysAfterFinalCoat: 2,
    idealCure: "a full week or more when the schedule allows",
    clearCoats: 3,
    blackwashStainCoats: 2,
    blackwashClearCoats: 2,
  },
  freightOwner: "Guido",
  trust: {
    unknownStageLabel: "Unknown - needs Nick/Guido check",
    bankVisiblePaidLabel: "Paid - bank visible",
    akahuSyncIssueLabel: "Payment seen in bank - Akahu/Xero sync needs fixing",
    staleTaskLabel: "Stale/unverified",
    supplierProofMissingLabel: "Supplier proof missing",
    readyForWorkshopLabel: "Ready for workshop",
    readyForDispatchAdminLabel: "Ready for dispatch admin",
  },
} as const;

export function addBusinessDays(from: Date, count: number) {
  const date = new Date(from);
  let remaining = count;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

export function addBusinessDaysIso(value: string, count: number) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return addBusinessDays(date, count).toISOString().slice(0, 10);
}

export function latestDate(...dates: Date[]) {
  return dates.reduce((latest, date) => date.getTime() > latest.getTime() ? date : latest, dates[0]);
}

export function maxIsoDate(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))).sort().at(-1) || null;
}

export function isWorkshopDayForOwner(owner: WorkshopProcessOwner, date: Date) {
  const days = WORKSHOP_PROCESS_RULES.people[owner]?.workshopDays || WORKSHOP_PROCESS_RULES.people.Other.workshopDays;
  return (days as readonly number[]).includes(date.getDay());
}

export function isWorkshopIsoDayForOwner(owner: WorkshopProcessOwner, isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00`);
  return !Number.isNaN(date.getTime()) && isWorkshopDayForOwner(owner, date);
}

export function nextOwnerWorkshopDate(owner: WorkshopProcessOwner, from: Date) {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  while (!isWorkshopDayForOwner(owner, date)) date.setDate(date.getDate() + 1);
  return date;
}

export function nextOwnerWorkshopIso(owner: WorkshopProcessOwner, isoDate: string) {
  let current = isoDate;
  while (!isWorkshopIsoDayForOwner(owner, current)) current = addBusinessDaysIso(current, 1);
  return current;
}

export function afterOwnerWorkshopTaskIso(owner: WorkshopProcessOwner, previousIso: string, minimumWorkingDays = 1) {
  return nextOwnerWorkshopIso(owner, addBusinessDaysIso(previousIso, minimumWorkingDays));
}

export function supplierLeadTimeMatches(text: string) {
  const normalised = text.toLowerCase();
  const waits: Array<{ key: string; label: string; normalWorkingDays: number; saferWorkingDays: number }> = [];
  if (/steel|powder\s*coat|powdercoat|crossroads|asterix|loop\s*base|table\s*base/.test(normalised)) {
    waits.push({ key: "steel", ...WORKSHOP_PROCESS_RULES.supplierLeadTimes.steelFabricationPowdercoat });
  }
  if (/westimber|laminat|laminated\s+panel|panel\s+lamination|glue\s*up|glue-up/.test(normalised)) {
    waits.push({ key: "westimber", ...WORKSHOP_PROCESS_RULES.supplierLeadTimes.westimberLaminatedPanel });
  }
  return waits;
}

export function supplierReadyDateForText(text: string, poDate: Date, mode: "normal" | "safer" = "safer") {
  const waits = supplierLeadTimeMatches(text)
    .map((rule) => addBusinessDays(poDate, mode === "normal" ? rule.normalWorkingDays : rule.saferWorkingDays));
  return waits.length > 0 ? latestDate(...waits) : null;
}

export function supplierReadyIsoForText(text: string, poDate: string, mode: "normal" | "safer" = "safer") {
  const waits = supplierLeadTimeMatches(text)
    .map((rule) => addBusinessDaysIso(poDate, mode === "normal" ? rule.normalWorkingDays : rule.saferWorkingDays));
  return maxIsoDate(...waits);
}

export function supplierWaitDetailForText(text: string) {
  const waits = supplierLeadTimeMatches(text).map((rule) => rule.label);
  return waits.length > 0 ? ` Supplier timing allowed: ${waits.join("; ")}.` : "";
}

export function needsTableShapeCut(text: string) {
  return /\b(round|oval|danish\s+oval|classic\s+oval|pebble)\b/.test(text.toLowerCase());
}

export function needsPrecisionWoodworksCnc(text: string) {
  const normalised = text.toLowerCase();
  if (/\b(rectangle|rectangular|square|round|pill)\b/.test(normalised)) return false;
  return /\b(danish\s+oval|classic\s+oval|oval|pebble|organic|custom\s+shape|shape)\b/.test(normalised);
}

export function precisionWoodworksReadyDate(from: Date, mode: "normal" | "safer" = "safer") {
  const rule = WORKSHOP_PROCESS_RULES.supplierLeadTimes.precisionWoodworksCncShapeCut;
  return addBusinessDays(from, mode === "normal" ? rule.normalWorkingDays : rule.saferWorkingDays);
}

export function precisionWoodworksReadyIso(from: string, mode: "normal" | "safer" = "safer") {
  const rule = WORKSHOP_PROCESS_RULES.supplierLeadTimes.precisionWoodworksCncShapeCut;
  return addBusinessDaysIso(from, mode === "normal" ? rule.normalWorkingDays : rule.saferWorkingDays);
}

export function supplierWaitDetailWithPrecisionForText(text: string) {
  const detail = supplierWaitDetailForText(text);
  if (!needsPrecisionWoodworksCnc(text)) return detail;
  const precision = WORKSHOP_PROCESS_RULES.supplierLeadTimes.precisionWoodworksCncShapeCut.label;
  return detail
    ? detail.replace(/\.$/, `; ${precision}.`)
    : ` Supplier timing allowed: ${precision}.`;
}

function includesSteelDependency(text: string) {
  return /steel|powder\s*coat|powdercoat|crossroads|asterix|loop\s*base|table\s*base/.test(text.toLowerCase());
}

function isColourwashFinish(text: string) {
  return /\b(blackwash|black\s+wash|whitewash|white\s+wash)\b/.test(text.toLowerCase());
}

function diningTableSupplierReadyIso(text: string, poDate: string) {
  const westimberReady = addBusinessDaysIso(poDate, WORKSHOP_PROCESS_RULES.supplierLeadTimes.westimberLaminatedPanel.saferWorkingDays);
  const steelReady = includesSteelDependency(text)
    ? addBusinessDaysIso(poDate, WORKSHOP_PROCESS_RULES.supplierLeadTimes.steelFabricationPowdercoat.saferWorkingDays)
    : null;
  return maxIsoDate(westimberReady, steelReady) || westimberReady;
}

function diningTableSupplierDetail(text: string) {
  const waits: string[] = [WORKSHOP_PROCESS_RULES.supplierLeadTimes.westimberLaminatedPanel.label];
  if (includesSteelDependency(text)) waits.push(WORKSHOP_PROCESS_RULES.supplierLeadTimes.steelFabricationPowdercoat.label);
  if (needsPrecisionWoodworksCnc(text)) waits.push(WORKSHOP_PROCESS_RULES.supplierLeadTimes.precisionWoodworksCncShapeCut.label);
  return ` Supplier timing allowed: ${waits.join("; ")}.`;
}

export function diningTableFinishTasks(text: string): Array<{ key: string; title: string; detail: string; estimatedHours: number }> {
  if (isColourwashFinish(text)) {
    return [
      { key: "first-stain", title: "Sand and first stain coat", detail: "Surface prep and first colourwash/stain coat.", estimatedHours: 1 },
      { key: "second-stain", title: "Second stain coat", detail: "Apply second colourwash/stain coat. One working day between coats minimum; two is better when possible.", estimatedHours: 1 },
      { key: "first-clear", title: "First clear coat", detail: "Apply first clear coat over the colourwash/stain coats.", estimatedHours: 1 },
      { key: "final-clear", title: "Final clear coat", detail: "Apply final clear coat for the finish system.", estimatedHours: 1 },
    ];
  }
  return [
    { key: "sand-coat", title: "Sand and coat", detail: "Surface prep and first clear coat.", estimatedHours: 1 },
    { key: "second-coat", title: "Second coat", detail: "Apply second clear coat. One working day between coats minimum; two is better when possible.", estimatedHours: 1 },
    { key: "third-clear", title: "3rd coat (clear final)", detail: "Apply third/final clear coat.", estimatedHours: 1 },
  ];
}

export function buildDiningTableProcessPlan(input: { orderId: string; text: string; startIso: string }): WorkshopProcessTask[] {
  const { orderId, text, startIso } = input;
  const processTasks: WorkshopProcessTask[] = [];
  const addTask = (key: string, title: string, detail: string, owner: WorkshopProcessOwner, scheduledDate: string, estimatedHours: number) => {
    const safeDate = nextOwnerWorkshopIso(owner, scheduledDate);
    processTasks.push({
      key,
      title,
      detail,
      owner,
      scheduledDate: safeDate,
      estimatedHours,
      sortOrder: processTasks.length * 10 + 10,
    });
    return safeDate;
  };

  const orderLoadedDate = addTask("order-loaded", "Order Loaded", "Guido checks invoice/spec/payment/customer due promise/supplier needs/delivery method before workshop trust.", "Guido", startIso, 1);
  const poDate = addTask("pos-sent", "POs sent", "Raise or confirm required purchase orders and material dependencies before workshop work starts.", "Nick", orderLoadedDate, 0.5);
  const timberDate = addTask("timber-pulled", "Timber pulled", "Pull timber and strap it ready for Westimber collection/laminating where required.", "Dylan", afterOwnerWorkshopTaskIso("Dylan", poDate), 1);

  const westimberReadyDate = addBusinessDaysIso(poDate, WORKSHOP_PROCESS_RULES.supplierLeadTimes.westimberLaminatedPanel.saferWorkingDays);
  const supplierReadyDate = diningTableSupplierReadyIso(text, poDate);
  const precisionCncNeeded = needsPrecisionWoodworksCnc(text);
  const precisionSendDate = precisionCncNeeded
    ? addTask("precision-cnc", "Precision Woodworks CNC", "Send Westimber-laminated panel to Precision Woodworks for CNC shape cutting. Non-standard shapes add about 2 weeks after Westimber.", "Guido", westimberReadyDate, 0.25)
    : null;
  const precisionReadyDate = precisionSendDate ? precisionWoodworksReadyIso(precisionSendDate) : null;
  const pinpointReturnDate = precisionReadyDate
    ? addTask("pinpoint-return", "Book Pinpoint return", "Book Pinpoint to collect the CNC-cut panel(s) from Precision Woodworks and bring them back to the workshop.", "Guido", precisionReadyDate, 0.25)
    : null;

  const materialsReadyDate = addTask(
    "materials-received",
    "Materials received",
    `Confirm laminated top/timber, base, hardware, and any ordered materials are in hand before sanding and coating.${diningTableSupplierDetail(text)}`,
    "Dylan",
    maxIsoDate(afterOwnerWorkshopTaskIso("Dylan", timberDate), supplierReadyDate, precisionReadyDate, pinpointReturnDate) || afterOwnerWorkshopTaskIso("Dylan", timberDate),
    0.5
  );

  const cutNeeded = needsTableShapeCut(text);
  const cutDate = cutNeeded && !precisionCncNeeded
    ? addTask("cut-prep", "Cut / machine / prep", "Shape-cut round top or resolve construction details before stress cuts.", "Nick", afterOwnerWorkshopTaskIso("Nick", materialsReadyDate), 1.5)
    : null;
  const stressDate = addTask("stress-cuts", "Stress cuts", "Stress cuts happen just before sanding and coating.", "Dylan", afterOwnerWorkshopTaskIso("Dylan", cutDate || materialsReadyDate), 1);

  let finishDate = stressDate;
  for (const finishTask of diningTableFinishTasks(text)) {
    finishDate = addTask(finishTask.key, finishTask.title, finishTask.detail, "Dylan", afterOwnerWorkshopTaskIso("Dylan", finishDate, WORKSHOP_PROCESS_RULES.finishing.minWorkingDaysBetweenCoats), finishTask.estimatedHours);
  }

  const cureDate = addTask("curing", "Curing", "Minimum two working days after final coat before final handling; a full week or more is better when possible.", "Dylan", addBusinessDaysIso(finishDate, WORKSHOP_PROCESS_RULES.finishing.minCureWorkingDaysAfterFinalCoat), 0.5);
  const qcDate = addTask("qc-photos", "QC + photos", "Final proof photos, spec check, and customer-ready quality review.", "Nick", afterOwnerWorkshopTaskIso("Nick", cureDate), 1);
  const assembleDate = addTask("assemble-box", "Assemble / box", "Assemble for local delivery or prepare the piece for final protection.", "Dylan", afterOwnerWorkshopTaskIso("Dylan", qcDate), 1);
  const packDate = addTask("pack-wrap", "Pack / wrap", "Pack, protect, and prepare for delivery or collection.", "Dylan", afterOwnerWorkshopTaskIso("Dylan", assembleDate), 0.75);
  const balanceInvoiceDate = addTask("balance-invoice", "Balance invoice", "Guido issues/checks the balance invoice before release.", "Guido", packDate, 0.5);
  const freightDate = addTask("book-freight", "Book freight / delivery", "Guido books freight or confirms local delivery/collection details for now.", "Guido", afterOwnerWorkshopTaskIso("Guido", balanceInvoiceDate), 0.5);
  const paidReleaseDate = addTask("confirm-paid-release", "Confirm paid before release", "Guido confirms balance/payment is paid before the order leaves or is collected.", "Guido", afterOwnerWorkshopTaskIso("Guido", freightDate), 0.25);
  addTask("customer-update", "Customer update", "Guido sends the confirmed dispatch, delivery, or collection update.", "Guido", afterOwnerWorkshopTaskIso("Guido", paidReleaseDate), 0.25);

  return processTasks.map((task) => ({ ...task, key: `${orderId}:${task.key}` }));
}
