#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipSmoke = args.has("--skip-smoke");
const allowDirty = args.has("--allow-dirty");

const PROJECT = "innate-mission-control";
const LIVE_URL = "https://innate-mission-control.vercel.app";

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : "";
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}${stderr}${stdout}`);
  }
  return result.stdout ?? "";
}

function capture(command, commandArgs) {
  return execFileSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function requireCleanWorktree() {
  const status = capture("git", ["status", "--short"]);
  if (status && !allowDirty) {
    throw new Error(`Worktree is dirty. Commit or stash first, or pass --allow-dirty if you are only verifying.\n${status}`);
  }
}

function currentGit() {
  return {
    branch: capture("git", ["branch", "--show-current"]),
    sha: capture("git", ["rev-parse", "HEAD"]),
    shortSha: capture("git", ["rev-parse", "--short", "HEAD"]),
  };
}

function listDeployments({ environment, status = "READY" }) {
  const raw = run("vercel", ["ls", PROJECT, "--environment", environment, "--status", status, "--format", "json"], { capture: true });
  const parsed = JSON.parse(raw);
  return parsed.deployments ?? [];
}

function findReadyPreview({ branch, sha }) {
  const deployments = listDeployments({ environment: "preview" });
  const matches = deployments
    .filter((deployment) => deployment.state === "READY")
    .filter((deployment) => deployment.meta?.githubCommitSha === sha)
    .filter((deployment) => deployment.meta?.githubCommitRef === branch)
    .sort((a, b) => (b.ready ?? b.createdAt ?? 0) - (a.ready ?? a.createdAt ?? 0));

  return { deployment: matches[0] ?? null, deployments };
}

function findReadyProduction({ sha }) {
  const deployments = listDeployments({ environment: "production" });
  return deployments
    .filter((deployment) => deployment.state === "READY")
    .filter((deployment) => deployment.meta?.githubCommitSha === sha)
    .sort((a, b) => (b.ready ?? b.createdAt ?? 0) - (a.ready ?? a.createdAt ?? 0))[0] ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReadyProduction(git, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastSeen = "none";
  while (Date.now() < deadline) {
    attempt += 1;
    const production = findReadyProduction(git);
    if (production) return production;
    const recent = listDeployments({ environment: "production" }).slice(0, 4);
    lastSeen = recent
      .map((deployment) => `${deployment.state} ${deployment.meta?.githubCommitSha?.slice(0, 7) ?? "no-sha"}`)
      .join(", ") || "none";
    console.log(`  waiting for production READY for ${git.shortSha} (${attempt}; recent: ${lastSeen})`);
    await sleep(Math.min(15_000, 3_000 + attempt * 1_000));
  }
  throw new Error(`Promotion finished, but no Ready production deployment found for ${git.shortSha} after ${Math.round(timeoutMs / 1000)}s. Recent production deployments: ${lastSeen}`);
}

function deploymentUrl(deployment) {
  return deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`;
}

function smokeLive() {
  run("npm", ["run", "smoke:tuesday"], { env: { SMOKE_BASE_URL: LIVE_URL } });
}

async function main() {
  requireCleanWorktree();
  const git = currentGit();
  const started = Date.now();

  console.log(`Tuesday fast ship`);
  console.log(`- branch: ${git.branch}`);
  console.log(`- commit: ${git.shortSha}`);

  const { deployment: preview, deployments } = findReadyPreview(git);
  if (!preview) {
    const sameBranch = deployments
      .filter((deployment) => deployment.meta?.githubCommitRef === git.branch)
      .slice(0, 5)
      .map((deployment) => `  - ${deployment.state} ${deployment.meta?.githubCommitSha?.slice(0, 7) ?? "no-sha"} ${deploymentUrl(deployment)}`)
      .join("\n");
    throw new Error(`No Ready preview found for ${git.branch}@${git.shortSha}. Push the branch and wait for the Git preview to become Ready.\nRecent previews on this branch:\n${sameBranch || "  none"}`);
  }

  const previewUrl = deploymentUrl(preview);
  const previewSeconds = preview.buildingAt && preview.ready ? Math.round((preview.ready - preview.buildingAt) / 1000) : null;
  console.log(`- ready preview: ${previewUrl}${previewSeconds ? ` (${previewSeconds}s build)` : ""}`);

  if (dryRun) {
    console.log("- dry run: not promoting or smoking production");
    return;
  }

  console.log("- promoting ready preview to production...");
  run("vercel", ["promote", previewUrl, "--yes", "--timeout", "5m"]);

  console.log("- confirming production deployment...");
  const production = await waitForReadyProduction(git);
  console.log(`- production deployment: ${deploymentUrl(production)}`);
  console.log(`- live URL: ${LIVE_URL}/production/plan`);
  console.log(`- delight test URL: ${LIVE_URL}/production/plan?delight=off disables the unicorn`);

  if (!skipSmoke) {
    console.log("- smoking production...");
    smokeLive();
  } else {
    console.log("- production smoke skipped by --skip-smoke");
  }

  console.log(`Tuesday fast ship OK in ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
