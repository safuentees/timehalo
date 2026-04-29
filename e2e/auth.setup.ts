import { test as setup, expect } from "@playwright/test";

// Cached-auth setup project. Logs in once, persists cookies to
// playwright/.auth/user.json. Authed specs `use: { storageState }`
// so each test starts already-logged-in (saves ~5s × N routes
// versus inline login). Pattern: dub apps/web/playwright/auth.setup.ts +
// Playwright docs "Authentication state".
//
// The test user is seeded by e2e/global-setup.ts → seed-test-user.ts.

import { TEST_EMAIL, TEST_PASSWORD } from "./test-constants";

const AUTH_FILE = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  // The /login page renders BOTH the credentials form (RHF, with
  // name="email"/"password") and the magic-link form (uncontrolled,
  // no name). Disambiguate by `name=` so we hit the credentials inputs.
  await page.locator('input[name="email"]').fill(TEST_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);
  // The login page also has a "Continue with GitHub" submit button.
  // Pick the credentials one by accessible name.
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(bookings|profile|availability|$)/, {
    timeout: 15_000,
  });
  // Sanity assertion before we persist — if the dashboard didn't actually
  // load, we'd cache a half-authed state and confuse downstream specs.
  await expect(page).toHaveURL(/\/(bookings|profile|availability|$)/);

  await page.context().storageState({ path: AUTH_FILE });
});
