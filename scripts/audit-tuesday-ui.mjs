#!/usr/bin/env node
import process from "node:process";
import crypto from "node:crypto";
import fs from "node:fs";
import { chromium } from "playwright";

const PROFILE = process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] || "desktop";
const BASE_URL = (process.env.TUESDAY_BASE_URL || process.env.MISSION_CONTROL_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const AUTH_COOKIE = process.env.TUESDAY_AUTH_COOKIE || process.env.INNATE_AUTH_COOKIE || signedAuthCookie();

function loadLocalEnv() {
  if (!fs.existsSync(".env.local")) return;
  const text = fs.readFileSync(".env.local", "utf8");
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

function signedAuthCookie() {
  loadLocalEnv();
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD;
  if (!secret) return "";
  const expiresAt = Date.now() + 60 * 60 * 24 * 30 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

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
