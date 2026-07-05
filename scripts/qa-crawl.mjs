#!/usr/bin/env node
/**
 * Tuesday QA crawler — uses the app like a person, flags what a person would.
 *
 * Per route:
 *   1. FLASH DETECTOR: captures visible text shortly after first paint and
 *      again after settle; a large diff = content that "shows for a second
 *      then jumps".
 *   2. CONSOLE/NETWORK TRAP: console errors, page errors, failed same-origin
 *      requests, and 5xx responses are findings.
 *   3. SAFE INTERACTION WALK: opens/closes <details>, clicks buttons/links
 *      whose accessible text matches safe verbs. Never touches destructive
 *      or mutating controls (delete/save/approve/done/add/submit/refresh...).
 *   4. OVERFLOW CHECK: horizontal scroll in the main document.
 *
 * Usage: SMOKE_BASE_URL=http://localhost:3777 node scripts/qa-crawl.mjs
 * Exit non-zero when findings exist. Report: reports/qa-crawl/.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { chromium } from "playwright";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
loadLocalEnv();

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3777").replace(/\/$/, "");
const ROUTES = [
  "/production/plan",
  "/production/plan?mode=schedule",
  "/production",
  "/production/stock",
  "/production/samples",
  "/leads",
  "/today",
  "/costings",
  "/freight-quotes",
];

const SAFE_CLICK = /^(open|show|view|close|expand|collapse|week|today|orders|schedule|previous|next|menu|all|nick|dylan|filter|current view|include|details?)\b/i;
const NEVER_CLICK = /delete|remove|save|approve|done|mark|add|submit|refresh|reload|archive|hide|reset|send|create|upload|edit|sign out|logout|complete|drop/i;

function authCookieValue() {
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD;
  if (!secret) throw new Error("SITE_PASSWORD required");
  const payload = `v1.${Date.now() + 3600_000}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${payload}.${sig}`;
}

async function pageSnapshot(page) {
  return page.evaluate(() => ({
    text: document.body?.innerText?.replace(/\s+/g, " ").trim() || "",
    overflow: Math.max(0, (document.documentElement.scrollWidth || 0) - (document.documentElement.clientWidth || 0)),
  }));
}

function textDiffRatio(a, b) {
  if (!a && !b) return 0;
  const longer = Math.max(a.length, b.length) || 1;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  return 1 - (prefix + suffix) / longer;
}

const findings = [];
const note = (route, kind, detail) => findings.push({ route, kind, detail: String(detail).slice(0, 240) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: "innate-auth", value: authCookieValue(), url: BASE }]);

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    if (!req.url().startsWith(BASE)) return;
    // RSC prefetches cancelled by navigation are normal browser behaviour.
    if (req.url().includes("_rsc=") && req.failure()?.errorText === "net::ERR_ABORTED") return;
    consoleErrors.push(`requestfailed: ${req.method()} ${req.url()} ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.url().startsWith(BASE) && res.status() >= 500) consoleErrors.push(`http ${res.status()}: ${res.url()}`);
  });

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(700);
    const early = await pageSnapshot(page);
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const settled = await pageSnapshot(page);

    const ratio = textDiffRatio(early.text, settled.text);
    // A first paint that shows an honest loading placeholder ("Loading…",
    // "Checking…") resolving to content is expected, not a jarring flash. Only
    // flag when the first paint was already real content that then got replaced
    // (the "wrong view for a second then jumps" pattern Guido cares about).
    const earlyWasLoading = /\bloading\b|\bchecking\b|checking pending/i.test(early.text);
    if (ratio > 0.35 && !earlyWasLoading) note(route, "flash", `content changed ${(ratio * 100).toFixed(0)}% between first paint and settle`);
    if (settled.overflow > 4) note(route, "overflow", `${settled.overflow}px horizontal overflow`);

    const clickables = await page.$$eval("button, [role=button], summary", (els) =>
      els.slice(0, 400).map((el, index) => ({
        index,
        text: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
      }))
    );
    let clicks = 0;
    for (const c of clickables) {
      if (clicks >= 20) break;
      if (!c.text || NEVER_CLICK.test(c.text) || !SAFE_CLICK.test(c.text)) continue;
      const before = consoleErrors.length;
      try {
        const handles = await page.$$("button, [role=button], summary");
        const handle = handles[c.index];
        if (!handle || !(await handle.isVisible().catch(() => false))) continue;
        await handle.click({ timeout: 2500 }).catch(() => {});
        clicks++;
        await page.waitForTimeout(400);
        await page.keyboard.press("Escape").catch(() => {});
      } catch { /* non-fatal */ }
      if (consoleErrors.length > before) {
        note(route, "click-error", `clicking "${c.text}" produced: ${consoleErrors[consoleErrors.length - 1]}`);
      }
    }
    for (const err of consoleErrors) {
      if (/Download the React DevTools/i.test(err)) continue;
      note(route, "console", err);
    }
  } catch (err) {
    note(route, "load", err instanceof Error ? err.message : String(err));
  } finally {
    await page.close();
  }
}
await browser.close();

fs.mkdirSync("reports/qa-crawl", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const md = [`# QA crawl — ${BASE} — ${stamp}`, "", findings.length ? "Findings:" : "No findings: routes load clean, no flash above threshold, safe clicks silent, no overflow."];
for (const f of findings) md.push(`- [${f.kind}] ${f.route} — ${f.detail}`);
fs.writeFileSync(`reports/qa-crawl/crawl-${stamp}.md`, md.join("\n"));
console.log(md.join("\n"));
process.exit(findings.length ? 1 : 0);
