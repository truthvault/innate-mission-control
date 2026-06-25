#!/usr/bin/env node

import { execSync } from "node:child_process";
import process from "node:process";

const ALLOWED_PRODUCTION_REFS = new Set([
  "integration/tuesday-process-live-baseline-20260626",
]);

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function currentGitRef() {
  return (
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_REF_NAME ||
    process.env.BRANCH ||
    run("git rev-parse --abbrev-ref HEAD") ||
    "UNKNOWN"
  );
}

function currentCommit() {
  return process.env.VERCEL_GIT_COMMIT_SHA || run("git rev-parse HEAD") || "UNKNOWN";
}

function isDirty() {
  if (process.env.VERCEL === "1") return false;
  return run("git status --porcelain --untracked-files=all").length > 0;
}

const target = process.env.VERCEL_TARGET || process.env.VERCEL_ENV || "local";
const ref = currentGitRef();
const commit = currentCommit();

if (target !== "production") {
  console.log(`[tuesday-deploy-guard] ${target} deployment allowed for ${ref}.`);
  process.exit(0);
}

if (!ALLOWED_PRODUCTION_REFS.has(ref)) {
  console.error(`[tuesday-deploy-guard] BLOCKED production deploy from ${ref} (${commit}).`);
  console.error(`[tuesday-deploy-guard] Allowed production ref(s): ${[...ALLOWED_PRODUCTION_REFS].join(", ")}.`);
  console.error("[tuesday-deploy-guard] Use preview deployments for other branches, or update this guard in the live-baseline branch deliberately.");
  process.exit(42);
}

if (isDirty()) {
  console.error(`[tuesday-deploy-guard] BLOCKED dirty local production deploy from ${ref} (${commit}).`);
  console.error("[tuesday-deploy-guard] Commit or stash changes before moving the live alias.");
  process.exit(43);
}

console.log(`[tuesday-deploy-guard] production deployment allowed for ${ref} (${commit}).`);
