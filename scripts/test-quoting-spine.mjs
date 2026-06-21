#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildQuoteScenario, buildXeroDraftPayload, formatQuoteMarkdown } from "../lib/quoting/engine.ts";
import { kelvenPanelExample, jamesShedShopExample, missingCostExample, stalePriceExample } from "../lib/quoting/examples.ts";

const kelven = buildQuoteScenario(kelvenPanelExample());
assert.equal(kelven.readyToQuote, true, "Kelven should be ready for Guido review");
assert.equal(kelven.subtotalCostExGst, 505, "Kelven cost includes $455 working cost + $50 Westimber handling");
assert.equal(kelven.sellPriceExGst, 1010, "50% gross margin means sell is 2x cost, not cost plus 50%");
assert.equal(kelven.sellPriceInclGst, 1161.5, "GST is added after the ex GST sell price");
assert.equal(kelven.grossMarginPercent, 50);
assert.deepEqual(kelven.blockers, []);
assert.ok(kelven.assumptions.some((item) => /not a 50% markup/i.test(item)));
assert.ok(kelven.costLines.some((line) => line.label.includes("pickup/dropoff") && line.unitCostExGst === 50));

const kelvenXero = buildXeroDraftPayload(kelvenPanelExample(), kelven);
assert.equal(kelvenXero.mode, "dry_run");
assert.equal(kelvenXero.docType, "quote");
assert.equal(kelvenXero.lineAmountTypes, "EXCLUSIVE");
assert.equal(kelvenXero.lineItems[0].unitAmount, 1010);
assert.equal(kelvenXero.lineItems[0].taxType, "OUTPUT2");
assert.match(kelvenXero.terms, /Payment confirms the order/i);
assert.doesNotMatch(kelvenXero.terms, /Payment due on acceptance before collection/i);

const stale = buildQuoteScenario(stalePriceExample());
assert.equal(stale.readyToQuote, false, "stale supplier prices must block quote-ready status");
assert.ok(stale.blockers.some((blocker) => blocker.code === "stale_price"));

const missing = buildQuoteScenario(missingCostExample());
assert.equal(missing.readyToQuote, false, "missing machining/freight costs must block quote-ready status");
assert.ok(missing.blockers.some((blocker) => blocker.code === "missing_cost"));

const james = buildQuoteScenario(jamesShedShopExample());
assert.equal(james.readyToQuote, true, "historical comparison remains usable because enforceTargetMargin is false");
assert.equal(james.subtotalCostExGst, 2696.65);
assert.equal(james.sellPriceExGst, 4675);
assert.equal(james.grossMarginPercent, 42.3);
assert.ok(james.warnings.some((warning) => warning.code === "below_target_margin_warning"));

const markdown = formatQuoteMarkdown(kelven);
assert.match(markdown, /Status: ready for Guido review/);
assert.match(markdown, /Cost Lines/);
assert.match(markdown, /Customer Wording/);

const simple = buildQuoteScenario({
  requestName: "Margin semantics check",
  now: "2026-05-27T12:00:00+12:00",
  targetGrossMarginPercent: 50,
  costLines: [{ label: "Known internal test cost", lineType: "material", unitCostExGst: 100, requiresFreshPrice: false }],
  customerSummary: "Internal test only.",
});
assert.equal(simple.sellPriceExGst, 200, "50% gross margin must not be treated as a 50% markup");
assert.equal(simple.grossMarginPercent, 50);

console.log("Quoting spine tests OK");
console.log(`- Kelven ex GST ${kelven.sellPriceExGst}, incl GST ${kelven.sellPriceInclGst}, margin ${kelven.grossMarginPercent}%`);
console.log(`- Stale guard blockers: ${stale.blockers.map((item) => item.code).join(", ")}`);
console.log(`- Missing-cost guard blockers: ${missing.blockers.map((item) => item.code).join(", ")}`);
