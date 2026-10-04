import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_HANDLE } from "./test-constants";

const FIXTURE_PATH = path.resolve(__dirname, "fixtures/embed-test.html");

test("embed loader injects an iframe + emits size postMessage + renders the booking surface", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const loginPage = await page.request.get("/login");
  expect(loginPage.headers()["x-frame-options"]).toBe("DENY");

  // Use a different HTTP origin, as real embedding sites do. An opaque file
  // origin cannot satisfy the embed's frame-ancestors policy.
  const url = `http://127.0.0.1:3001/__e2e/embed-test?handle=${encodeURIComponent(TEST_HANDLE)}&origin=${encodeURIComponent("http://localhost:3001")}`;
  await page.context().grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:3001" });
  await page.route(url, (route) => route.fulfill({ path: FIXTURE_PATH, contentType: "text/html" }));

  await page.goto(url, { waitUntil: "load" });

  const iframeLocator = page.locator(
    `iframe[data-oh-handle="${TEST_HANDLE}"]`,
  );
  await expect(iframeLocator).toBeVisible({ timeout: 10_000 });

  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          const msgs = (window as unknown as {
            __OH_TEST_MESSAGES?: Array<{ type?: string }>;
          }).__OH_TEST_MESSAGES;
          if (!Array.isArray(msgs)) return 0;
          return msgs.filter((m) => m.type === "size").length;
        });
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);

  const frame = page.frameLocator(`iframe[data-oh-handle="${TEST_HANDLE}"]`);
  await expect(
    frame.getByRole("button", { name: /15 minutes/ }),
  ).toBeVisible({ timeout: 15_000 });

  const realErrors = consoleErrors.filter(
    (e) =>
      !/Download the React DevTools/i.test(e) &&
      !/Lit is in dev mode/i.test(e),
  );
  expect(realErrors, `console errors: ${realErrors.join(" | ")}`).toEqual([]);
});
