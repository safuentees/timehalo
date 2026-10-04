import { test as setup, expect } from "@playwright/test";

import { TEST_EMAIL, TEST_PASSWORD } from "./test-constants";

const AUTH_FILE = "playwright/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(TEST_EMAIL);
  await page.getByRole("button", { name: "Continue with email", exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in with password", exact: true }).click();
  await page.waitForURL(/\/bookings$/, {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/bookings$/);

  await page.context().storageState({ path: AUTH_FILE });
});
