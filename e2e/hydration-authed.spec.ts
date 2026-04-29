import { test, expect } from "@playwright/test";

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
