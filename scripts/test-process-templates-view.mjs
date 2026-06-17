#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const planClient = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const planPage = readFileSync(new URL('../app/production/plan/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/mission-control-shell.tsx', import.meta.url), 'utf8');
const processTemplates = readFileSync(new URL('../lib/production/process-templates.ts', import.meta.url), 'utf8');
const processTemplateRoute = readFileSync(new URL('../app/api/production/process-templates/route.ts', import.meta.url), 'utf8');

assert.match(shell, /Processes/, 'Main production header should expose the process templates view');
assert.match(shell, /\/production\/plan\?view=process-templates/, 'Process templates should be opened through the Tuesday plan route');
assert.match(shell, /section === "plan" \|\| section === "processTemplates"/, 'Process templates refresh should use production plan scope');
assert.match(shell, /function navItemActive/, 'Plan and Processes nav items should not both appear active for the query-string route');
assert.match(planPage, /initialUtilityView=\{query\.view === "process-templates" \? "processTemplates" : null\}/, 'Plan page should pass the process-template query into PlanClient');
assert.match(planClient, /function ProcessTemplatesView/, 'PlanClient should render a dedicated process templates view');
assert.match(planClient, /PROCESS_TEMPLATE_PREVIEWS/, 'Process templates should be defined as explicit local preview data');
assert.match(processTemplates, /buildDiningTableProcessPlan/, 'Dining table previews should use the workshop process rules builder');
assert.match(processTemplates, /ORDER_TABLE_STEPS/, 'Template view should compare against the shared table order-detail flow');
assert.match(processTemplates, /ORDER_PANEL_STEPS/, 'Template view should compare against the shared panel order-detail flow');
assert.match(processTemplates, /Order-detail flow needs conditional CNC stages/, 'Non-standard table mismatch should be visible for the next pass');
assert.match(planClient, />Save</, 'Process templates should be editable and saveable');
assert.match(planClient, /Add task/, 'Suggested task lines should be editable');
assert.match(planClient, /Add step/, 'Order-detail flow lines should be editable');
assert.match(planClient, /Autosaves on edit/, 'Process templates should make automatic saving visible');
assert.match(planClient, /setTimeout\(\(\) => \{[\s\S]*persistTemplates\(templates, \{ mode: "auto"/, 'Process templates should autosave after edits');
assert.match(planClient, /version === changeVersionRef\.current/, 'Autosave should guard against stale in-flight saves');
assert.match(planClient, /data-process-template-row="task"/, 'Suggested task rows should have compact responsive row hooks');
assert.match(planClient, /data-process-template-row="flow"/, 'Order-detail flow rows should have compact responsive row hooks');
assert.match(planClient, /Matching rules/, 'Detection rules should be labelled in plain workshop language');
assert.match(planClient, /aria-label=\{`\$\{template\.title\} matching rule/, 'Matching rules should be wrapping editable text areas, not clipped single-line inputs');
assert.match(planClient, /gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)"/, 'Desktop template cards should use three equal-width columns');
assert.match(planClient, /processTemplateColumnStyle/, 'Template columns should have distinct visual zones');
assert.match(planClient, /processTemplateActionGroupStyle/, 'Row action buttons should use a bounded grid instead of overflowing');
assert.match(planClient, /data-process-template-flow-column="true"/, 'Order-detail flow column should have a responsive full-row hook');
assert.match(planClient, /PROCESS_TEMPLATE_ISSUE_LABELS/, 'Issue states should use clear labels instead of raw internal names');
assert.doesNotMatch(planClient, /key=\{`\$\{task\.title\}-\$\{index\}`\}/, 'Editable task rows must not use mutable task text as React keys');
assert.doesNotMatch(planClient, /key=\{`\$\{step\.key\}-\$\{index\}`\}/, 'Editable flow rows must not use mutable step keys as React keys');
assert.doesNotMatch(planClient, /key=\{`\$\{rule\}-\$\{ruleIndex\}`\}/, 'Editable detection rows must not use mutable rule text as React keys');
assert.match(planClient, /fetch\(["']\/api\/production\/process-templates/, 'Template view should load and save through the internal process-template API');
assert.match(processTemplateRoute, /normalizeProcessTemplates/, 'Process template API should normalize saved templates');
