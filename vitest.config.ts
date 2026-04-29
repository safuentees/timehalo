import { defineConfig } from "vitest/config";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";

// Vitest 4 config — server-side contract tests in Node.
//
// `vite-tsconfig-paths` reads `tsconfig.json`'s `paths` directly, so
// the `@/*` alias resolves the same way in tests as it does at build
// time. Keep `tsconfig.json` as the single source of truth — never
// duplicate path aliases here.
//
// Tight `include` glob — the repo has nested node_modules under
// `.claude/worktrees/` which slip past the default exclude and cause
// vitest to crawl thousands of upstream package tests. By naming the
// include explicitly, we never look anywhere except `src/**/__tests__/`.

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/__tests__/**/*.test.ts"],
    // Load `.env` before the prisma singleton initializes, otherwise
    // DATABASE_URL is undefined and tests hit an empty default db.
    setupFiles: ["test/vitest.setup.ts"],
    // Tests hit the real dev.db; run sequentially so beforeEach wipes
    // can't race. fileParallelism: false serializes test FILES; the
    // forks pool already runs each file in one fork.
    pool: "forks",
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // `server-only` is Next's runtime guard — throws if pulled into a
      // client bundle. We're running in a Node test process, the guard
      // is moot, and the package isn't a standalone install. Stub to
      // an empty module so files that `import "server-only"` at the top
      // (rate-limit, observability, tasks, etc.) load cleanly.
      "server-only": path.resolve(__dirname, "test/server-only-shim.ts"),
    },
  },
});
