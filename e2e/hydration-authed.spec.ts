import { test, expect } from "@playwright/test";

// Hydration tests for routes behind the dashboard layout (the
// BrutalistDashboardLayout that the user's stack trace pointed at).
//
// Auth is cached once by e2e/auth.setup.ts (the "setup" project in
// playwright.config.ts). This spec runs in the "authed" project which
// loads storageState: playwright/.auth/user.json — every test starts
// already-logged-in. No inline login per route.

const HYDRATION_RE = /hydrat|did not match|server.+rendered|server\/client/i;

const AUTHED_ROUTES = [
  "/bookings",
  "/availability",
  "/profile",
  "/settings",
];

test.describe.configure({ mode: "serial" });

for (const route of AUTHED_ROUTES) {
  test(`hydrates cleanly (authed): ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message + (err.stack ? "\n" + err.stack : ""));
    });

    await page.goto(route, { waitUntil: "load" });
    // Don't use networkidle — the live-queue SSE subscription (item 8)
    // holds a persistent connection so networkidle never fires.
    // Hydration finishes within ~1s of load; this buffer is plenty
    // for React 19's deferred work without timing out.
    await page.waitForTimeout(1500);

    const allErrors = [...consoleErrors, ...pageErrors];
    const hydrationErrors = allErrors.filter((e) => HYDRATION_RE.test(e));

    if (hydrationErrors.length > 0) {
      console.log(`\n=== Hydration errors on ${route} ===`);
      hydrationErrors.forEach((e) => console.log(e.slice(0, 1500)));
      const others = allErrors
        .filter((e) => !HYDRATION_RE.test(e))
        .slice(0, 5);
      if (others.length) {
        console.log(`\n--- Other console output ---`);
        others.forEach((e) => console.log(e.slice(0, 500)));
      }
      console.log("=== End ===\n");
    }

    expect(
      hydrationErrors,
      `Hydration errors on ${route}:\n${hydrationErrors.join("\n\n")}`,
    ).toEqual([]);
  });
}
