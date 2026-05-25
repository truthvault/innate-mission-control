import type { UiOrder } from "@/lib/monday/mapping";
import type { DayKey, Person, PlanRow } from "@/lib/monday/production-plan-mapping";

const PEOPLE: Person[] = ["nick", "dylan"];
const DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function weekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekTitle(start: Date) {
  const end = addDays(start, 4);
  const startMonth = start.toLocaleDateString("en-NZ", { month: "long" });
  const endMonth = end.toLocaleDateString("en-NZ", { month: "long" });
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}`
    : `${startMonth} ${start.getDate()}–${endMonth} ${end.getDate()}`;
}

function emptyDayTasks(): PlanRow["dayTasks"] {
  return Object.fromEntries(
    DAYS.map((day) => [day, Object.fromEntries(PEOPLE.map((person) => [person, null]))])
  ) as PlanRow["dayTasks"];
}

function fixtureRow({
  id,
  name,
  weekGroupId,
  weekGroupTitle,
  notes,
  tasks,
  order,
}: {
  id: string;
  name: string;
  weekGroupId: string;
  weekGroupTitle: string;
  notes: string;
  tasks: Partial<Record<DayKey, Partial<Record<Person, string>>>>;
  order?: { id: number; name: string };
}): PlanRow {
  const dayTasks = emptyDayTasks();
  for (const [day, people] of Object.entries(tasks) as Array<[DayKey, Partial<Record<Person, string>>]>) {
    for (const [person, text] of Object.entries(people) as Array<[Person, string | undefined]>) {
      dayTasks[day][person] = text ?? null;
    }
  }
  const linkedOrders = order
    ? [{ mondayItemId: String(order.id), name: order.name, boardId: "qa-orders", boardName: "QA Orders" }]
    : [];
  return {
    id,
    name,
    weekGroupId,
    weekGroupTitle,
    notes,
    mondayUrl: `https://example.invalid/tuesday-fixture/${id}`,
    updatedAt: new Date().toISOString(),
    dayTasks,
    linkedOrders,
    hasAppLinkedOrder: Boolean(order),
    appLinkedOrder: linkedOrders[0] ?? null,
  };
}

function fixtureOrder({
  id,
  customer,
  status,
  shipDate,
}: {
  id: number;
  customer: string;
  status: UiOrder["status"];
  shipDate: string;
}): UiOrder {
  return {
    id,
    customer,
    product: "Table",
    rawMondayItem: "Table",
    rawMondayStatus: status === "In Production" ? "In production" : status,
    rawMondayTopPanel: "Tōtara",
    rawMondayLegs: "Crossroads",
    value: 6200,
    quantity: 1,
    status,
    stepsKey: "TABLE_STEPS",
    currentStep: status === "Finished" ? 4 : status === "In Production" ? 2 : 1,
    stepNote: status === "Finished" ? "Fixture finished, awaiting QC/collection" : "Fixture order ready for workshop planning",
    orderedDate: isoDate(addDays(new Date(), -14)),
    shipDate,
    xero: "https://example.invalid/xero-fixture",
    xeroInvoiceNumber: `INV-QA-${id}`,
    freightRef: id === 9001 ? "QA-FREIGHT-001" : null,
    deliveryLocation: id === 9001 ? "Christchurch" : "Workshop collection",
    notes: "QA fixture order. Safe local browser testing only; not sourced from Monday or Supabase.",
  };
}

export function productionPlanFixtureData(now = new Date()): { rows: PlanRow[]; orders: UiOrder[]; syncedAt: string } {
  const start = weekStart(now);
  const nextStart = addDays(start, 7);
  const currentTitle = weekTitle(start);
  const nextTitle = weekTitle(nextStart);
  const currentWeekId = `qa-week-${isoDate(start)}`;
  const nextWeekId = `qa-week-${isoDate(nextStart)}`;
  const orders = [
    fixtureOrder({ id: 9001, customer: "QA Crossroads Table", status: "In Production", shipDate: isoDate(addDays(start, 18)) }),
    fixtureOrder({ id: 9002, customer: "QA Sample Follow-up", status: "Not Started", shipDate: isoDate(addDays(start, 25)) }),
  ];

  const rows = [
    fixtureRow({
      id: "qa-row-crossroads",
      name: "QA Crossroads Table",
      weekGroupId: currentWeekId,
      weekGroupTitle: currentTitle,
      notes: "Fixture row for browser drag/drop QA.",
      order: { id: 9001, name: "QA Crossroads Table" },
      tasks: {
        monday: { nick: "Machine top", dylan: "Prep steel base" },
        tuesday: { nick: "Sand and coat" },
        wednesday: { dylan: "QC + photos" },
      },
    }),
    fixtureRow({
      id: "qa-row-sample",
      name: "QA Sample Follow-up",
      weekGroupId: currentWeekId,
      weekGroupTitle: currentTitle,
      notes: "Fixture sample/admin row.",
      order: { id: 9002, name: "QA Sample Follow-up" },
      tasks: {
        monday: { dylan: "Cut sample block" },
        thursday: { nick: "Customer update" },
      },
    }),
    fixtureRow({
      id: "qa-row-internal",
      name: "No customer / Internal",
      weekGroupId: nextWeekId,
      weekGroupTitle: nextTitle,
      notes: "Fixture internal tasks for lane coverage.",
      tasks: {
        monday: { nick: "Sharpen planer knives" },
        friday: { dylan: "Clean finish room" },
      },
    }),
  ];

  return { rows, orders, syncedAt: new Date().toISOString() };
}

export function productionPlanFixtureAllowed() {
  return process.env.QA_STABILITY_MODE === "true" || process.env.NODE_ENV === "test";
}
