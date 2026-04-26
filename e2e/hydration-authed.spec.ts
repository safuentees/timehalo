import { test, expect } from "@playwright/test";

// Hydration tests for routes behind the dashboard layout (the
// BrutalistDashboardLayout that the user's stack trace pointed at).
// Test user is seeded once in e2e/global-setup.ts via tsx — Playwright's
// own runtime can't import the generated Prisma client cleanly, so the
// seed lives in a separate process.

const HYDRATION_RE = /hydrat|did not match|server.+rendered|server\/client/i;

// Must match constants in e2e/seed-test-user.ts.
const TEST_EMAIL = "hydration-e2e@test.local";
const TEST_PASSWORD = "test-password-hydration-1234";

const AUTHED_ROUTES = [
  "/bookings",
  "/availability",
  "/profile",
  "/settings",
];

test.describe.configure({ mode: "serial" });

for (const route of AUTHED_ROUTES) {
  test(`hydrates cleanly (authed): ${route}`, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Log in via the credentials form.
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_PASSWORD);
    // The login page also has a "Continue with GitHub" submit button.
    // Pick the credentials one by accessible name.
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(bookings|profile|availability|$)/, {
      timeout: 15_000,
    });

    // Wire console listeners AFTER login finishes so we don't pollute
    // the route's error list with login-flow noise.
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

    await context.close();

    expect(
      hydrationErrors,
      `Hydration errors on ${route}:\n${hydrationErrors.join("\n\n")}`,
    ).toEqual([]);
  });
}
