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
  // Dashboard chrome rule. The host shell + oh wrappers should never
  // ship a stock shadcn Button variant — `outline` / `secondary` /
  // `ghost` / `default` / `destructive` / `link` use the generic
  // shadcn palette (`bg-background`, `border-border`, `bg-muted`
  // hover) and read as foreign against the oh aesthetic. Use
  // `variant="oh"` for primary actions, `variant="ohGhost"` for
  // secondary / cancel / icon-only, and `variant="ohDanger"` for
  // destructive triggers (red text + flip-to-red on hover). Auth
  // pages, the public visitor surface, and the ui/ primitives can
  // keep stock variants — they are not in this glob.
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
            "<Button variant=\"…\"> must use an `oh` variant in the dashboard surface. Use `oh` for primary actions, `ohGhost` for secondary / cancel / icon-only, and `ohDanger` for destructive triggers. Stock shadcn variants (outline, secondary, ghost, default, destructive, link) read as foreign against the oh chrome.",
        },
      ],
    },
  },
]);

export default eslintConfig;
