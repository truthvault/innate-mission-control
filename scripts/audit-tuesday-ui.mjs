#!/usr/bin/env node
import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const PROFILE = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] || "desktop";
const BASE_URL = (process.env.TUESDAY_BASE_URL || process.env.MISSION_CONTROL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUTH_COOKIE = process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE || signedAuthCookie();

function loadEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
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

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
  interactions: { width: 390, height: 844, isMobile: true },
};

const PAGES = [
  "/production/plan",
  "/production/dispatch",
  "/production/samples",
  "/production/stock",
];

async function assertPageHealthy(page, path) {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 15000 });
  if (!response || !response.ok()) {
    throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  const title = await page.title();
  const bodyText = await page.locator("body").innerText({ timeout: 5000 });
  if (!bodyText || bodyText.length < 60) throw new Error(`${path} rendered an unexpectedly small body (${bodyText.length} chars)`);
  if (/Password\s*Enter|Wrong password|Sign in/i.test(bodyText) && !/Production|Sample Stock|Dispatch|Stock/i.test(bodyText)) {
    throw new Error(`${path} rendered login/auth chrome instead of the protected Tuesday page`);
  }
  if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(bodyText)) {
    throw new Error(`${path} rendered an application error`);
  }
  return { path, status: response.status(), title, textLength: bodyText.length };
}

async function runInteractionSmoke(page) {
  await page.goto(`${BASE_URL}/production/plan`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    firstScreenText: document.body.innerText.slice(0, 1600),
  }));
  if (metrics.scrollWidth > metrics.clientWidth + 2) {
    throw new Error(`Mobile /production/plan has horizontal scroll: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`);
  }
  if (!/TASKS THIS WEEK|TASKS TODAY|Loading saved order list/i.test(metrics.firstScreenText)) {
    throw new Error("Mobile /production/plan first screen does not expose workshop work or an honest saved-state loader");
  }

  const todayButton = page.getByRole("button", { name: /show today/i }).first();
  const hasTodayButton = await todayButton.count();
  let todayToggleOk = false;
  if (!hasTodayButton) throw new Error("Mobile /production/plan missing Today toggle");
  if (hasTodayButton) {
    const before = await todayButton.innerText();
    await todayButton.click();
    const thisWeekButton = page.getByRole("button", { name: /show this week/i }).first();
    await thisWeekButton.waitFor({ timeout: 5000 });
    const after = await thisWeekButton.innerText();
    todayToggleOk = /Today/i.test(before) && /This week/i.test(after);
    await thisWeekButton.click();
  }

  const moreButton = page.getByRole("button", { name: /show \d+ more|more task/i }).first();
  const hasMoreButton = await moreButton.count();
  let moreInlineOk = false;
  if (hasMoreButton) {
    const urlBefore = page.url();
    await moreButton.click();
    await page.waitForTimeout(120);
    moreInlineOk = page.url() === urlBefore;
    if (!moreInlineOk) throw new Error("+more tasks navigated instead of expanding inline");
  }

  const scheduleTab = page.getByRole("button", { name: /^Schedule$/i }).first();
  const hasScheduleTab = await scheduleTab.count();
  let scheduleAgendaOk = false;
  if (hasScheduleTab) {
    await scheduleTab.click();
    await page.waitForTimeout(150);
    scheduleAgendaOk = await page.locator('[data-mobile-schedule-agenda="true"]').count().then(Boolean);
    if (!scheduleAgendaOk) throw new Error("Mobile Schedule did not render the agenda view");
  }

  const rowAffordanceCount = await page.locator('[data-order-row-done-checkbox="order-row-done-checkbox"], [role="checkbox"]').count();
  if (rowAffordanceCount < 1) throw new Error("Mobile /production/plan did not expose any task checkbox affordance");

  const refresh = page.getByRole("button", { name: /refresh|reload/i }).first();
  const canRefresh = await refresh.count();
  const navLinks = await page.locator("nav a, header a").count();
  return {
    interactionSmoke: true,
    mobileProductionPlan: true,
    noHorizontalScroll: true,
    firstScreenWork: true,
    todayToggleOk,
    moreInlineChecked: Boolean(hasMoreButton),
    moreInlineOk: hasMoreButton ? moreInlineOk : "no hidden tasks on current data",
    scheduleAgendaOk,
    rowAffordanceCount,
    refreshButtonPresent: Boolean(canRefresh),
    navLinkCount: navLinks,
  };
}

async function main() {
  const viewport = VIEWPORTS[PROFILE] || VIEWPORTS.desktop;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile });
  if (AUTH_COOKIE) {
    await context.addCookies([authCookieRecord(AUTH_COOKIE, BASE_URL)]);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const results = [];
  try {
    for (const path of PAGES) {
      results.push(await assertPageHealthy(page, path));
    }
    if (PROFILE === "interactions") results.push(await runInteractionSmoke(page));
    if (consoleErrors.length) {
      throw new Error(`Console errors: ${consoleErrors.slice(0, 5).join(" | ")}`);
    }
    const summary = { ok: true, profile: PROFILE, baseUrl: BASE_URL, pages: results, consoleErrorCount: consoleErrors.length, consoleErrors: [] };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, profile: PROFILE, baseUrl: BASE_URL, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
