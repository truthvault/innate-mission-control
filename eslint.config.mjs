import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    ".next-static-archive/**",
    "next-env.d.ts",

    // Local agent/runtime and audit artifacts. They are kept out of Vercel
    // deployments too, and should not influence app lint health.
    ".hermes/**",
    "backups/**",
    "reference/**",
    "reports/**",
    "artifacts/**",
    "captures/**",
    "screenshots/**",
    "seo/**",
    "shopify-theme-worktrees/**",
    "tmp/**",
    "tmp_*.js",
    "tmp_*.py",

    // One-off QA/dogfood scripts with embedded minified browser bundles —
    // evidence tooling, not app code. Linting them produces hundreds of
    // false errors from the minified payloads.
    "scripts/dogfood-*.mjs",
    "scripts/audit-benchtop-deep-parity.mjs",
    "work/**",
  ]),
]);

export default eslintConfig;
