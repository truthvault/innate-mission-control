import type { QuoteScenarioInput } from "./engine.ts";
import { freshSnapshot } from "./innateDefaults.ts";

const NOW = "2026-05-27T12:00:00+12:00";

export function kelvenPanelExample(): QuoteScenarioInput {
  return {
    requestName: "Kelven add-on panels/shelves",
    customerName: "Kelven",
    productArea: "benchtop_panel",
    scenarioName: "Four panels with Westimber handling allowance",
    now: NOW,
    targetGrossMarginPercent: 50,
    enforceTargetMargin: true,
    costLines: [
      {
        label: "Four small Totara panels/shelves working cost",
        lineType: "material",
        quantity: 1,
        unit: "job",
        sourceSnapshot: freshSnapshot({
          priceCode: "kelven-panels-working-cost-2026-05-27",
          description: "Kelven shelf/panel add-on working cost from Council correction thread",
          unit: "job",
          unitCostExGst: 455,
          supplierName: "Westimber",
          sourceType: "manual",
          sourceLabel: "Guido Council quote working 2026-05-27",
          sourceCapturedAt: NOW,
          freshnessDays: 14,
        }),
      },
      {
        label: "Agreed pickup/dropoff allowance",
        lineType: "supplier_service",
        quantity: 1,
        unit: "job",
        unitCostExGst: 50,
        requiresFreshPrice: false,
        businessRuleKey: "westimber_whole_job_pickup_dropoff",
        notes: "Only add $50 because Westimber handles the whole job; do not add another invented transport chain.",
      },
    ],
    assumptions: [
      "Standard gross margin is 50%, not a 50% markup.",
      "Westimber handles the whole supplier pickup/dropoff flow for this scoped job.",
      "Customer-facing wording must not expose internal cost/margin logic.",
    ],
    customerSummary: "Draft quote add-on for the four Totara panels/shelves, using the agreed Westimber handling allowance.",
    xero: {
      contactName: "Kelven",
      reference: "Kelven panels add-on",
      title: "Custom Totara panels",
      lineDescription: "Custom Totara panels\nDimensions/spec: as confirmed by email\nTimber: Northland Totara\nFinish: dressed/sanded ready for collection\nAllowance: Westimber pickup/dropoff included as agreed",
    },
  };
}

export function jamesShedShopExample(): QuoteScenarioInput {
  return {
    requestName: "James / The Shed Shop long benchtop comparison",
    customerName: "James Hawkes",
    productArea: "benchtop_panel",
    scenarioName: "600mm one-piece historical comparison",
    now: NOW,
    targetGrossMarginPercent: 50,
    enforceTargetMargin: false,
    explicitSellPriceExGst: 4675,
    costLines: [
      {
        label: "Panel calculator base cost",
        lineType: "material",
        quantity: 1,
        unit: "job",
        sourceSnapshot: freshSnapshot({
          priceCode: "james-600-one-piece-calculator-base-2026-05-06",
          description: "7540 x 600 x 33 Canterbury Nitens, sanded/coated, no cutout, calculator output",
          unit: "job",
          unitCostExGst: 2008.65,
          supplierName: "Website calculator",
          sourceType: "calculator",
          sourceLabel: "Innate panel calculator James reference 2026-05-06",
          sourceCapturedAt: "2026-05-06T12:00:00+12:00",
          freshnessDays: 365,
        }),
      },
      {
        label: "Finger-jointing / long process",
        lineType: "supplier_service",
        quantity: 1,
        unit: "job",
        unitCostExGst: 400,
        requiresFreshPrice: false,
        notes: "Guido clarified this was the practical long-length/finger-jointing allowance.",
      },
      {
        label: "Riverhead freight/packaging",
        lineType: "freight",
        quantity: 1,
        unit: "job",
        sourceSnapshot: freshSnapshot({
          priceCode: "james-riverhead-freight-2026-05-05",
          description: "Freight/packaging assumption to Riverhead Auckland",
          unit: "job",
          unitCostExGst: 288,
          supplierName: "Mainfreight/manual",
          sourceType: "manual",
          sourceLabel: "James Shed Shop quote reference 2026-05-05",
          sourceCapturedAt: "2026-05-05T12:00:00+12:00",
          freshnessDays: 365,
        }),
      },
    ],
    assumptions: [
      "This is a historical comparison, so below-target margin is a warning rather than a blocker.",
      "Do not mention calculator reconciliation to the customer.",
      "Two-panel option may be operationally easier without being materially cheaper.",
    ],
    customerSummary: "Historical quote-control comparison for the 7540mm benchtop options.",
  };
}

export function stalePriceExample(): QuoteScenarioInput {
  return {
    requestName: "Stale supplier price guard",
    now: NOW,
    targetGrossMarginPercent: 50,
    costLines: [
      {
        label: "Old supplier timber price",
        lineType: "material",
        quantity: 1,
        sourceSnapshot: freshSnapshot({
          priceCode: "old-timber-price",
          description: "Old supplier price used to prove stale-price blocking",
          unit: "job",
          unitCostExGst: 1000,
          supplierName: "Example supplier",
          sourceType: "supplier_email",
          sourceLabel: "Old supplier email",
          sourceCapturedAt: "2026-04-01T12:00:00+12:00",
          freshnessDays: 30,
        }),
      },
    ],
    customerSummary: "Should not be quote-ready because the supplier price is stale.",
  };
}

export function missingCostExample(): QuoteScenarioInput {
  return {
    requestName: "Missing machining/freight guard",
    now: NOW,
    targetGrossMarginPercent: 50,
    costLines: [
      {
        label: "CNC machining still unknown",
        lineType: "machining",
        quantity: 1,
        unit: "job",
        unitCostExGst: null,
      },
    ],
    customerSummary: "Should ask for machining cost before quoting.",
  };
}
