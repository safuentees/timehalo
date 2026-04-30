import { defineConfig, devices } from "@playwright/test";

// Playwright config — minimal. Boots `pnpm dev` if not already
// running, points at localhost:3000, runs Chromium-only (we don't
// need Firefox/Safari coverage for hydration smoke tests).

export default defineConfig({
  testDir: "./e2e",
  // Seeds the test user via tsx → Prisma. See e2e/global-setup.ts
  // for why we don't import Prisma directly in the spec files.
  globalSetup: "./e2e/global-setup.ts",
  // Hydration tests run serially so console-error capture from one
  // test doesn't bleed into another via the shared page lifecycle.
  // workers: 1 also prevents `pnpm dev`'s on-demand compilation from
  // racing across two parallel page loads — when /login and /h/<host>
  // hit the dev server in parallel, base-ui's useId snapshots can
  // diverge between SSR and CSR and emit a phantom hydration mismatch.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    // Only capture trace on first failure — saves disk on green runs.
    trace: "retain-on-failure",
  },
  projects: [
    // Authenticate once, persist cookies to playwright/.auth/user.json.
    // The "authed" project below `use`s that storage so each authed spec
    // starts already-logged-in instead of re-running the credentials form.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      // Public specs — no persisted auth, hit the site as an anonymous
      // visitor. Hydration smoke + the end-to-end booking-flow spec live
      // here. Uses an empty storageState so partner-onboarding-style
      // contamination from prior runs can never bleed in.
      name: "public",
      testMatch: /(?:hydration|booking-flow)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      // Authed hydration smoke + stress + future flow specs. Reuses the
      // cached storageState from the setup project. testMatch covers
      // the canonical `hydration-authed.spec.ts` plus the stress
      // variant `hydration-stress.spec.ts` (B.PT51 — N reloads per
      // route to catch the non-deterministic useId-counter-drift class
      // of bug that single-reload smoke can miss).
      name: "authed",
      testMatch: /(?:hydration-authed|hydration-stress)\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
