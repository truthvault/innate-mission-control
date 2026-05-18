import assert from "node:assert/strict";
import { isRecentSampleFollowUp, sortSampleFollowUps, sampleFollowUpLabel } from "../lib/leads/sample-followups.mjs";

const base = {
  id: "lead-1",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z",
  customerName: "Amanda",
  status: "waiting_on_customer",
  priority: "normal",
  sourceSystem: "supabase",
};

const now = new Date("2026-05-18T12:00:00.000Z");

assert.equal(
  isRecentSampleFollowUp({ ...base, sampleDeliveredAt: "2026-05-13", sampleStatus: "delivered" }, now),
  true,
  "delivered samples inside 21 days should appear in the sample follow-up lane",
);

assert.equal(
  isRecentSampleFollowUp({ ...base, sampleSentAt: "2026-05-12", sampleStatus: "sent" }, now),
  true,
  "samples sent 3+ days ago without delivery confirmation should appear",
);

assert.equal(
  isRecentSampleFollowUp({ ...base, notes: "Rimu sample sent with courier. Follow up when received." }, now),
  true,
  "legacy notes mentioning sample sent should appear before fields are fully backfilled",
);

assert.equal(
  isRecentSampleFollowUp({ ...base, sampleDeliveredAt: "2026-05-12", sampleStatus: "followed_up" }, now),
  false,
  "already followed-up sample leads should not remain in the lane",
);

assert.equal(
  isRecentSampleFollowUp({ ...base, status: "won", sampleDeliveredAt: "2026-05-13" }, now),
  false,
  "closed leads should not appear in the active sample follow-up lane",
);

const sorted = sortSampleFollowUps([
  { ...base, id: "low", customerName: "Low value", estimatedValue: 500, sampleSentAt: "2026-05-10", sampleStatus: "sent" },
  { ...base, id: "delivered", customerName: "Delivered", estimatedValue: 1000, sampleDeliveredAt: "2026-05-13", sampleStatus: "delivered" },
  { ...base, id: "high", customerName: "High value", estimatedValue: 8000, sampleSentAt: "2026-05-11", sampleStatus: "sent" },
], now);
assert.deepEqual(sorted.map((lead) => lead.id), ["delivered", "high", "low"], "delivered/no-follow-up leads come first, then higher value sent leads");

assert.equal(
  sampleFollowUpLabel({ ...base, sampleSpecies: "Rimu, Totara", sampleDeliveredAt: "2026-05-13", sampleStatus: "delivered" }),
  "Delivered 13 May · Rimu, Totara",
  "sample cards should show a compact delivery/species label",
);

console.log("lead sample follow-up tests passed");
