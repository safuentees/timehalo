import { test, expect } from "@playwright/test";

test("visitor can start a guest account in the official dashboard", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await page.getByRole("button", { name: "Try as a guest", exact: true }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.locator("#sidebar-nav-availability")).toBeVisible();

  await page.goto("/availability", { waitUntil: "load" });
  await expect(page).toHaveURL(/\/availability$/);
  await expect(page.getByRole("heading", { name: "Hours", exact: true })).toBeVisible();
});
