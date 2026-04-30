import { test, expect } from "@playwright/test";
import { TEST_HANDLE } from "./test-constants";

// End-to-end booking flow smoke. Distinct from the hydration specs:
// hydration-only proves the page mounts without React errors;
// THIS spec proves the visitor loop actually books a slot.
//
// The flow exercises:
//   - public host profile renders open slots
//   - "Pick a date" trigger card opens the availability drawer
//   - day-strip click selects a date
//   - day-slots click stages a slot in the booking drawer
//   - booking form submit lands on /h/<handle>/booked/<uid>
//
// One unique idempotency cookie per run so re-running the test on the
// same dev.db doesn't trip slot-collision CONFLICT (the hydration-e2e
// host's seeded availability re-opens daily). visitorEmail is timestamped
// for the same reason.

test.describe.configure({ mode: "serial" });

test("visitor can book a slot end-to-end", async ({ page }) => {
  // Surface page errors and any failed network requests so a flake gets
  // a useful debug trail in CI without rerunning under --headed.
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(`/h/${TEST_HANDLE}`, { waitUntil: "load" });

  // The trigger card sits inside the host profile and reads the
  // accessible name "Pick a date" before any selection has been made.
  const trigger = page.getByRole("button", { name: "Pick a date" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  // AvailabilityDrawer opens with the day-strip. Pick the first day
  // that advertises "open slots" via aria-label. The seeded host has
  // MONDAY 09:00–17:00 + WEDNESDAY 10:00–16:00, so at least one such
  // day is visible inside the next 14-day horizon.
  const firstOpenDay = page
    .locator('button[aria-label*="open slots"]')
    .first();
  await expect(firstOpenDay).toBeVisible({ timeout: 5_000 });
  await firstOpenDay.click();

  // After a date is selected, day-slots renders one button per slot
  // with `aria-label="Book <time>"`. Click the first.
  const firstSlot = page
    .locator('button[aria-label^="Book "]')
    .first();
  await expect(firstSlot).toBeVisible({ timeout: 5_000 });
  await firstSlot.click();

  // BookingDrawer (nested) opens with the form. Fill the visitor
  // fields. Email is timestamped so a re-run against the same dev.db
  // doesn't replay an idempotency hit.
  const visitorEmail = `e2e-visitor-${Date.now()}@test.local`;
  await page.locator('input[name="visitorName"]').fill("E2E Visitor");
  await page.locator('input[name="visitorEmail"]').fill(visitorEmail);

  const confirm = page.getByRole("button", { name: /Confirm booking/i });
  await confirm.click();

  // Server redirects (router.push) to the public confirmation page.
  // The URL pattern is /h/<handle>/booked/<publicUid>; the uid is a
  // 12+ char base32 string so the regex anchors on the path shape.
  await page.waitForURL(
    new RegExp(`/h/${TEST_HANDLE}/booked/[A-Za-z0-9_-]{8,}`),
    { timeout: 10_000 },
  );
  await expect(page).toHaveURL(
    new RegExp(`/h/${TEST_HANDLE}/booked/[A-Za-z0-9_-]{8,}`),
  );

  // Confirmation page should render the host's name + slot affordances
  // (Add to calendar, Reschedule). Proves the page query loaded the row,
  // not just that the route resolved. Loose match because surrounding
  // copy is localization-driven; we only commit to the affordances'
  // accessible names.
  await expect(
    page.getByRole("link", { name: /Add to calendar/i }),
  ).toBeVisible({ timeout: 5_000 });
  // Reschedule is now a button (opens a ConfirmDialog from B.PT31)
  // — semantically correct since the immediate action is opening
  // an in-page UI surface, not navigating. The button still routes
  // to the picker after confirm.
  await expect(
    page.getByRole("button", { name: /Reschedule/i }),
  ).toBeVisible();

  // Sanity: no React errors fired during the loop.
  expect(consoleErrors.filter((e) => /React|hydrat/i.test(e))).toEqual([]);
});
