import { test, expect } from "@playwright/test";

// Hydration smoke tests — load each route in a real Chromium and
// fail if any hydration warning appears in the console. Catches the
// class of bug Vitest can't see (useId mismatches, browser-extension
// interference, build-plugin asymmetries between server and client
// bundles).
//
// Public routes only for now — authed routes (/bookings, /settings,
// etc.) need a session cookie set up. We add that after the public
// path is proven.
//
// Hydration error patterns React 19 / Next 16 emit:
//   - "Hydration failed because the server rendered HTML didn't match"
//   - "A tree hydrated but some attributes ... didn't match"
//   - "Text content does not match server-rendered HTML"
//   - "did not match"
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
    // Wait long enough for hydration to fire — networkidle fires after
    // the page is fully loaded + 500ms of no requests.
    await page.waitForLoadState("networkidle");
    // Belt + suspenders: small extra wait so any deferred hydration
    // catches up. React 19 + Next 16 hydrate on idle.
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
