import { test, expect } from "@playwright/test";

const PLAYGROUND_ROUTES = [
  "/playground",
  "/playground/components/button",
  "/playground/pages/handle",
  "/playground/pages/booked",
  "/playground/animations/chrome-morph",
  "/playground/animations/chrome-morph/a",
  "/playground/animations/chrome-morph/b",
  "/playground/animations/chrome-morph/c",
  "/playground/animations/hamburger-morph",
  "/playground/animations/mobile-nav",
  "/playground/animations/bookings-tabs",
];

for (const route of PLAYGROUND_ROUTES) {
  test(`playground screenshot: ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot({
      fullPage: true,
      animations: "disabled",
    });
  });
}
