#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "tablet-wide", width: 1024, height: 900, isMobile: false },
  { name: "tablet", width: 768, height: 900, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

const SCENARIO_ORDER = [
  "orders-board",
  "schedule-board",
  "pending-review-modal",
  "task-editor-modal",
  "order-overview-modal",
];

function usage() {
  return `
Tuesday Orders board theme audit

Usage:
  node scripts/audit-tuesday-orders-board-theme.mjs --base-url http://100.70.68.42:3194
  node scripts/audit-tuesday-orders-board-theme.mjs --port 3194 --scenario schedule-board

Options:
  --base-url <url>       Base review/live URL.
  --port <port>          Local dev-server port; creates http://127.0.0.1:<port>.
  --scenario <id>        Scenario to audit. Repeatable. Default: all.
  --profile <name>       all, desktop, tablet-wide, tablet, or mobile. Default: all.
  --out <dir>            Evidence directory. Default: reference/evidence/<date>/tuesday-orders-board-theme-<stamp>
  --timeout <ms>         Per-step timeout. Default: 45000
  --soft                 Always exit 0, even when findings fail the audit.
  --help                 Show this help.

Scenarios:
  ${SCENARIO_ORDER.join(", ")}
`.trim();
}

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    port: "",
    scenarios: [],
    profile: "all",
    outDir: "",
    timeout: 45000,
    soft: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (flag === "--base-url") args.baseUrl = nextValue();
    else if (flag === "--port") args.port = nextValue();
    else if (flag === "--scenario") args.scenarios.push(nextValue());
    else if (flag === "--profile") args.profile = nextValue();
    else if (flag === "--out") args.outDir = nextValue();
    else if (flag === "--timeout") args.timeout = Number.parseInt(nextValue(), 10);
    else if (arg === "--soft") args.soft = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw new Error("--timeout must be a positive number.");
  return args;
}

function normalizePort(value) {
  const port = String(value || "").trim();
  if (!/^\d+$/.test(port)) return "";
  const number = Number(port);
  if (number < 1 || number > 65535) return "";
  return port;
}

function resolveBaseUrl(args) {
  const explicit = args.baseUrl || process.env.TUESDAY_BASE_URL || process.env.MISSION_CONTROL_BASE_URL || "";
  const port = normalizePort(args.port || process.env.TUESDAY_PORT || "");
  if (explicit) {
    const url = new URL(explicit);
    if (!url.port && port) url.port = port;
    return url.toString().replace(/\/$/, "");
  }
  if (!port) throw new Error("Pass --base-url or --port.");
  return `http://127.0.0.1:${port}`;
}

function timestampParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const compact = `${datePart.replace(/-/g, "")}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return { datePart, compact };
}

function selectedViewports(profile) {
  if (profile === "all") return VIEWPORTS;
  const viewport = VIEWPORTS.find((candidate) => candidate.name === profile);
  if (!viewport) throw new Error(`Unknown profile ${profile}.`);
  return [viewport];
}

function selectedScenarios(ids) {
  const names = ids.length ? ids : SCENARIO_ORDER;
  const unknown = names.filter((name) => !SCENARIOS[name]);
  if (unknown.length) throw new Error(`Unknown scenario(s): ${unknown.join(", ")}`);
  return names.map((name) => SCENARIOS[name]);
}

function loadEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const equalsIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!process.env[key]) process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function loadLocalEnv() {
  const homeEnv = process.env.HOME ? path.join(process.env.HOME, "innate-mission-control", ".env.local") : "";
  const candidates = [
    process.env.TUESDAY_ENV_FILE,
    process.env.MISSION_CONTROL_ENV_FILE,
    path.join(repoRoot, ".env.local"),
    path.join(process.cwd(), ".env.local"),
    homeEnv,
  ];
  for (const envPath of [...new Set(candidates.filter(Boolean))]) loadEnvFile(envPath);
}

function signedAuthCookie() {
  loadLocalEnv();
  if (process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE) {
    return process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE;
  }
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD;
  if (!secret) return "";
  const expiresAt = Date.now() + 60 * 60 * 24 * 30 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function authCookieRecord(cookie, url) {
  const parsed = new URL(url);
  const [pair] = String(cookie).split(";", 1);
  const separator = pair.indexOf("=");
  return {
    name: separator > 0 ? pair.slice(0, separator) : "innate-auth",
    value: separator > 0 ? pair.slice(separator + 1) : pair,
    url: `${parsed.protocol}//${parsed.host}`,
    httpOnly: true,
    sameSite: "Lax",
    secure: parsed.protocol === "https:",
  };
}

function scenarioUrl(baseUrl, scenario, cacheKey) {
  const url = new URL(scenario.path, baseUrl);
  url.searchParams.set("orders_theme_audit", cacheKey);
  return url.toString();
}

async function clickFirstByText(page, selector, predicate, description) {
  const handles = await page.locator(selector).elementHandles();
  for (let index = 0; index < handles.length; index += 1) {
    const text = await handles[index].evaluate((node) => (node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim());
    if (predicate(text, index)) {
      await handles[index].click();
      return text;
    }
  }
  throw new Error(`Could not find ${description}.`);
}

async function prepareBase(page, scenario, cacheKey) {
  await page.goto(scenarioUrl(page.baseUrl, scenario, cacheKey), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined);
  await page.waitForSelector("[data-production-view-switch='true']", { timeout: 30000 });
}

const SCENARIOS = {
  "orders-board": {
    id: "orders-board",
    title: "Orders board",
    path: "/production/plan",
    expected: [],
    async setup(page, cacheKey) {
      await prepareBase(page, this, cacheKey);
      await page.waitForSelector('[data-production-view-option="orderRows"][aria-pressed="true"]', { timeout: 30000 });
      await page.waitForSelector('[data-order-rail="neutral-command-panel"], [data-order-row-task-id], [data-order-journey-loading], [data-mobile-schedule-agenda="true"]', { timeout: 30000 });
      return "Orders board loaded with Orders view active.";
    },
  },
  "schedule-board": {
    id: "schedule-board",
    title: "Schedule board",
    path: "/production/plan?mode=schedule",
    expected: [],
    async setup(page, cacheKey) {
      await prepareBase(page, this, cacheKey);
      await page.waitForSelector('[data-production-view-option="schedule"][aria-pressed="true"]', { timeout: 30000 });
      await page.waitForSelector('[data-plan-task-id], [data-mobile-schedule-agenda="true"]', { timeout: 30000 });
      return "Schedule board loaded with Schedule view active.";
    },
  },
  "pending-review-modal": {
    id: "pending-review-modal",
    title: "Pending new order review modal",
    path: "/production/plan",
    expected: ["Pending new order review"],
    async setup(page, cacheKey) {
      await prepareBase(page, this, cacheKey);
      await page.waitForSelector('[data-pending-new-orders-rail="true"]', { timeout: 30000 });
      const opened = await clickFirstByText(
        page,
        '[data-pending-new-orders-rail="true"] button',
        (text) => Boolean(text) && !/^refresh|checking$/i.test(text),
        "a pending order review button"
      );
      await page.waitForSelector('[role="dialog"][aria-label="Pending new order review"]', { timeout: 30000 });
      return `Opened pending order review from: ${opened}`;
    },
  },
  "task-editor-modal": {
    id: "task-editor-modal",
    title: "Edit workshop task modal",
    path: "/production/plan?mode=schedule",
    expected: [],
    async setup(page, cacheKey) {
      await prepareBase(page, this, cacheKey);
      await page.waitForSelector('[data-production-view-option="schedule"][aria-pressed="true"]', { timeout: 30000 });
      const desktopTask = page.locator("[data-plan-task-id]").first();
      if (await desktopTask.count()) {
        await desktopTask.click();
      } else {
        await page.locator('button[aria-label="Edit task"]').first().click();
      }
      await page.waitForSelector('[data-workshop-task-editor="desktop-landscape-task-editor"]', { timeout: 30000 });
      return "Opened workshop task editor from the first available schedule task.";
    },
  },
  "order-overview-modal": {
    id: "order-overview-modal",
    title: "Order overview modal",
    path: "/production/plan",
    expected: [],
    async setup(page, cacheKey) {
      await prepareBase(page, this, cacheKey);
      await page.waitForSelector('button[title^="Open "][title$=" order"]', { timeout: 30000 });
      await page.locator('button[title^="Open "][title$=" order"]').first().click();
      await page.waitForSelector('[data-order-command-center="desktop-order-command-center"]', { timeout: 30000 });
      return "Opened full order overview from the first visible order row.";
    },
  },
};

async function collectThemeMetrics(page) {
  return page.evaluate(() => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (!(rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0.05)) return false;
      return true;
    }
    function textFor(element) {
      return (element.innerText || element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
    }
    function rectInfo(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        text: textFor(element).slice(0, 160),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontFamily: style.fontFamily,
      };
    }
    function maxRadiusPx(style) {
      return Math.max(...style.borderRadius.split(/\s+/).map((part) => Number.parseFloat(part)).filter(Number.isFinite), 0);
    }
    function buttonRoleAllowedAsPill(element) {
      return Boolean(element.closest("[data-production-view-switch], nav, header")) || element.getAttribute("aria-pressed") !== null;
    }

    const modalRoots = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Pending new order review"], [data-workshop-task-editor="desktop-landscape-task-editor"], [data-order-command-center="desktop-order-command-center"]')).filter(isVisible);
    const boardRoot = document.querySelector('[data-production-plan-board="orders-schedule-board"]');
    const root = modalRoots.at(-1) || (boardRoot && isVisible(boardRoot) ? boardRoot : document.body);
    const visible = [root, ...Array.from(root.querySelectorAll("*"))].filter(isVisible);
    const actions = Array.from(root.querySelectorAll("button, a, [role='button'], input[type='submit']")).filter(isVisible);
    const fields = Array.from(root.querySelectorAll("input:not([type='hidden']), textarea, select")).filter(isVisible);
    const dialogs = Array.from(root.querySelectorAll('[role="dialog"]')).filter(isVisible);
    if (root.matches?.('[role="dialog"]')) dialogs.unshift(root);
    const labels = Array.from(root.querySelectorAll('[data-customer-left-label="customer-left-label"]')).filter(isVisible).map(textFor);
    const cards = Array.from(root.querySelectorAll("[data-plan-task-id], [data-order-row-task-id]")).filter(isVisible).map(textFor);

    const smallTargets = actions
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 36 || rect.height < (window.innerWidth <= 430 ? 40 : 32);
      })
      .slice(0, 30)
      .map(rectInfo);

    const pillButtons = actions
      .filter((element) => {
        if (element.tagName.toLowerCase() !== "button" && element.getAttribute("role") !== "button") return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return maxRadiusPx(style) >= Math.min(20, rect.height / 2);
      })
      .map((element) => ({ ...rectInfo(element), allowedContext: buttonRoleAllowedAsPill(element) }))
      .filter((item) => !item.allowedContext)
      .slice(0, 30);

    const weakFields = fields
      .map((element) => {
        const info = rectInfo(element);
        const style = window.getComputedStyle(element);
        return {
          ...info,
          borderWidth: Number.parseFloat(style.borderTopWidth || "0"),
        };
      })
      .filter((field) => {
        const element = fields.find((candidate) => rectInfo(candidate).text === field.text && rectInfo(candidate).top === field.top && rectInfo(candidate).left === field.left);
        const type = element?.getAttribute("type") || "";
        if ((type === "checkbox" || type === "radio") && field.width >= 22 && field.height >= 22) return false;
        return field.borderWidth < 1 || field.backgroundColor === "rgba(0, 0, 0, 0)";
      })
      .slice(0, 24);

    const clippedText = visible
      .filter((element) => {
        const text = textFor(element);
        if (text.length < 8) return false;
        return element.scrollWidth > element.clientWidth + 3 || element.scrollHeight > element.clientHeight + 3;
      })
      .slice(0, 24)
      .map(rectInfo);

    const fontFamilies = {};
    for (const element of visible) {
      const family = window.getComputedStyle(element).fontFamily || "unknown";
      const normalized = family.includes("Fraunces") ? "Fraunces"
        : family.includes("DM Sans") ? "DM Sans"
        : family.includes("Cormorant") ? "Cormorant"
        : family.includes("Maven") ? "Maven"
        : family.includes("Poppins") ? "Poppins"
        : family.includes("Figtree") ? "Figtree"
        : family.split(",")[0].replaceAll('"', "").trim() || "unknown";
      fontFamilies[normalized] = (fontFamilies[normalized] || 0) + 1;
    }

    const bodyText = root.innerText || "";
    const doc = document.documentElement;
    const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth || 0);
    return {
      title: document.title,
      finalUrl: location.href,
      bodyLength: bodyText.length,
      firstScreenText: visible
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.top < window.innerHeight;
        })
        .map(textFor)
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 1800),
      dialogLabels: dialogs.map((element) => element.getAttribute("aria-label") || textFor(element).slice(0, 80)),
      counts: {
        actions: actions.length,
        buttons: root.querySelectorAll("button").length,
        fields: fields.length,
        dialogs: dialogs.length,
        taskCards: root.querySelectorAll("[data-plan-task-id], [data-order-row-task-id]").length,
        pendingRail: root.querySelectorAll('[data-pending-new-orders-rail="true"]').length,
        scopedToModal: root !== document.body,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow: Math.max(0, Math.round(scrollWidth - window.innerWidth)),
      smallTargets,
      pillButtons,
      weakFields,
      clippedText,
      fontFamilies,
      repeatedAssigneeLabels: labels.filter((text) => /^(Nick|Dylan)$/i.test(text)),
      startHereCards: cards.filter((text) => /Start here/i.test(text)).slice(0, 12),
      sourceVisible: /Synced|Stale|Source|Checking/i.test(bodyText),
      bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 1200),
    };
  });
}

function classify(result, scenario) {
  const failures = [];
  const warnings = [];
  const metrics = result.metrics;
  if (result.error) failures.push(result.error);
  if (!metrics) return { failures, warnings };
  for (const expected of scenario.expected) {
    if (!metrics.bodyPreview.includes(expected) && !metrics.firstScreenText.includes(expected) && !metrics.dialogLabels.some((label) => label.includes(expected))) {
      failures.push(`Missing expected text/state: ${expected}`);
    }
  }
  if (metrics.horizontalOverflow > 2) failures.push(`Horizontal overflow: ${metrics.horizontalOverflow}px`);
  if ((scenario.id === "orders-board" || scenario.id === "schedule-board") && !metrics.sourceVisible) warnings.push("Source/sync state was not visible in captured text.");
  if (metrics.repeatedAssigneeLabels.length) warnings.push(`Repeated task assignee labels: ${metrics.repeatedAssigneeLabels.join(", ")}`);
  if (metrics.startHereCards.length) warnings.push(`Visible Start here badge/text in task cards: ${metrics.startHereCards.slice(0, 3).join(" | ")}`);
  if (metrics.pillButtons.length) warnings.push(`${metrics.pillButtons.length} button(s) use badge-like pill shape outside obvious nav/segmented context.`);
  if (metrics.smallTargets.length) warnings.push(`${metrics.smallTargets.length} small action target(s) below threshold.`);
  if (metrics.weakFields.length) warnings.push(`${metrics.weakFields.length} weak/low-affordance field(s).`);
  if (metrics.clippedText.length) warnings.push(`${metrics.clippedText.length} clipped text candidate(s).`);
  return { failures, warnings };
}

async function auditScenarioViewport(browser, scenario, viewport, baseUrl, outDir, cacheKey, timeout, authCookie) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    hasTouch: viewport.isMobile,
  });
  const startUrl = scenarioUrl(baseUrl, scenario, cacheKey);
  if (authCookie) await context.addCookies([authCookieRecord(authCookie, startUrl)]);
  const page = await context.newPage();
  page.baseUrl = baseUrl;
  page.setDefaultTimeout(timeout);
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 300)));

  const result = {
    scenario: scenario.id,
    title: scenario.title,
    viewport,
    startUrl,
    setupNote: "",
    screenshot: "",
    metrics: null,
    consoleErrors,
    pageErrors,
    failures: [],
    warnings: [],
    error: "",
  };

  try {
    result.setupNote = await scenario.setup(page, cacheKey);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(350);
    result.metrics = await collectThemeMetrics(page);
    const screenshotPath = path.join(outDir, "screenshots", `${scenario.id}--${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = screenshotPath;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await context.close();
  }

  const classified = classify(result, scenario);
  result.failures = classified.failures;
  result.warnings = classified.warnings;
  return result;
}

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function bulletSamples(items, formatter) {
  return items.slice(0, 8).map((item) => `    - ${formatter(item)}`).join("\n");
}

async function writeReports(report, outDir) {
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# Tuesday Orders Board Theme Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Theme kit: ${report.themeKit}`,
    `Design standard: ${report.designStandard}`,
    `Result: ${report.failures ? "FAIL" : "PASS"}`,
    `Failures: ${report.failures}`,
    `Warnings: ${report.warnings}`,
    "",
    "## Summary",
    "",
    "| Scenario | Viewport | Failures | Warnings | Screenshot |",
    "|---|---:|---:|---:|---|",
  ];
  for (const item of report.results) {
    lines.push(`| ${mdEscape(item.title)} | ${item.viewport.name} | ${item.failures.length} | ${item.warnings.length} | ${item.screenshot ? path.relative(outDir, item.screenshot) : ""} |`);
  }
  lines.push("", "## Findings", "");
  for (const item of report.results) {
    lines.push(`### ${item.title} - ${item.viewport.name}`, "");
    lines.push(`- Start URL: ${item.startUrl}`);
    if (item.metrics?.finalUrl) lines.push(`- Final URL: ${item.metrics.finalUrl}`);
    if (item.setupNote) lines.push(`- State proof: ${item.setupNote}`);
    if (item.screenshot) lines.push(`- Screenshot: ${path.relative(outDir, item.screenshot)}`);
    if (item.failures.length) {
      lines.push("- Failures:");
      for (const failure of item.failures) lines.push(`  - ${failure}`);
    }
    if (item.warnings.length) {
      lines.push("- Theme-kit warnings:");
      for (const warning of item.warnings) lines.push(`  - ${warning}`);
    }
    if (item.metrics) {
      lines.push(`- Font families: ${Object.entries(item.metrics.fontFamilies).map(([name, count]) => `${name} ${count}`).join(", ")}`);
      if (item.metrics.pillButtons.length) {
        lines.push("- Pill-shaped action samples:");
        lines.push(bulletSamples(item.metrics.pillButtons, (button) => `${button.width}x${button.height} ${button.text || button.tag}`));
      }
      if (item.metrics.smallTargets.length) {
        lines.push("- Small action target samples:");
        lines.push(bulletSamples(item.metrics.smallTargets, (target) => `${target.width}x${target.height} ${target.text || target.tag}`));
      }
      if (item.metrics.clippedText.length) {
        lines.push("- Clipped text samples:");
        lines.push(bulletSamples(item.metrics.clippedText, (target) => `${target.width}x${target.height} ${target.text || target.tag}`));
      }
    }
    if (item.consoleErrors.length) {
      lines.push("- Console errors:");
      for (const error of item.consoleErrors.slice(0, 5)) lines.push(`  - ${error}`);
    }
    lines.push("");
  }
  lines.push("## How To Re-run", "", "```bash", report.command, "```", "");
  await writeFile(path.join(outDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const baseUrl = resolveBaseUrl(args);
  const viewports = selectedViewports(args.profile);
  const scenarios = selectedScenarios(args.scenarios);
  const stamp = timestampParts();
  const outDir = path.resolve(repoRoot, args.outDir || path.join("reference", "evidence", stamp.datePart, `tuesday-orders-board-theme-${stamp.compact}`));
  await mkdir(path.join(outDir, "screenshots"), { recursive: true });

  const authCookie = signedAuthCookie();
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const scenario of scenarios) {
      for (const viewport of viewports) {
        const result = await auditScenarioViewport(browser, scenario, viewport, baseUrl, outDir, stamp.compact, args.timeout, authCookie);
        results.push(result);
        const status = result.failures.length ? "FAIL" : "OK";
        console.log(`${status} ${viewport.name} ${scenario.id} failures=${result.failures.length} warnings=${result.warnings.length}`);
      }
    }
  } finally {
    await browser.close();
  }

  const failures = results.reduce((sum, item) => sum + item.failures.length, 0);
  const warnings = results.reduce((sum, item) => sum + item.warnings.length, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    themeKit: "docs/current/tuesday-theme-kit.md",
    designStandard: "docs/current/tuesday-agent-design-standard.md",
    command: `node scripts/audit-tuesday-orders-board-theme.mjs --base-url ${baseUrl}${args.scenarios.map((scenario) => ` --scenario ${scenario}`).join("")}${args.profile === "all" ? "" : ` --profile ${args.profile}`}`,
    failures,
    warnings,
    scenarios: scenarios.map((scenario) => scenario.id),
    viewports,
    results,
  };
  await writeReports(report, outDir);
  console.log(`Report: ${path.join(outDir, "report.md")}`);
  console.log(`Screenshots: ${path.join(outDir, "screenshots")}`);
  console.log(`Failures: ${failures}`);
  console.log(`Warnings: ${warnings}`);
  if (failures && !args.soft) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
