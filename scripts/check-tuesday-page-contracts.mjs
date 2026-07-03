#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const contractsPath = path.join(repoRoot, "reference", "tuesday", "page-contracts.md");

const requiredContracts = [
  "/production/plan",
  "/production/plan?view=process-templates",
  "/leads",
  "/quoting",
  "/production/stock",
  "/production/samples",
  "/production/dispatch",
];

const requiredFields = [
  "Route/view:",
  "Primary user:",
  "Purpose:",
  "This is:",
  "This is not:",
  "Must preserve:",
  "Success looks like:",
  "Verification:",
];

function fail(message) {
  console.error(`Tuesday page contract check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(contractsPath)) {
  fail(`missing ${path.relative(repoRoot, contractsPath)}`);
}

const text = fs.readFileSync(contractsPath, "utf8");

for (const route of requiredContracts) {
  const heading = `## \`${route}\``;
  const start = text.indexOf(heading);
  if (start === -1) fail(`missing contract heading ${heading}`);

  const nextHeading = text.indexOf("\n## `", start + heading.length);
  const section = text.slice(start, nextHeading === -1 ? text.length : nextHeading);

  for (const field of requiredFields) {
    if (!section.includes(field)) fail(`${route} is missing "${field}"`);
  }
}

console.log(`Tuesday page contract check passed: ${requiredContracts.length} contracts present.`);
