#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const orderDisplay = readFileSync(new URL('../lib/production/order-display.ts', import.meta.url), 'utf8');

assert.match(source, /function OrderHealthStrip/, 'Production Plan should show the existing order health strip');
assert.match(source, /Active Orders/, 'Order health strip should include active-order count context');
assert.match(source, /Watch/, 'Order health strip should include watch count context');
assert.match(source, /Blocked/, 'Order health strip should include blocked-order count context');
assert.doesNotMatch(source, /function WorkshopHandoffSummary/, 'Production Plan should not render the removed workshop handoff summary');
assert.doesNotMatch(source, /Workshop handoff/, 'Workshop handoff copy should stay removed from the Production Plan UI');
assert.doesNotMatch(source, /Source: order state \+ Tuesday workflow/, 'Order modal should avoid misleading source-of-truth wording');
assert.doesNotMatch(source, /Source fields/, 'Order modal should not show the old duplicate source-fields block');
assert.doesNotMatch(source, /Order data/, 'Order modal should not show the old duplicate order-data block');
assert.doesNotMatch(source, /Next Action/, 'Order side panels should not reintroduce the cluttered next-action card');
assert.doesNotMatch(source, /Linked plan tasks/, 'Order modal should not split tasks into linked-plan-task wording');
assert.doesNotMatch(source, /Xero: Not found/, 'Order modal should not show a contradictory Xero not-found badge beside saved invoice data');
assert.match(source, /eyebrow="Order record" title="Production path"/, 'Order modal should describe the order-record production path plainly');
assert.match(source, /Production path/, 'Order modal should use a consistent production-path section label');
assert.match(source, /function OrderTasksPanel/, 'Order modal should use the unified task panel');
assert.match(source, /Add task to job/, 'Unified task panel should make adding a job task obvious');
assert.match(source, /Delete job task/, 'Unified task panel should expose safe delete controls for Tuesday-added tasks');
assert.match(source, /Delete now/, 'Deleting Tuesday-added order tasks should use an inline two-step confirmation');
assert.doesNotMatch(source, /window\.(confirm|prompt)/, 'Tuesday order flows should not use native browser confirms or prompts');
assert.match(source, /No scheduled tasks found yet/, 'Side panel should use schedule wording instead of linked Production Plan jargon');
assert.match(source, /function formatRailDueDate/, 'Right rail should use compact due-date text for scannability');
assert.match(source, /formatRailDueDate\(order\)/, 'Right rail cards should avoid long repeated no-due-date text');
assert.doesNotMatch(source, /No obvious schedule flag/, 'Order health copy should avoid awkward no-obvious-flag wording');
assert.match(source, /No schedule flags/, 'Order health copy should use calmer schedule-flag language');
assert.match(source, /Current stage:/, 'Order task panel should describe the current production stage plainly');
assert.match(source, /next task:/, 'Order task panel should use concise next-task wording');
assert.match(source, /from "@\/lib\/production\/order-display"/, 'Order modal should use the shared production-flow template source');
assert.doesNotMatch(source, /const PANEL_STEPS: Step\[\]/, 'Production Plan should not carry a copied panel flow template');
assert.match(orderDisplay, /Cut \/ prep/, 'Panel flow should use neutral cut/prep wording unless a specific CNC template requires CNC');
assert.doesNotMatch(orderDisplay, /CNC \/ Cut/, 'Panel flow should not claim CNC is required for every panel order');
assert.doesNotMatch(source, /maxHeight: "calc\(100vh - 96px\)"/, 'Selected order side panel should use the page scroll instead of its own nested scrollbar');
assert.match(source, /Order linked/, 'Production Plan should use clearer Order linked copy instead of Connected');
assert.match(source, /const reason = orderHealthReason\(order\)/, 'Blocked/watch order cards should show the concrete reason');
assert.match(source, /tasks today/, 'Today filter chips should say tasks today instead of ambiguous today');
assert.doesNotMatch(source, /\bConnected\b/, 'Production Plan UI should not use ambiguous Connected copy');
