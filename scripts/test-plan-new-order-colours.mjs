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
assert.match(source, /Array\.from\(\{ length: 6 \}/, 'Production Plan should generate empty future weeks when Monday has no rows yet');
assert.match(source, /formatPlanningWeekTitle/, 'Generated empty weeks should have normal week titles');
assert.match(source, /forcePlanningLanes/, 'Future visible weeks should render empty Nick/Dylan drop lanes');
assert.match(source, /boardPlanLaneId\(week\.id, day, person\)/, 'Drop lanes should be unique per week, day, and person');
assert.match(source, /reorderBoardPlanTask/, 'Plan tasks should reorder across the shared six-week board, not inside isolated week widgets');
assert.match(source, /Add to schedule/, 'The approve control should describe adding a Tuesday draft to the schedule, not a Monday write');
assert.doesNotMatch(source, /Drag to plan<\/div>/, 'Visible draft task cards should not carry the old extra Drag to plan badge');

console.log('plan new-order colour tests passed');
