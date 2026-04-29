import { test as setup, expect } from "@playwright/test";

import { TEST_EMAIL, TEST_PASSWORD } from "./test-constants";

const AUTH_FILE = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(TEST_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(bookings|profile|availability|$)/, {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/(bookings|profile|availability|$)/);

  await page.context().storageState({ path: AUTH_FILE });
});
