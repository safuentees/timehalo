import { execSync } from "node:child_process";

// Playwright globalSetup — runs once before all tests. Shells out to
// tsx so the Prisma seed script runs in its own Node process with
// full module resolution. Importing Prisma's generated client
// directly inside a Playwright test fails with "exports is not
// defined" because the generated client mixes ESM + CJS in a way
// Playwright's runtime doesn't reconcile.

export default async function globalSetup() {
  execSync("pnpm exec tsx e2e/seed-test-user.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}
