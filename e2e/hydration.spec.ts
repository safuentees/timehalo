import { test, expect } from "@playwright/test";

const HYDRATION_RE = /hydrat|did not match|server.+rendered|server\/client/i;

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/h/turbius", // host profile — adjust handle if needed
];

for (const route of PUBLIC_ROUTES) {
  test(`hydrates cleanly: ${route}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message + "\n" + err.stack);
    });

    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const allErrors = [...consoleErrors, ...pageErrors];
    const hydrationErrors = allErrors.filter((e) => HYDRATION_RE.test(e));

    if (hydrationErrors.length > 0) {
      console.log(`\n=== Hydration errors on ${route} ===`);
      hydrationErrors.forEach((e) => console.log(e));
      console.log("=== End ===\n");
    }

    expect(
      hydrationErrors,
      `Hydration errors on ${route}:\n${hydrationErrors.join("\n\n")}`,
    ).toEqual([]);
  });
}
