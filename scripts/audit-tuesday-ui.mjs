#!/usr/bin/env node
import process from "node:process";
import { chromium } from "playwright";

const PROFILE = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] || "desktop";
const BASE_URL = (process.env.TUESDAY_BASE_URL || process.env.MISSION_CONTROL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUTH_COOKIE = process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE || "";

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, isMobile: false },
  mobile: { width: 390, height: 844, isMobile: true },
  interactions: { width: 1280, height: 900, isMobile: false },
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
  if (!bodyText || bodyText.length < 20) throw new Error(`${path} rendered an unexpectedly empty body`);
  if (/Application error|Unhandled Runtime Error|Internal Server Error/i.test(bodyText)) {
    throw new Error(`${path} rendered an application error`);
  }
  return { path, status: response.status(), title, textLength: bodyText.length };
}

async function runInteractionSmoke(page) {
  await page.goto(`${BASE_URL}/production/plan`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  const refresh = page.getByRole("button", { name: /refresh|reload/i }).first();
  const canRefresh = await refresh.count();
  const navLinks = await page.locator("nav a, header a").count();
  return { interactionSmoke: true, refreshButtonPresent: Boolean(canRefresh), navLinkCount: navLinks };
}

async function main() {
  const viewport = VIEWPORTS[PROFILE] || VIEWPORTS.desktop;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.isMobile });
  if (AUTH_COOKIE) {
    const url = new URL(BASE_URL);
    await context.addCookies([{ name: "innate-auth", value: AUTH_COOKIE, domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
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
    const summary = { ok: true, profile: PROFILE, baseUrl: BASE_URL, pages: results, consoleErrorCount: consoleErrors.length, consoleErrors: consoleErrors.slice(0, 5) };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, profile: PROFILE, baseUrl: BASE_URL, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
