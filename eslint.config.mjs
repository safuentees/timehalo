import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "design_handoff_brutalist_writing/**",
    "design_handoff_halftone_lab/**",
    "src/generated/**",
    ".claude/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  {
    files: [
      "src/app/(host)/**/*.{ts,tsx}",
      "src/components/oh/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXOpeningElement[name.name="Button"] JSXAttribute[name.name="variant"][value.value=/^(default|outline|secondary|ghost|destructive|link)$/]',
          message:
            "<Button variant=\"…\"> must use an `oh` variant in the dashboard surface. Use `oh` for primary actions, `ohGhost` for secondary / cancel / icon-only. Stock shadcn variants (outline, secondary, ghost, default, destructive, link) read as foreign against the oh chrome.",
        },
      ],
    },
  },
]);

export default eslintConfig;
