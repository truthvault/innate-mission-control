#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_ROUTES = [
  "/production/plan",
  "/production/stock",
  "/production/samples",
  "/leads",
  "/freight-quotes",
  "/costings",
  "/quoting",
  "/today",
];

const ROUTE_EXPECTATIONS = {
  "/production/plan": ["Tuesday", "Orders"],
  "/production/plan?view=process-templates": ["Tuesday", "Processes"],
  "/production/stock": ["Tuesday", "Stock"],
  "/production/samples": ["Tuesday", "Sample Stock"],
  "/leads": ["Tuesday", "Leads"],
  "/freight-quotes": ["Tuesday", "Freight"],
  "/costings": ["Tuesday", "Costings"],
  "/quoting": ["Tuesday", "Quoting"],
  "/today": ["Tuesday"],
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000, isMobile: false },
  { name: "tablet-wide", width: 1024, height: 900, isMobile: false },
  { name: "tablet", width: 768, height: 900, isMobile: false },
  { name: "mobile", width: 390, height: 844, isMobile: true },
];

function usage() {
  return `
Tuesday visual consistency audit

Usage:
  npm run audit:tuesday-visual -- --port <actual-dev-server-port>
  npm run audit:tuesday-visual -- --base-url http://<host>:<port>

Options:
  --base-url <url>       Base review/live URL.
  --port <port>          Local dev-server port; creates http://127.0.0.1:<port>.
  --url <path-or-url>    Add one route. May be repeated.
  --urls-file <path>     Newline-delimited routes/URLs to audit.
  --profile <name>       all, desktop, tablet-wide, tablet, or mobile. Default: all.
  --expect <text>        Extra visible text expected on every audited route.
  --out <dir>            Evidence directory. Default: reference/evidence/<date>/tuesday-visual-audit-<stamp>
  --timeout <ms>         Navigation timeout. Default: 45000
  --soft                 Always exit 0, even when findings fail the audit.
  --help                 Show this help.
`.trim();
}

function parseArgs(argv) {
  const args = {
    baseUrl: "",
    port: "",
    urls: [],
    urlsFile: "",
    profile: "all",
    expect: [],
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
    else if (flag === "--url") args.urls.push(nextValue());
    else if (flag === "--urls-file") args.urlsFile = nextValue();
    else if (flag === "--profile") args.profile = nextValue();
    else if (flag === "--expect") args.expect.push(nextValue());
    else if (flag === "--out") args.outDir = nextValue();
    else if (flag === "--timeout") args.timeout = Number.parseInt(nextValue(), 10);
    else if (arg === "--soft") args.soft = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw new Error("--timeout must be a positive number");
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
    if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && !url.port && !port) {
      throw new Error("Local Tuesday audit requires the actual dev-server port. Pass --port or include :<port> in --base-url.");
    }
    if (!url.port && port) url.port = port;
    return url.toString().replace(/\/$/, "");
  }
  if (!port) {
    throw new Error("Tuesday visual audit requires --port <actual-dev-server-port> or --base-url <review/live-url>.");
  }
  return `http://127.0.0.1:${port}`;
}

function timestampParts(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return { date: datePart, compact: `${datePart.replace(/-/g, "")}T${timePart}` };
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
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
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

function selectedViewports(profile) {
  if (profile === "all") return VIEWPORTS;
  const viewport = VIEWPORTS.find((candidate) => candidate.name === profile);
  if (!viewport) throw new Error(`Unknown profile ${profile}. Use all, desktop, tablet-wide, tablet, or mobile.`);
  return [viewport];
}

async function loadRoutes(args) {
  const routes = [...args.urls];
  if (args.urlsFile) {
    const filePath = path.resolve(repoRoot, args.urlsFile);
    const body = await readFile(filePath, "utf8");
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) routes.push(trimmed);
    }
  }
  return routes.length ? routes : DEFAULT_ROUTES;
}

function normalizeUrl(input, baseUrl, cacheKey) {
  const url = new URL(input, baseUrl);
  url.searchParams.set("tuesday_visual_audit", cacheKey);
  return url.toString();
}

function routeKey(input) {
  if (String(input).includes("view=process-templates")) return "/production/plan?view=process-templates";
  try {
    const parsed = new URL(input);
    if (parsed.searchParams.get("view") === "process-templates") return "/production/plan?view=process-templates";
    return parsed.pathname;
  } catch {
    return input.split("?")[0] || input;
  }
}

function slugForUrl(url) {
  const parsed = new URL(url);
  const pathPart = parsed.pathname === "/" ? "home" : parsed.pathname.replace(/^\/+/, "");
  const viewPart = parsed.searchParams.get("view") ? `-${parsed.searchParams.get("view")}` : "";
  const modePart = parsed.searchParams.get("mode") ? `-${parsed.searchParams.get("mode")}` : "";
  return `${pathPart}${viewPart}${modePart}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "route";
}

function mdEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function warmPage(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < height; y += step) {
      window.scrollTo(0, y);
      await delay(100);
    }
    window.scrollTo(0, 0);
    await delay(200);
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    function selectorFor(element) {
      if (!element || !element.tagName) return "";
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : "";
      const className = typeof element.className === "string"
        ? `.${element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".")}`
        : "";
      return `${tag}${id}${className}`.slice(0, 120);
    }

    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (!(rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number.parseFloat(style.opacity || "1") > 0.05)) return false;
      let parent = element.parentElement;
      while (parent && parent !== document.documentElement) {
        const parentStyle = window.getComputedStyle(parent);
        if (parent.hidden || parent.getAttribute("aria-hidden") === "true" || parentStyle.display === "none" || parentStyle.visibility === "hidden") return false;
        parent = parent.parentElement;
      }
      return true;
    }

    function rectInfo(element) {
      const rect = element.getBoundingClientRect();
      return {
        selector: selectorFor(element),
        text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 180),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    const doc = document.documentElement;
    const body = document.body;
    const bodyText = body?.innerText || "";
    const lowerBody = bodyText.toLowerCase();
    const scrollWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0);
    const horizontalOverflow = Math.max(0, Math.round(scrollWidth - window.innerWidth));
    const visibleElements = Array.from(document.querySelectorAll("body *")).filter(isVisible);

    const overflowElements = visibleElements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 2 || rect.left < -2;
      })
      .slice(0, 18)
      .map(rectInfo);

    const actionTargets = Array.from(document.querySelectorAll("button, a, [role='button'], input[type='submit']"))
      .filter(isVisible);
    const smallTargets = actionTargets
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (style.pointerEvents === "none") return false;
        return rect.width < 36 || rect.height < 32;
      })
      .slice(0, 24)
      .map(rectInfo);

    const clippedText = visibleElements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const text = (element.innerText || "").trim();
        if (!text || text.length < 8) return false;
        if (style.whiteSpace === "normal" && style.overflowWrap !== "normal") return false;
        return element.scrollWidth > element.clientWidth + 3 || element.scrollHeight > element.clientHeight + 3;
      })
      .slice(0, 24)
      .map(rectInfo);

    const weakFields = Array.from(document.querySelectorAll("input:not([type='hidden']):not([type='range']):not([type='submit']):not([type='button']), textarea, select"))
      .filter(isVisible)
      .map((element) => {
        const style = window.getComputedStyle(element);
        const borderWidth = Number.parseFloat(style.borderTopWidth || "0") + Number.parseFloat(style.borderBottomWidth || "0");
        return {
          ...rectInfo(element),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderWidth,
        };
      })
      .filter((field) => field.borderWidth < 1)
      .slice(0, 16);

    const firstScreenText = visibleElements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.top < window.innerHeight && rect.height > 0;
      })
      .map((element) => element.innerText || element.getAttribute("aria-label") || "")
      .join("\n")
      .replace(/\s+/g, " ")
      .slice(0, 2200);

    return {
      title: document.title || "",
      bodyLength: bodyText.length,
      firstScreenText,
      bodyTextSample: bodyText.slice(0, 3000),
      loginSignals: /password\s*enter|wrong password|sign in/i.test(bodyText) && !/production|leads|stock|tuesday/i.test(bodyText),
      appErrorSignals: /application error|unhandled runtime error|internal server error|this page could not be found/i.test(lowerBody),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        width: scrollWidth,
        height: Math.max(doc.scrollHeight, body?.scrollHeight || 0),
        horizontalOverflow,
      },
      overflowElements,
      smallTargets,
      clippedText,
      weakFields,
      checkboxCount: document.querySelectorAll("[role='checkbox'], input[type='checkbox'], [data-order-row-done-checkbox]").length,
      navLinkCount: document.querySelectorAll("nav a, header a, [aria-label*='nav' i] a").length,
    };
  });
}

function classifyFindings({ routeInput, expected, extraExpected, status, consoleErrors, pageErrors, requestFailures, metrics }) {
  const failures = [];
  const warnings = [];
  const expectedText = [...expected, ...extraExpected].filter(Boolean);

  if (typeof status === "number" && status >= 400) failures.push(`HTTP status ${status}`);
  if (metrics?.loginSignals) failures.push("Rendered login/auth screen instead of the protected Tuesday page");
  if (metrics?.appErrorSignals) failures.push("Rendered app/runtime/not-found error text");
  if (!metrics || metrics.bodyLength < 60) failures.push(`Unexpectedly small body (${metrics?.bodyLength ?? 0} chars)`);

  const missing = expectedText.filter((needle) => !metrics?.bodyTextSample?.includes(needle) && !metrics?.firstScreenText?.includes(needle));
  for (const needle of missing) failures.push(`Missing expected text: ${needle}`);

  const hasPageOverflow = metrics?.scroll?.horizontalOverflow > 2;
  if (hasPageOverflow) failures.push(`Horizontal overflow: ${metrics.scroll.horizontalOverflow}px`);
  if (hasPageOverflow) {
    for (const item of metrics.overflowElements || []) failures.push(`Overflow element ${item.selector} (${item.left}-${item.right}px): ${item.text || "no text"}`);
  }

  if (routeKey(routeInput) === "/production/plan" && metrics?.viewport?.width <= 430 && metrics.checkboxCount < 1) {
    warnings.push("Mobile Production Plan exposed no task checkbox affordance in the loaded state");
  }

  for (const error of pageErrors.slice(0, 5)) failures.push(`Page error: ${error}`);
  for (const request of requestFailures.filter((item) => ["document", "script", "stylesheet"].includes(item.resourceType)).slice(0, 8)) {
    warnings.push(`Failed ${request.resourceType}: ${request.url} (${request.errorText})`);
  }
  for (const error of consoleErrors.slice(0, 10)) warnings.push(`Console error: ${error}`);
  for (const item of metrics?.smallTargets || []) warnings.push(`Small action target ${item.selector} ${item.width}x${item.height}: ${item.text || "no text"}`);
  for (const item of metrics?.clippedText || []) warnings.push(`Clipped text candidate ${item.selector} ${item.width}x${item.height}: ${item.text || "no text"}`);
  for (const item of metrics?.weakFields || []) warnings.push(`Weak visible form field ${item.selector}: borderWidth=${item.borderWidth}`);

  return { failures, warnings };
}

async function auditViewport(browser, routeInput, url, viewport, outDir, args, authCookie) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
  });
  if (authCookie) {
    await context.addCookies([authCookieRecord(authCookie, url)]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(args.timeout);

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => pageErrors.push(error.message.slice(0, 300)));
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url().slice(0, 300),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || "unknown",
    });
  });

  let response = null;
  let metrics = null;
  let screenshot = "";
  let navigationError = "";

  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: args.timeout });
    await page.waitForLoadState("networkidle", { timeout: Math.min(args.timeout, 12000) }).catch(() => undefined);
    await page.waitForTimeout(500);
    await warmPage(page);
    metrics = await collectMetrics(page);
    const screenshotName = `${slugForUrl(url)}--${viewport.name}.png`;
    screenshot = path.join(outDir, "screenshots", screenshotName);
    await page.screenshot({ path: screenshot, fullPage: true });
  } catch (error) {
    navigationError = error.message || String(error);
  } finally {
    await context.close();
  }

  const routeExpect = ROUTE_EXPECTATIONS[routeKey(routeInput)] || ["Tuesday"];
  const status = response?.status();
  const { failures, warnings } = classifyFindings({
    routeInput,
    expected: routeExpect,
    extraExpected: args.expect,
    status,
    consoleErrors,
    pageErrors,
    requestFailures,
    metrics,
  });
  if (navigationError) failures.unshift(`Navigation/screenshot failed: ${navigationError}`);

  return {
    routeInput,
    url,
    viewport,
    status,
    finalUrl: response?.url() || null,
    navigationError,
    metrics,
    consoleErrors,
    pageErrors,
    requestFailures,
    failures,
    warnings,
    screenshot,
  };
}

function severityCounts(routeReports) {
  let failures = 0;
  let warnings = 0;
  for (const route of routeReports) {
    for (const viewport of route.viewports) {
      failures += viewport.failures.length;
      warnings += viewport.warnings.length;
    }
  }
  return { failures, warnings };
}

function summarizeFindingList(items) {
  return items.slice(0, 10).map((item) => `    - ${item}`).join("\n");
}

async function writeReports(report, outDir) {
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const lines = [
    "# Tuesday Visual Audit Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseUrl}`,
    `Routes: ${report.routes.length}`,
    `Viewports: ${report.viewports.map((viewport) => `${viewport.name} ${viewport.width}x${viewport.height}`).join(", ")}`,
    `Result: ${report.summary.failures === 0 ? "PASS" : "FAIL"}`,
    `Failures: ${report.summary.failures}`,
    `Warnings: ${report.summary.warnings}`,
    "",
    "## Route Summary",
    "",
    "| Route | Viewport | Status | Final URL | Failures | Warnings | Screenshot |",
    "|---|---:|---:|---|---:|---:|---|",
  ];

  for (const route of report.routes) {
    for (const viewport of route.viewports) {
      lines.push([
        mdEscape(route.input),
        viewport.viewport.name,
        viewport.status ?? "n/a",
        mdEscape(viewport.finalUrl ?? ""),
        viewport.failures.length,
        viewport.warnings.length,
        viewport.screenshot ? `screenshots/${path.basename(viewport.screenshot)}` : "",
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }

  lines.push("", "## Findings", "");
  for (const route of report.routes) {
    lines.push(`### ${route.input}`, "");
    for (const viewport of route.viewports) {
      lines.push(`#### ${viewport.viewport.name} ${viewport.viewport.width}x${viewport.viewport.height}`, "");
      lines.push(`- URL: ${viewport.finalUrl || viewport.url}`);
      lines.push(`- Status: ${viewport.status ?? "n/a"}`);
      lines.push(`- Title: ${viewport.metrics?.title || ""}`);
      lines.push(`- Body length: ${viewport.metrics?.bodyLength ?? 0}`);
      lines.push(`- Screenshot: ${viewport.screenshot ? `screenshots/${path.basename(viewport.screenshot)}` : "not captured"}`);
      if (viewport.failures.length) {
        lines.push("- Failures:");
        lines.push(summarizeFindingList(viewport.failures));
      }
      if (viewport.warnings.length) {
        lines.push("- Warnings:");
        lines.push(summarizeFindingList(viewport.warnings));
      }
      if (!viewport.failures.length && !viewport.warnings.length) {
        lines.push("- Findings: none from automated heuristics. Screenshots still require human review.");
      }
      lines.push("");
    }
  }

  lines.push(
    "## Reminder",
    "",
    "This scanner proves route identity and catches mechanical layout defects. It does not replace Tuesday design judgement. Review screenshots with `docs/current/tuesday-agent-design-standard.md` before calling the UI ready."
  );

  await writeFile(path.join(outDir, "report.md"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const baseUrl = resolveBaseUrl(args);
  const stamp = timestampParts();
  const outDir = args.outDir
    ? path.resolve(repoRoot, args.outDir)
    : path.join(repoRoot, "reference", "evidence", stamp.date, `tuesday-visual-audit-${stamp.compact}`);
  await mkdir(path.join(outDir, "screenshots"), { recursive: true });

  const routes = (await loadRoutes(args)).map((route) => ({
    input: route,
    url: normalizeUrl(route, baseUrl, stamp.compact),
    viewports: [],
  }));
  const viewports = selectedViewports(args.profile);
  const authCookie = signedAuthCookie();

  const browser = await chromium.launch({ headless: true });
  try {
    for (const route of routes) {
      for (const viewport of viewports) {
        const result = await auditViewport(browser, route.input, route.url, viewport, outDir, args, authCookie);
        route.viewports.push(result);
        const status = result.failures.length ? "FAIL" : "OK";
        console.log(`${status} ${viewport.name} ${route.input} failures=${result.failures.length} warnings=${result.warnings.length}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = severityCounts(routes);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    viewports,
    outDir,
    summary,
    routes,
  };
  await writeReports(report, outDir);

  console.log(`Report: ${path.join(outDir, "report.md")}`);
  console.log(`Screenshots: ${path.join(outDir, "screenshots")}`);
  console.log(`Failures: ${summary.failures}`);
  console.log(`Warnings: ${summary.warnings}`);
  if (summary.failures > 0 && !args.soft) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
