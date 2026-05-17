import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(source, /newOrderPalette/, 'PlanClient should retain the base new-order palette');
assert.match(source, /REVIEW_GLOW/, 'PlanClient should centralise the gold review-mode palette');
assert.match(source, /REVIEW_GLOW\.bg/, 'Shown new-order cards should use the shared gold background token');
assert.match(source, /REVIEW_GLOW\.borderStrong/, 'Shown new-order cards should use the shared gold border token');
assert.match(source, /REVIEW_GLOW\.color/, 'Shown new-order cards should use the shared gold accent token');
assert.match(source, /suggestedStepDragId/, 'Suggested new-order tasks should be draggable while planning');
assert.match(source, /Close full task list/, 'The right-rail full task list button should be able to close the panel');
assert.match(source, /currentAndUpcoming\.slice\(0, 6\)/, 'Production Plan should keep the active week plus five future weeks visible');
assert.match(source, /forcePlanningLanes/, 'Future visible weeks should render empty Nick/Dylan drop lanes');
assert.match(source, /Approve draft plan/, 'The approve button should describe a Tuesday draft plan, not a Monday write');
assert.doesNotMatch(source, /Drag to plan<\/div>/, 'Visible draft task cards should not carry the old extra Drag to plan badge');

console.log('plan new-order colour tests passed');
