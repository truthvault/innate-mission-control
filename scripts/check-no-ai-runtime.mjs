#!/usr/bin/env node
/**
 * No-AI-in-the-engine guard — enforces Guido's rule that Tuesday's runtime
 * (the "engine") never depends on any AI, including Claude.
 *
 * Fails if any file under app/ or lib/ imports or calls an AI provider SDK.
 * AI belongs only in the "copilot" layer (Hermes, dev-time agents) — never in
 * the deployed app. See docs/current/tuesday-roadmap.md.
 *
 * Runs in CI alongside the theme-drift ratchet. Zero dependencies.
 */

import fs from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib"];

// Import specifiers / SDK package names that mean "an LLM is being called".
// Matched against import/require sources and fetch URLs.
const BANNED = [
  /@anthropic-ai\//i,
  /\bfrom\s+["']openai["']/i,
  /\brequire\(\s*["']openai["']\s*\)/i,
  /@google\/generative-ai/i,
  /\bfrom\s+["']cohere-ai["']/i,
  /\bfrom\s+["']@mistralai\//i,
  /\bfrom\s+["']langchain/i,
  /api\.anthropic\.com/i,
  /api\.openai\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /openrouter\.ai/i,
];

// Words that are legitimately common in this codebase (model of a table, an
// "analysis" of freight, etc.) are NOT matched — we only match real SDK
// imports and provider API hosts above, to avoid false positives.

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const findings = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line, i) => {
      // Skip comment-only lines (documentation may mention these names).
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const pattern of BANNED) {
        if (pattern.test(code)) {
          findings.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
          break;
        }
      }
    });
  }
}

if (findings.length) {
  console.error(
    "No-AI-in-the-engine guard FAILED — the deployed app must not call any AI/LLM.\n" +
      "AI belongs in the copilot layer (Hermes / dev-time agents), never in app/ or lib/.\n" +
      "See docs/current/tuesday-roadmap.md.\n\n" +
      findings.map((f) => "  - " + f).join("\n")
  );
  process.exit(1);
}
console.log(`No-AI-in-the-engine guard OK — app/ and lib/ are free of AI/LLM runtime calls.`);
