#!/usr/bin/env node
import process from "node:process";
import { execFileSync } from "node:child_process";

function tailscaleHost() {
  try {
    const out = execFileSync("tailscale", ["status", "--json"], { encoding: "utf8", timeout: 4000 });
    const data = JSON.parse(out);
    const dnsName = data?.Self?.DNSName || "";
    if (dnsName) return dnsName.replace(/\.$/, "");
    const hostName = data?.Self?.HostName || "";
    if (hostName) return hostName;
  } catch {
    // Tailscale is optional; fall back below.
  }
  return "127.0.0.1";
}

function reviewUrl() {
  if (process.env.TUESDAY_REVIEW_URL) return process.env.TUESDAY_REVIEW_URL;
  if (process.env.MISSION_CONTROL_REVIEW_URL) return process.env.MISSION_CONTROL_REVIEW_URL;
  const port = process.env.PORT || process.env.TUESDAY_PORT || "3000";
  const host = process.env.TUESDAY_REVIEW_HOST || process.env.MISSION_CONTROL_REVIEW_HOST || tailscaleHost();
  const protocol = host === "127.0.0.1" || host === "localhost" ? "http" : (process.env.TUESDAY_REVIEW_PROTOCOL || "http");
  return `${protocol}://${host}:${port}/production/plan`;
}

async function main() {
  const url = reviewUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
    const ok = response.status >= 200 && response.status < 400;
    const result = {
      ok,
      url,
      status: response.status,
      note: ok ? "Tuesday review URL responded." : "Tuesday review URL did not return a success/redirect response.",
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(ok ? 0 : 1);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, url: reviewUrl(), error: error?.message || String(error) }, null, 2));
  process.exit(1);
});
