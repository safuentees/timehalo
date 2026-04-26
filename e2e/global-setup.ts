import { execSync } from "node:child_process";

export default async function globalSetup() {
  execSync("pnpm exec tsx e2e/seed-test-user.ts", {
    stdio: "inherit",
    cwd: process.cwd(),
  });
}
