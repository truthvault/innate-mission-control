#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const plan = readFileSync(new URL("../app/production/plan/PlanClient.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/mission-control-shell.tsx", import.meta.url), "utf8");
const audit = readFileSync(new URL("./audit-tuesday-ui.mjs", import.meta.url), "utf8");

function mustMatch(text, pattern, message) {
  assert.match(text, pattern, message);
}

function mustNotMatch(text, pattern, message) {
  assert.doesNotMatch(text, pattern, message);
}

// Mobile should not render a plausible but wrong desktop/unsaved state before the real state loads.
mustMatch(plan, /useState\(true\)/, "mobile/narrow hooks should default to mobile-first render to avoid hydration flashes");
mustMatch(plan, /data-order-journey-loading="saved-order-state"/, "Orders must gate saved order/task state before rendering the order journey");
mustMatch(plan, /!planTaskLinksLoaded \?/, "Orders should not render fallback order rows before saved plan task links load");
mustMatch(plan, /Loading saved order list/, "Saved-state gate should show a small honest loading message");

// Mobile should be an agenda/work queue, not a compressed desktop board.
mustMatch(plan, /function MobileScheduleAgenda/, "Schedule mobile should render through a dedicated vertical agenda component");
mustMatch(plan, /data-mobile-schedule-agenda="true"/, "Schedule mobile agenda should have a testable hook");
mustMatch(plan, /gridTemplateColumns: isNarrow \? `repeat\(\$\{cards\.length\}, minmax\(0, 1fr\)\)`/, "Mobile health chips should fit without horizontal scrolling");
const healthStripSnippet = plan.slice(plan.indexOf('data-mobile-health-strip="one-row-health"'), plan.indexOf('const HEALTH_META'));
mustNotMatch(healthStripSnippet, /overflowX: isNarrow \? "auto"/, "Mobile primary health/status controls must not depend on horizontal scrolling");

// Every visible task row must be actionable.
mustMatch(plan, /data-order-row-done-checkbox="order-row-done-checkbox"/, "Order task rows need a visible done checkbox");
mustMatch(plan, /onTaskDoneToggle\(task, !task\.done/, "Order task checkbox must toggle done state");
mustMatch(plan, /onAppTaskDoneToggle\?\.\(task, !done/, "App/workflow task rows need a visible done checkbox and toggle");
mustMatch(plan, /onAppTaskOpen\?\.\(task\)/, "App/workflow task rows need an open/details action");
mustMatch(plan, /onTaskOpen\?\.\(task\)/, "Plan task rows need open/details behaviour");

// Progressive disclosure must stay inline.
mustMatch(plan, /expandedMobileRows/, "+ more tasks should expand inline, not navigate away");
mustMatch(plan, /aria-expanded=\{mobileRowExpanded\}/, "+ more tasks control should expose expanded state");
mustNotMatch(plan, /onClick=\{\(\) => row\.order && onOrderOpen\(row\.order\.id\)\}/, "+ more tasks must not open the order screen");

// Fast Today mode should be visible in the mobile Orders header.
mustMatch(plan, /aria-pressed=\{dayFilter === "today"\}/, "Mobile Orders should expose a one-tap Today mode");
mustMatch(plan, /onDayFilterChange\(dayFilter === "today" \? "allWeek" : "today"\)/, "Today mode should toggle back to the full week");

// Runtime audit must authenticate and fail on login/small-body false positives.
mustMatch(audit, /signedAuthCookie/, "Tuesday UI audit should generate a signed auth cookie from local env");
mustMatch(audit, /rendered an unexpectedly small body/, "Tuesday UI audit should fail if it only sees login chrome");
mustMatch(audit, /rendered login\/auth chrome/, "Tuesday UI audit should fail on protected-route auth false positives");

// Shell should also be mobile-first to avoid desktop header flashes.
mustMatch(shell, /function useIsNarrow\(breakpoint = 760\) \{\n  const \[isNarrow, setIsNarrow\] = useState\(true\)/, "Mission Control shell should default to mobile-first narrow state");

console.log("Tuesday mobile UX loop checks passed");
