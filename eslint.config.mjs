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
    "design_handoff_brutalist_writing/**",
    "design_handoff_halftone_lab/**",
    "src/generated/**",
    // Local worktrees / Claude session artifacts — they contain
    // their own .next/dev build output that ESLint shouldn't scan.
    // Adding 59k+ phantom warnings without this.
    ".claude/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
