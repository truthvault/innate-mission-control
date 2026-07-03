#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULTS_BY_ASSET = {
  "assets/innate-benchtop-configurator.js": {
    required: [
      "phase12-hardening-runtime-20260623",
      "innate-selected-rotate",
      "innate-panel-is-active",
      "innate-panel-card-is-active",
    ],
    forbidden: [
      "Add a benchtop 1200",
      "innate-benchtop-quote.vercel.app",
    ],
    staleRoots: [
      "/Users/mack-mini/innate-benchtop-quote/dist",
      "/Users/mack-mini/innate-benchtop-quote/src",
    ],
  },
};

function parseArgs(argv) {
  const parsed = {
    allowStaleSource: false,
    assetKey: "",
    baseline: "",
    candidate: "",
    forbid: [],
    protectMarker: [],
    require: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index] ?? "";

    if (flag === "--allow-stale-source") parsed.allowStaleSource = true;
    else if (flag === "--asset-key") parsed.assetKey = nextValue();
    else if (flag === "--baseline") parsed.baseline = nextValue();
    else if (flag === "--candidate") parsed.candidate = nextValue();
    else if (flag === "--forbid") parsed.forbid.push(nextValue());
    else if (flag === "--protect-marker") parsed.protectMarker.push(nextValue());
    else if (flag === "--require") parsed.require.push(nextValue());
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: npm run guard:shopify-asset -- --candidate <file> --asset-key <theme asset key>",
          "",
          "Blocks stale Shopify JS/CSS asset replacement before theme pushes.",
          "",
          "Useful options:",
          "  --require <marker>          Marker that must exist in the candidate",
          "  --forbid <marker>           Marker that must not exist in the candidate",
          "  --baseline <file>           Compare protected baseline markers too",
          "  --protect-marker <marker>   Marker that must be preserved when baseline has it",
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.candidate) throw new Error("--candidate is required.");
  if (!parsed.assetKey) parsed.assetKey = inferAssetKey(parsed.candidate);
  return parsed;
}

function inferAssetKey(candidate) {
  const normalized = candidate.split(path.sep).join("/");
  const assetsIndex = normalized.lastIndexOf("/assets/");
  if (assetsIndex >= 0) return normalized.slice(assetsIndex + 1);
  return path.basename(candidate);
}

function readText(file, label) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${resolved}`);
  return { path: resolved, text: fs.readFileSync(resolved, "utf8") };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function defaultsFor(assetKey) {
  return DEFAULTS_BY_ASSET[assetKey] || { required: [], forbidden: [], staleRoots: [] };
}

function isForbiddenStalePath(candidatePath, defaults, allowStaleSource) {
  if (allowStaleSource) return false;
  const normalized = path.resolve(candidatePath);
  return defaults.staleRoots.some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`));
}

function contains(text, marker) {
  return marker && text.includes(marker);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const candidate = readText(options.candidate, "candidate");
  const defaults = defaultsFor(options.assetKey);
  const required = unique([...defaults.required, ...options.require]);
  const forbidden = unique([...defaults.forbidden, ...options.forbid]);
  const problems = [];

  if (isForbiddenStalePath(candidate.path, defaults, options.allowStaleSource)) {
    problems.push(`candidate is from a known stale local source path: ${candidate.path}`);
  }

  const missingRequired = required.filter((marker) => !contains(candidate.text, marker));
  if (missingRequired.length) {
    problems.push(`missing required marker(s): ${missingRequired.join(", ")}`);
  }

  const presentForbidden = forbidden.filter((marker) => contains(candidate.text, marker));
  if (presentForbidden.length) {
    problems.push(`contains forbidden stale marker(s): ${presentForbidden.join(", ")}`);
  }

  let baselineResult = null;
  if (options.baseline) {
    const baseline = readText(options.baseline, "baseline");
    const protectedMarkers = unique([...required, ...options.protectMarker]);
    const baselineHasCandidateMisses = protectedMarkers.filter(
      (marker) => contains(baseline.text, marker) && !contains(candidate.text, marker)
    );
    baselineResult = {
      path: baseline.path,
      protectedMarkers,
      missingFromCandidate: baselineHasCandidateMisses,
    };
    if (baselineHasCandidateMisses.length) {
      problems.push(`candidate drops marker(s) present in baseline: ${baselineHasCandidateMisses.join(", ")}`);
    }
  }

  const result = {
    ok: problems.length === 0,
    assetKey: options.assetKey,
    candidate: candidate.path,
    requiredMarkers: required,
    forbiddenMarkers: forbidden,
    baseline: baselineResult,
    problems,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exit(1);
}
