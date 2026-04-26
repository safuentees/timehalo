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
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    // Only capture trace on first failure — saves disk on green runs.
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
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
