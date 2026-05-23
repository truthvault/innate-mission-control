#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildDailyBrief } from "../lib/tuesday/daily-brief.ts";

const now = "2026-05-24T21:00:00.000Z";

function lead(overrides) {
  return {
    id: "lead-1",
    createdAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    customerName: "Default Lead",
    source: "website",
    productCategory: "Dining table",
    estimatedValue: 8000,
    status: "quoted",
    priority: "normal",
    nextAction: "Follow up",
    sourceSystem: "supabase",
    ...overrides,
  };
}

function order(overrides) {
  return {
    id: 1001,
    customer: "Default Order",
    product: "Table",
    rawMondayItem: "Table",
    rawMondayStatus: "In production",
    rawMondayTopPanel: null,
    rawMondayLegs: null,
    value: 12000,
    quantity: 1,
    status: "In Production",
    stepsKey: "TABLE_STEPS",
    currentStep: 3,
    stepNote: "Coating",
    orderedDate: "2026-05-10",
    shipDate: "2026-05-29",
    xero: "INV-1001",
    xeroInvoiceNumber: "INV-1001",
    freightRef: "MF-123",
    deliveryLocation: "Christchurch",
    notes: "",
    ...overrides,
  };
}

const brief = buildDailyBrief({
  now,
  leads: {
    syncedAt: now,
    source: "supabase",
    rows: [
      lead({
        id: "lead-hot-overdue",
        customerName: "Hot Cash Lead",
        priority: "hot",
        estimatedValue: 42000,
        nextFollowUpAt: "2026-05-23T20:00:00.000Z",
        nextAction: "Send revised quote",
      }),
      lead({
        id: "lead-no-next-action",
        customerName: "No Next Action Lead",
        priority: "hot",
        estimatedValue: 17000,
        nextFollowUpAt: undefined,
        nextAction: undefined,
      }),
      lead({ id: "lead-parked", customerName: "Parked Lead", status: "parked", priority: "hot", estimatedValue: 60000 }),
    ],
  },
  orders: {
    syncedAt: now,
    source: "cache",
    warnings: [],
    items: [
      order({ id: 2001, customer: "Late Promise", shipDate: "2026-05-23", status: "In Production", freightRef: null }),
      order({ id: 2002, customer: "Blocked Detail", shipDate: "2026-05-28", status: "Not Started", xero: null, xeroInvoiceNumber: null, deliveryLocation: null }),
      order({ id: 2003, customer: "Collected Done", shipDate: "2026-05-20", status: "Collected" }),
    ],
  },
  sampleStock: {
    syncedAt: now,
    source: "snapshot",
    board: {
      boardId: "samples",
      boardName: "Samples",
      cells: [],
      summary: {
        total: 18,
        outCount: 2,
        lowCount: 3,
        okCount: 4,
        readyFullSets: 1,
        byType: [],
        byFinish: [],
        topUps: [
          { sampleType: "Customer samples", species: "Rimu", finish: "Clear", count: 0, level: "out", mondayItemId: "s1", mondayUrl: "https://example.test/s1" },
          { sampleType: "Designer samples", species: "Totara", finish: "Country Bark", count: 1, level: "low", mondayItemId: "s2", mondayUrl: "https://example.test/s2" },
        ],
      },
    },
  },
  xero: { source: "not_connected", label: "Xero not connected", tone: "warning" },
});

assert.equal(brief.title, "Owner Daily Brief");
assert.equal(brief.decision.label, "Follow up Hot Cash Lead");
assert.match(brief.decision.detail, /\$42,000/);
assert.equal(brief.summary.hotLeads, 2);
assert.equal(brief.summary.productionRisks, 2);
assert.equal(brief.summary.sampleIssues, 5);
assert.equal(brief.summary.sourcesWithWarnings, 2);

assert.deepEqual(
  brief.sections.map((section) => section.id),
  ["decisions", "leads", "production", "samples", "cash", "source-health"],
);

const leadsSection = brief.sections.find((section) => section.id === "leads");
assert.equal(leadsSection.items.length, 2);
assert.equal(leadsSection.items[0].title, "Hot Cash Lead");
assert.equal(leadsSection.items[0].tone, "danger");
assert.match(leadsSection.items[1].detail, /Missing next action/);

const productionSection = brief.sections.find((section) => section.id === "production");
assert.equal(productionSection.items.length, 2);
assert.match(productionSection.items[0].detail, /late/i);
assert.match(productionSection.items[1].detail, /Not started/);

const sourceSection = brief.sections.find((section) => section.id === "source-health");
assert(sourceSection.items.some((item) => item.title === "Samples stock is using a snapshot"));
assert(sourceSection.items.some((item) => item.title === "Xero cash signal not connected"));

const quietBrief = buildDailyBrief({
  now,
  leads: { syncedAt: now, source: "supabase", rows: [] },
  orders: { syncedAt: now, source: "cache", warnings: [], items: [] },
  sampleStock: { syncedAt: now, source: "cache", board: null },
  xero: { source: "not_connected", label: "Xero not connected", tone: "warning" },
});

assert.equal(quietBrief.decision.label, "No action needed from you today");
assert(quietBrief.sections.find((section) => section.id === "decisions").items[0].detail.includes("No hot leads or production promises"));

console.log("daily brief tests passed");
