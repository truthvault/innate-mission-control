#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";

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

loadLocalEnv();

const baseUrl = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function signedAuthCookie() {
  if (process.env.SMOKE_AUTH_COOKIE) return process.env.SMOKE_AUTH_COOKIE;
  const secret = process.env.AUTH_SESSION_SECRET || process.env.SITE_PASSWORD;
  if (!secret) return "innate-auth=authenticated";
  const expiresAt = Date.now() + 60 * 60 * 24 * 30 * 1000;
  const payload = `v1.${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `innate-auth=${payload}.${signature}`;
}

const authCookie = signedAuthCookie();

const checks = [
  {
    path: "/login",
    label: "login",
    expect: ["Tuesday", "Password"],
    auth: false,
  },
  {
    path: "/leads",
    label: "leads",
    expect: ["Leads", "Tuesday"],
    auth: true,
  },
  {
    path: "/workboard",
    label: "workboard",
    expect: ["Workboard", "Today", "Projects", "Inbox", "Waiting", "Done"],
    auth: true,
  },
  {
    path: "/production",
    label: "production default",
    expect: ["Production Plan", "Tuesday", "Synced"],
    auth: true,
  },
  {
    path: "/production/plan",
    label: "plan",
    expect: ["Production Plan", "Tuesday", "Synced"],
    auth: true,
  },
  {
    path: "/production/samples",
    label: "samples",
    expect: ["Sample Stock", "Tuesday", "Synced"],
    auth: true,
  },
];

async function readText(response) {
  try {
    return await response.text();
  } catch (error) {
    return `[could not read response: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

async function checkPage(check) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    headers: check.auth ? { Cookie: authCookie } : {},
    redirect: "manual",
  });
  const text = await readText(response);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${check.label}: expected 2xx, got ${response.status}`);
  }
  for (const needle of check.expect) {
    if (!text.includes(needle)) {
      throw new Error(`${check.label}: missing expected text ${JSON.stringify(needle)}`);
    }
  }
  return `${check.label}: ${response.status}`;
}

const results = [];
for (const check of checks) {
  results.push(await checkPage(check));
}

console.log(`Tuesday smoke OK (${baseUrl})`);
for (const result of results) console.log(`- ${result}`);
