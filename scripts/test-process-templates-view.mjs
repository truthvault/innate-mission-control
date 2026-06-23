#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const planClient = readFileSync(new URL('../app/production/plan/PlanClient.tsx', import.meta.url), 'utf8');
const planPage = readFileSync(new URL('../app/production/plan/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/mission-control-shell.tsx', import.meta.url), 'utf8');
const processTemplates = readFileSync(new URL('../lib/production/process-templates.ts', import.meta.url), 'utf8');
const processTemplateRoute = readFileSync(new URL('../app/api/production/process-templates/route.ts', import.meta.url), 'utf8');
const processTemplateStore = JSON.parse(readFileSync(new URL('../reference/tuesday/process-templates.json', import.meta.url), 'utf8'));
const firstTemplate = processTemplateStore.templates?.[0] ?? {};

assert.match(shell, /Processes/, 'Main production header should expose the process templates view');
assert.match(shell, /\/production\/plan\?view=process-templates/, 'Process templates should be opened through the Tuesday plan route');
assert.match(shell, /\["leads", "calls", "quoting", "costings", "processTemplates", "stock"[\s\S]*\.includes\(section\)\) return "local"/, 'Process templates refresh should reload local template state without triggering a Monday plan refresh');
assert.match(shell, /section === "processTemplates" \? "Reload" : "Refresh"/, 'Process templates should use Reload copy instead of implying a live Monday refresh');
assert.match(shell, /function navItemActive/, 'Plan and Processes nav items should not both appear active for the query-string route');
assert.match(planPage, /initialUtilityView=\{query\.view === "process-templates" \? "processTemplates" : null\}/, 'Plan page should pass the process-template query into PlanClient');
assert.match(planClient, /function ProcessTemplatesView/, 'PlanClient should render a dedicated process templates view');
assert.match(planClient, /PROCESS_TEMPLATE_PREVIEWS/, 'Process templates should be defined as explicit local preview data');
assert.match(processTemplates, /buildDiningTableProcessPlan/, 'Dining table previews should use the workshop process rules builder');
assert.match(processTemplates, /STANDARD_DINING_FLOW_STEPS/, 'Dining table process templates should define an explicit SOP-level flow');
assert.match(processTemplates, /ORDER_PANEL_STEPS/, 'Template view should compare against the shared panel order-detail flow');
assert.match(processTemplates, /CNC path includes Westimber, Precision, and Pinpoint gates/, 'Non-standard table path should include the required CNC supplier gates');
assert.match(processTemplates, /Standard rectangular steel-frame dining table/, 'First process should be the standard rectangular steel-frame dining table');
assert.match(processTemplates, /Send Tube Fab PO/, 'Standard dining table template should preserve the early Tube Fab PO step');
assert.match(processTemplates, /Send Westimber PO \/ lamination confirmation/, 'Standard dining table template should preserve the early Westimber PO/lamination confirmation step');
assert.match(processTemplates, /Tube Fab for the steel components, frame, or base/, 'Standard dining table template should name Tube Fab in the supplier PO detail');
assert.match(processTemplates, /Westimber lamination wait/, 'Standard dining table template should expose Westimber as the explicit wait gate');
assert.match(processTemplates, /Bottom prep/, 'Dining table templates should include the SOP-level bottom prep stage');
assert.match(processTemplates, /Bottom coat/, 'Dining table templates should include the SOP-level bottom coat stage');
assert.equal(firstTemplate.title, 'Standard rectangular steel-frame dining table', 'Saved first process title should match the narrowed workshop template');
assert.doesNotMatch(`${firstTemplate.subtitle ?? ''} ${(firstTemplate.detection ?? []).join(' ')}`, /\b(oval|round|pill|CNC|Precision)\b/i, 'Saved first process matching copy should not mention non-standard shapes or CNC routes');
assert.deepEqual(
  firstTemplate.suggestedTasks?.slice(0, 8).map((task) => [task.title, task.owner]),
  [
    ['Order/spec/payment/customer promise checked', 'Guido'],
    ['Production spec and workshop timber confirmed', 'Nick'],
    ['Send Tube Fab PO', 'Nick'],
    ['Send Westimber PO / lamination confirmation', 'Nick'],
    ['Pull timber from workshop', 'Dylan'],
    ['Timber to Westimber for lamination', 'Nick'],
    ['Westimber lamination wait', 'Other'],
    ['Receive/check laminated top back at workshop', 'Nick'],
  ],
  'Saved first process should keep the practical early PO and Westimber sequence'
);
assert.match(planClient, />Save now</, 'Process templates should be editable and saveable');
assert.match(planClient, /Add path row/, 'Production path rows should be editable as one combined row');
assert.match(planClient, /type: "process-template-path-row"/, 'Production path rows should be draggable');
assert.match(planClient, /function processTemplateTextareaStyle/, 'Long process-template fields should use wrapping textarea styling');
assert.match(planClient, /<textarea aria-label=\{`Production path \$\{index \+ 1\} task`\}/, 'Production path task text should wrap instead of clipping in a single-line input');
assert.match(planClient, /<textarea aria-label=\{`Production path \$\{index \+ 1\} note`\}/, 'Production path notes should wrap instead of clipping in a single-line input');
assert.match(planClient, /Drag to reorder/, 'Production path rows should expose a visible drag handle');
assert.match(planClient, /Autosaves on edit/, 'Process templates should make automatic saving visible');
assert.match(planClient, /setTimeout\(\(\) => \{[\s\S]*persistTemplates\(templates, \{ mode: "auto"/, 'Process templates should autosave after edits');
assert.match(planClient, /version === changeVersionRef\.current/, 'Autosave should guard against stale in-flight saves');
assert.match(planClient, /data-process-template-row="path"/, 'Production path rows should have compact responsive row hooks');
assert.match(planClient, /Matching rules/, 'Detection rules should be labelled in plain workshop language');
assert.match(planClient, /aria-label=\{`\$\{template\.title\} matching rule/, 'Matching rules should be wrapping editable text areas, not clipped single-line inputs');
assert.match(planClient, /gridTemplateColumns: showEditor \? "minmax\(300px, 0\.38fr\) minmax\(700px, 1fr\)" : "1fr"/, 'Desktop template cards should reserve more room for the production path beside a compact rules column');
assert.match(planClient, /processTemplateColumnStyle/, 'Template columns should have distinct visual zones');
assert.match(planClient, /processTemplateActionGroupStyle/, 'Row action buttons should use a bounded grid instead of overflowing');
assert.match(planClient, /One row links the scheduled task to the visible order-flow stage/, 'Combined path editor should explain the task-to-stage link');
assert.match(planClient, /PROCESS_TEMPLATE_ISSUE_LABELS/, 'Issue states should use clear labels instead of raw internal names');
assert.match(planClient, /pageTitle=\{initialUtilityView === "processTemplates" \? "Process templates" : "Production Plan"\}/, 'Process templates should not keep the Production Plan page heading active');
assert.match(planClient, /PROCESS_TEMPLATE_PATH_GRID/, 'Production path columns should share one constrained grid instead of overflowing separate widths');
assert.match(planClient, /Default template active/, 'Default-template state should be explained without implying broken persistence');
assert.doesNotMatch(planClient, /key=\{`\$\{task\.title\}-\$\{index\}`\}/, 'Editable task rows must not use mutable task text as React keys');
assert.doesNotMatch(planClient, /key=\{`\$\{step\.key\}-\$\{index\}`\}/, 'Editable flow rows must not use mutable step keys as React keys');
assert.doesNotMatch(planClient, /key=\{`\$\{rule\}-\$\{ruleIndex\}`\}/, 'Editable detection rows must not use mutable rule text as React keys');
assert.match(planClient, /fetch\(["']\/api\/production\/process-templates/, 'Template view should load and save through the internal process-template API');
assert.match(processTemplateRoute, /normalizeProcessTemplates/, 'Process template API should normalize saved templates');
