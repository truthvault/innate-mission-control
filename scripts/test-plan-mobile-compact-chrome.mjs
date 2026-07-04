#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/mission-control-shell.tsx', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');

assert.match(shell, /MobileManagementMenu/, 'Mobile shell should move Tuesday nav into a compact dropdown');
assert.match(shell, /const ALL_NAV = \[\.\.\.NAV, \.\.\.GUIDO_NAV\]/, 'Mobile dropdown should include production and Guido-facing Tuesday routes');
assert.match(shell, /const compactMobile = isNarrow/, 'Compact mobile shell should apply across Tuesday surfaces');
assert.match(shell, /Menu/, 'Dropdown label should be Menu');
assert.match(shell, /gridTemplateColumns: isNarrow \? "1fr auto"/, 'Mobile shell should keep Tuesday and management nav on one row');
assert.match(shell, /<RefreshButton section=\{section\} compact \/>/, 'Mobile Tuesday shell should keep a compact refresh control');
assert.match(shell, /autoRefreshEnabledFor/, 'Tuesday shell should explicitly gate auto-refresh to source-backed refreshable routes');
assert.match(shell, /window\.setInterval\(\(\) => \{\n\s+void runRefresh\(\{ automatic: true \}\);\n\s+\}, 180_000\)/, 'Production refreshable routes should auto-refresh in the background every three minutes');
assert.match(shell, /document\.visibilityState === "visible"/, 'Auto-refresh should only run when the tab is visible');
assert.match(shell, /autoRefreshInFlight\.current/, 'Auto-refresh should avoid overlapping refresh calls');
assert.match(shell, /\/api\/monday\/refresh\?scope=\$\{scope\}/, 'Auto-refresh should reuse the scoped Monday refresh endpoint for Production Plan');
assert.match(shell, /\.mc-mobile-only \{ display: flex; \}/, 'Mobile Tuesday header controls should become visible on small screens');

assert.match(shell, /production-plan-layout-grid/, 'Mobile CSS should stack the production layout instead of squeezing desktop columns');
assert.match(shell, /\[data-order-row-week-grid\]/, 'Mobile CSS should stack order rows instead of showing desktop day columns');
assert.match(plan, /className="production-plan-layout-grid"/, 'Production plan desktop grid should have a mobile stacking hook');
assert.match(plan, /data-mobile-production-actions="workshop-primary-actions"/, 'Production Plan should expose mobile Orders/Schedule buttons near the top');
assert.match(plan, /Orders/, 'Mobile primary action should include Orders');
assert.match(plan, /Schedule/, 'Mobile primary action should use the shorter Schedule label');
assert.match(plan, /data-mobile-health-strip="one-row-health"/, 'Mobile health cards should collapse into one horizontal row');
assert.match(plan, /mobileLabel: "Active"/, 'Mobile health strip should use short labels so Active Orders is not cut off');
assert.match(plan, /gridTemplateColumns: isNarrow \? `repeat\(\$\{cards\.length\}, minmax\(0, 1fr\)\)`/, 'Mobile health strip should fit all cards without horizontal clipping');
assert.match(plan, /data-mobile-crew-pill="crew-filter"/, 'Nick/Dylan controls should become one segmented crew pill');
assert.match(plan, /data-mobile-capacity-strip="temperature-pill-row"/, 'Mobile week capacity should be a compact temperature-pill row');
assert.match(plan, /data-order-capacity-strip-mobile="true"/, 'Mobile capacity strip should render separately from the desktop grid');
assert.match(plan, /data-order-capacity-strip-desktop="true"/, 'Desktop capacity strip should remain available for wide screens');
assert.match(plan, /gridTemplateColumns: "1fr 1fr"/, 'Mobile Week and Today controls should fit on their own short row');
assert.match(plan, /gridTemplateColumns: "repeat\(5, minmax\(0, 1fr\)\)"/, 'Mobile weekday controls should fit as five compact buttons');
assert.match(plan, /data-order-capacity-strip-mobile="true" aria-hidden=\{!isNarrow\}/, 'Mobile capacity strip should render only on narrow screens as the compact pill row');
assert.match(plan, /height: 5/, 'Mobile temperature gauge bars should stay compact but legible');
assert.match(plan, /totalHours > capacityHours \? DT\.clay/, 'Capacity pills should go red when a day is overloaded');
assert.match(plan, /data-order-row-day-mobile-visible/, 'Mobile order cards should hide empty weekday cells');
assert.match(plan, /data-order-row-drop-mobile-visible/, 'Mobile order cards should hide empty Nick\/Dylan lanes');
assert.match(plan, /data-order-journey-empty-mobile/, 'Mobile order cards should show a clear no-task message instead of empty lanes');
assert.match(plan, /data-order-journey-row-compact="true"/, 'Mobile order cards should use the compact agenda card path');
assert.match(plan, /compactTaskLimit/, 'Mobile order cards should cap visible task rows so multi-task orders do not dominate the first screen');
assert.match(plan, /Show \$\{hiddenTaskCount\} more/, 'Mobile order cards should summarize hidden tasks with a clear more-tasks line');
assert.match(plan, /Show less/, 'Expanded mobile order task groups should be collapsible');
// Done-checkbox grew from 22px to a 40px tap target; guard presence + minimum size.
assert.match(plan, /compactDoneSize = (?:[4-9]\d|\d{3,})/, 'Mobile compact order rows should keep a >=40px done checkbox in each task row');
assert.match(plan, /compactEditSize = (?:[2-9]\d|\d{3,})/, 'Mobile compact order rows should keep edit/details available per task');
assert.match(plan, /width: 40, height: 40/, 'Mobile priority arrows should use larger touch targets');
assert.match(plan, /aria-pressed=\{active\}/, 'Mobile segmented controls should expose selected state to assistive tech');
assert.match(plan, /aria-label=\{`\$\{option\?\.dateLabel/, 'Capacity day controls should expose full scheduled-hour labels');
assert.match(plan, /Open \$\{option\.id === "schedule" \? "week board"/, 'View switcher should offer the week board without a Monday-style label');
assert.match(shell, /pageTitle && !compactPlanMobile/, 'Production Plan mobile should not duplicate a large page title above orders');
assert.match(plan, /persistOrderJourneyRowOrder/, 'Order priority save/reset path should exist for the orders view');
assert.doesNotMatch(plan, /Reset to due-date order[^\n]+rgba\(146,42,35/, 'Reset due-date order control should not use a red/destructive treatment');
assert.match(plan, /rowIds: string\[\] \| null/, 'Order priority reset should accept an explicit null-reset');

console.log('plan mobile compact chrome tests passed');
