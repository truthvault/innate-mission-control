#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const DEFAULT_PATH = "/production/plan";
const BASE_EXPECTED_TEXT = ["Tuesday", "Production Plan"];

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
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function parseArgs(argv) {
  const parsed = {
    allowLocalhost: false,
    expect: [],
    host: "",
    minVisibleControls: 4,
    path: DEFAULT_PATH,
    port: "",
    requireSelector: [],
    url: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index] ?? "";

    if (flag === "--allow-localhost") parsed.allowLocalhost = true;
    else if (flag === "--expect") parsed.expect.push(nextValue());
    else if (flag === "--host") parsed.host = nextValue();
    else if (flag === "--min-visible-controls") parsed.minVisibleControls = Number(nextValue());
    else if (flag === "--path") parsed.path = nextValue() || DEFAULT_PATH;
    else if (flag === "--port") parsed.port = nextValue();
    else if (flag === "--require-selector") parsed.requireSelector.push(nextValue());
    else if (flag === "--url") parsed.url = nextValue();
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: npm run verify:tuesday-review-link -- --port <actual-dev-server-port> [--expect <visible text>]",
          "",
          "This opens the Mac mini Tailscale URL in desktop and mobile Chromium,",
          "authenticates with the Innate cookie, rejects login redirects, checks",
          "expected text, verifies no horizontal overflow, and proves real enabled controls exist.",
          "",
          "Useful options:",
          "  --require-selector <selector>   Require a rendered selector in both viewports",
          "  --min-visible-controls <n>      Minimum enabled buttons/links/inputs, default 4",
          "",
          "Environment alternatives:",
          "  TUESDAY_PORT=<port>",
          "  TUESDAY_REVIEW_URL=http://<tailscale-host>:<port>/production/plan",
          "  TUESDAY_EXPECT_TEXT='visible text from the changed UI'",
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(parsed.minVisibleControls) || parsed.minVisibleControls < 0) {
    throw new Error("--min-visible-controls must be a non-negative number.");
  }
  return parsed;
}

function tailscaleHost() {
  try {
    const out = execFileSync("tailscale", ["status", "--json"], { encoding: "utf8", timeout: 4000 });
    const data = JSON.parse(out);
    const dnsName = data?.Self?.DNSName || "";
    if (dnsName) return dnsName.replace(/\.$/, "");
    const hostName = data?.Self?.HostName || "";
    if (hostName) return hostName;
  } catch {
    // Tailscale is checked so review links work from Guido's MacBook Air.
  }
  return "";
}

function normalizePort(value) {
  const port = String(value || "").trim();
  if (!/^\d+$/.test(port)) return "";
  const number = Number(port);
  if (number < 1 || number > 65535) return "";
  return port;
}

function assertNonLocalhost(url, allowLocalhost) {
  if (allowLocalhost) return;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
    throw new Error(
      "Review URL resolved to localhost. Use the Mac mini Tailscale hostname/IP for Guido-facing review links, or pass --allow-localhost for local-only diagnostics."
    );
  }
}

function reviewUrl(options) {
  const explicitUrl = options.url || process.env.TUESDAY_REVIEW_URL || process.env.MISSION_CONTROL_REVIEW_URL || "";
  const explicitPort = normalizePort(options.port || process.env.TUESDAY_PORT || process.env.PORT || "");

  if (explicitUrl) {
    const url = new URL(explicitUrl);
    if (!url.pathname || url.pathname === "/") url.pathname = options.path || DEFAULT_PATH;
    if (!url.port && explicitPort) url.port = explicitPort;
    if (!url.port) {
      throw new Error("Tuesday review verification now requires the actual worktree dev-server port. Pass --port or include :<port> in TUESDAY_REVIEW_URL.");
    }
    if (explicitPort && url.port !== explicitPort) {
      throw new Error(`TUESDAY_REVIEW_URL port ${url.port} does not match explicit port ${explicitPort}. Verify the active worktree server port.`);
    }
    assertNonLocalhost(url, options.allowLocalhost);
    return url;
  }

  if (!explicitPort) {
    throw new Error("Tuesday review verification now requires the actual worktree dev-server port. Pass --port <port> or set TUESDAY_PORT.");
  }

  const host = options.host || process.env.TUESDAY_REVIEW_HOST || process.env.MISSION_CONTROL_REVIEW_HOST || tailscaleHost();
  if (!host) {
    throw new Error("Could not determine the Mac mini Tailscale host. Set TUESDAY_REVIEW_HOST explicitly.");
  }

  const protocol = process.env.TUESDAY_REVIEW_PROTOCOL || "http";
  const url = new URL(`${protocol}://${host}:${explicitPort}${options.path || DEFAULT_PATH}`);
  assertNonLocalhost(url, options.allowLocalhost);
  return url;
}

function authCookie() {
  if (process.env.SMOKE_AUTH_COOKIE) return process.env.SMOKE_AUTH_COOKIE;
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD;
  if (!secret) return "";
  const expiresAt = Date.now() + 60 * 60 * 24 * 30 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `innate-auth=${payload}.${signature}`;
}

function cookieRecord(cookie, url) {
  const [pair] = cookie.split(";", 1);
  const separator = pair.indexOf("=");
  if (separator < 1) throw new Error("Could not parse auth cookie.");
  return {
    name: pair.slice(0, separator),
    value: pair.slice(separator + 1),
    url: `${url.protocol}//${url.host}`,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: url.protocol === "https:",
  };
}

function expectedText(options) {
  const envExpect = process.env.TUESDAY_EXPECT_TEXT || "";
  const envExpectMany = (process.env.TUESDAY_EXPECT_TEXTS || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...BASE_EXPECTED_TEXT, ...envExpectMany, envExpect, ...options.expect].filter(Boolean);
}

async function fetchCheck(url, cookie, expected) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { Cookie: cookie, "User-Agent": "TuesdayReviewVerifier/2.0" },
      signal: controller.signal,
    });
    const text = await response.text();
    const missing = expected.filter((needle) => !text.includes(needle));
    return {
      ok: response.status >= 200 && response.status < 300 && missing.length === 0,
      status: response.status,
      finalUrl: response.url,
      missingText: missing,
      redirectLocation: response.status >= 300 && response.status < 400 ? response.headers.get("location") || "" : "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function viewportCheck(browser, url, cookie, expected, options, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: profile.isMobile,
    hasTouch: profile.isMobile,
    userAgent: profile.userAgent,
  });
  await context.addCookies([cookieRecord(cookie, url)]);
  const page = await context.newPage();
  try {
    const response = await page.goto(url.toString(), { waitUntil: "networkidle", timeout: 18000 });
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const finalUrl = page.url();
    const final = new URL(finalUrl);
    const missingText = expected.filter((needle) => !bodyText.includes(needle));

    const metrics = await page.evaluate(() => {
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const controls = Array.from(document.querySelectorAll("button,a[href],input,select,textarea,[role='button'],[role='link'],[tabindex]:not([tabindex='-1'])"))
        .filter((element) => {
          const disabled = element.disabled || element.getAttribute("aria-disabled") === "true";
          return !disabled && isVisible(element);
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("name") || "").trim().replace(/\s+/g, " ").slice(0, 80),
        }));
      const passwordFields = Array.from(document.querySelectorAll("input[type='password'],input[name='password']"))
        .filter(isVisible).length;
      return {
        title: document.title,
        bodyPreview: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 500),
        controlCount: controls.length,
        controlSamples: controls.slice(0, 12),
        horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        passwordFields,
      };
    });

    const selectorResults = [];
    for (const selector of options.requireSelector) {
      const count = await page.locator(selector).count();
      const visible = count > 0 ? await page.locator(selector).first().isVisible().catch(() => false) : false;
      selectorResults.push({ selector, count, visible });
    }

    const problems = [];
    if (!response || response.status() < 200 || response.status() >= 400) problems.push(`HTTP ${response?.status() ?? "no response"}`);
    if (final.pathname === "/login" || final.pathname.startsWith("/login/")) problems.push("redirected to login");
    if (metrics.passwordFields > 0) problems.push("rendered a password/login field");
    if (missingText.length) problems.push(`missing text: ${missingText.join(", ")}`);
    if (metrics.horizontalOverflowPx > 8) problems.push(`horizontal overflow ${metrics.horizontalOverflowPx}px`);
    if (metrics.controlCount < options.minVisibleControls) problems.push(`only ${metrics.controlCount} visible enabled controls`);
    for (const selector of selectorResults) {
      if (!selector.visible) problems.push(`required selector not visible: ${selector.selector}`);
    }

    return {
      ok: problems.length === 0,
      profile: profile.name,
      status: response?.status() ?? null,
      finalUrl,
      missingText,
      selectorResults,
      metrics,
      problems,
    };
  } finally {
    await context.close();
  }
}

async function browserCheck(url, cookie, expected, options) {
  const profiles = [
    {
      name: "desktop",
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      userAgent: "TuesdayReviewVerifier/2.0 desktop",
    },
    {
      name: "mobile",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      userAgent: "TuesdayReviewVerifier/2.0 mobile",
    },
  ];
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const profile of profiles) {
      results.push(await viewportCheck(browser, url, cookie, expected, options, profile));
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  loadLocalEnv();
  const options = parseArgs(process.argv.slice(2));
  const url = reviewUrl(options);
  const cookie = authCookie();
  if (!cookie) {
    throw new Error("Missing AUTH_SESSION_SECRET or SITE_PASSWORD, so the verifier cannot prove the authenticated Tuesday page.");
  }

  const expected = expectedText(options);
  const fetchResult = await fetchCheck(url, cookie, expected);
  const renderResults = await browserCheck(url, cookie, expected, options);
  const ok = fetchResult.ok && renderResults.every((result) => result.ok);
  const result = {
    ok,
    url: url.toString(),
    port: url.port,
    expectedText: expected,
    fetch: fetchResult,
    render: renderResults,
    note: ok
      ? "Tuesday review URL proved the authenticated app at the explicit worktree port in desktop and mobile Chromium."
      : "Tuesday review URL did not prove the authenticated app at the explicit worktree port in desktop and mobile Chromium.",
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
