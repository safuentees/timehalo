import { test, expect } from "@playwright/test";
import { TEST_HANDLE } from "./test-constants";

test.describe.configure({ mode: "serial" });

test("visitor can book a slot end-to-end", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(`/h/${TEST_HANDLE}`, { waitUntil: "load" });

  const trigger = page.getByRole("button", { name: "Pick a date" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const firstOpenDay = page
    .locator('button[aria-label*="open slots"]')
    .first();
  await expect(firstOpenDay).toBeVisible({ timeout: 5_000 });
  await firstOpenDay.click();

  const firstSlot = page
    .locator('button[aria-label^="Book "]')
    .first();
  await expect(firstSlot).toBeVisible({ timeout: 5_000 });
  await firstSlot.click();

  const visitorEmail = `e2e-visitor-${Date.now()}@test.local`;
  await page.locator('input[name="visitorName"]').fill("E2E Visitor");
  await page.locator('input[name="visitorEmail"]').fill(visitorEmail);

  const confirm = page.getByRole("button", { name: /Confirm booking/i });
  await confirm.click();

  await page.waitForURL(
    new RegExp(`/h/${TEST_HANDLE}/booked/[A-Za-z0-9_-]{8,}`),
    { timeout: 10_000 },
  );
  await expect(page).toHaveURL(
    new RegExp(`/h/${TEST_HANDLE}/booked/[A-Za-z0-9_-]{8,}`),
  );

  await expect(
    page.getByRole("link", { name: /Add to calendar/i }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(
    page.getByRole("link", { name: /Reschedule/i }),
  ).toBeVisible();

  expect(consoleErrors.filter((e) => /React|hydrat/i.test(e))).toEqual([]);
});
