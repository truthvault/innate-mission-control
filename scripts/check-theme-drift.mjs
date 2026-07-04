#!/usr/bin/env node
/**
 * Theme drift ratchet — the enforcement arm of docs/current/theme.md.
 *
 * Counts, per file: hardcoded colour literals (hex/rgba outside the token
 * module), off-scale border radii, and off-scale font weights. Compares
 * against the committed baseline (scripts/theme-drift-baseline.json):
 *
 *   - any file whose counts INCREASE fails the check (CI-fatal)
 *   - decreases pass, and `--update-baseline` records the improvement
 *
 * The doc explains the system; this script makes drift unable to grow.
 */

import fs from "node:fs";
import path from "node:path";

const BASELINE_PATH = "scripts/theme-drift-baseline.json";
const UPDATE = process.argv.includes("--update-baseline");

// theme.md scales
const ALLOWED_RADII = new Set(["8", "14", "999"]); // radiusSm, radius, pill
const ALLOWED_WEIGHTS = new Set(["400", "500", "600", "700", "800", "900"]);

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = [...listFiles("app"), ...listFiles("components")]
  .filter((f) => !f.includes("mission-control-tokens"));

const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
const rgbaRe = /rgba?\([^)]+\)/g;
const radiusRe = /borderRadius: ([0-9.]+)/g;
const weightRe = /fontWeight: ([0-9]+)/g;

const current = {};
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  const colours = (s.match(hexRe) || []).length + (s.match(rgbaRe) || []).length;
  let offRadii = 0;
  for (const m of s.matchAll(radiusRe)) if (!ALLOWED_RADII.has(m[1])) offRadii++;
  let offWeights = 0;
  for (const m of s.matchAll(weightRe)) if (!ALLOWED_WEIGHTS.has(m[1])) offWeights++;
  const total = colours + offRadii + offWeights;
  if (total > 0) current[f] = { colours, offRadii, offWeights };
}

if (UPDATE || !fs.existsSync(BASELINE_PATH)) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`Theme drift baseline ${UPDATE ? "updated" : "created"}: ${Object.keys(current).length} files tracked.`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const failures = [];
let improved = 0;

for (const [file, counts] of Object.entries(current)) {
  const base = baseline[file] || { colours: 0, offRadii: 0, offWeights: 0 };
  for (const key of ["colours", "offRadii", "offWeights"]) {
    if (counts[key] > base[key]) {
      failures.push(`${file}: ${key} ${base[key]} -> ${counts[key]} (drift increased — use theme tokens/scales, see docs/current/theme.md)`);
    } else if (counts[key] < base[key]) {
      improved++;
    }
  }
}

if (failures.length > 0) {
  console.error("Theme drift ratchet FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

const totals = Object.values(current).reduce(
  (a, c) => ({ colours: a.colours + c.colours, offRadii: a.offRadii + c.offRadii, offWeights: a.offWeights + c.offWeights }),
  { colours: 0, offRadii: 0, offWeights: 0 }
);
console.log(`Theme drift ratchet OK. Current debt: ${totals.colours} colour literals, ${totals.offRadii} off-scale radii, ${totals.offWeights} off-scale weights across ${Object.keys(current).length} files.`);
if (improved > 0) console.log(`${improved} metric(s) improved vs baseline — run with --update-baseline to lock in the gains.`);
