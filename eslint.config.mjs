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
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Local agent/runtime and audit artifacts. They are kept out of Vercel
    // deployments too, and should not influence app lint health.
    ".hermes/**",
    "backups/**",
    "reference/**",
    "seo/**",
    "tmp_*.js",
    "tmp_*.py",
  ]),
]);

export default eslintConfig;
