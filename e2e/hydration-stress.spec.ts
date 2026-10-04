import { test, expect } from "@playwright/test";

import { TEST_HANDLE } from "./test-constants";

const HYDRATION_RE = /hydrat|did not match|server.+rendered|server\/client/i;

const RELOADS_PER_ROUTE = 5;

const STRESS_ROUTES = [
  "/bookings",
  "/availability",
  "/profile",
  "/workspaces",
  "/settings/general",
  "/settings/billing",
  "/settings/workflows",
  "/settings/calendars",
  "/settings/developer",
  "/settings/danger",
  `/workspaces/${TEST_HANDLE}-personal/members`,
  `/workspaces/${TEST_HANDLE}-personal/event-types`,
  `/workspaces/${TEST_HANDLE}-personal/settings`,
];

test.describe.configure({ mode: "serial" });

for (const route of STRESS_ROUTES) {
  test(`no hydration errors across ${RELOADS_PER_ROUTE} reloads: ${route}`, async ({
    page,
  }) => {
    const allErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        allErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      allErrors.push(err.message + (err.stack ? "\n" + err.stack : ""));
    });

    const response = await page.goto(route, { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await page.waitForTimeout(1500);

    for (let i = 0; i < RELOADS_PER_ROUTE - 1; i++) {
      const reload = await page.reload({ waitUntil: "load" });
      expect(reload?.status()).toBe(200);
      await page.waitForTimeout(1500);
    }

    const hydrationErrors = allErrors.filter((e) => HYDRATION_RE.test(e));

    if (hydrationErrors.length > 0) {
      console.log(
        `\n=== ${hydrationErrors.length} hydration error(s) across ${RELOADS_PER_ROUTE} reloads of ${route} ===`,
      );
      hydrationErrors.slice(0, 3).forEach((e) => console.log(e.slice(0, 1500)));
      console.log("=== End ===\n");
    }

    expect(
      hydrationErrors,
      `Hydration errors on ${route} across ${RELOADS_PER_ROUTE} reloads:\n${hydrationErrors.slice(0, 3).join("\n\n")}`,
    ).toEqual([]);
  });
}
