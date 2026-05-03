import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_HANDLE } from "./test-constants";

// B.PT85 — embed loader smoke (resolves QA-5).
//
// What this proves end-to-end:
//   1. The loader script (`/embed.js`) finds a `[data-handle]` host
//      and injects an iframe pointing at /embed/<handle>.
//   2. The embed iframe boots successfully against the dev server.
//   3. The iframe posts at least one `size` message to the parent
//      (proves the postMessage protocol works + the parent listener
//      sees `originator: "OH"` events).
//   4. The embed page renders the visitor booking surface (proves
//      the iframe contains the actual product, not an error/redirect).
//
// We host the parent page as a plain HTML file under `e2e/fixtures/`
// served by Playwright via the `file://` protocol. The iframe inside
// it is cross-origin (`http://localhost:3001`) to the parent, which
// is the canonical embed scenario — postMessage must work across
// origins or the loader is not actually production-ready.

const FIXTURE_PATH = path.resolve(__dirname, "fixtures/embed-test.html");

test("embed loader injects an iframe + emits size postMessage + renders the booking surface", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const url = `file://${FIXTURE_PATH}?handle=${encodeURIComponent(TEST_HANDLE)}&origin=${encodeURIComponent("http://localhost:3001")}`;

  await page.goto(url, { waitUntil: "load" });

  // Iframe must mount. The loader sets `data-oh-handle` on the
  // iframe so we don't accidentally pick up a stray iframe from
  // some browser extension.
  const iframeLocator = page.locator(
    `iframe[data-oh-handle="${TEST_HANDLE}"]`,
  );
  await expect(iframeLocator).toBeVisible({ timeout: 10_000 });

  // Visit __OH_TEST_MESSAGES until at least one `size` event lands.
  // The fixture pushes every `originator: "OH"` postMessage into
  // that array (see embed-test.html). polling because the timing
  // depends on when the iframe's React app mounts + ResizeObserver
  // fires — anywhere from ~200ms to ~2s on a cold dev server.
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

  // Drill into the iframe and assert the booking surface is there.
  // The visitor host profile renders a "Pick a date" trigger as the
  // primary CTA — same hook the booking-flow spec uses, so if cal-
  // shape ever changes both fail in lockstep.
  const frame = page.frameLocator(`iframe[data-oh-handle="${TEST_HANDLE}"]`);
  await expect(
    frame.getByRole("button", { name: "Pick a date" }),
  ).toBeVisible({ timeout: 15_000 });

  // No console errors on either parent or iframe (Playwright surfaces
  // both since the parent shares the same context). Filter known-
  // benign React DevTools messages that fire on dev-server boot.
  const realErrors = consoleErrors.filter(
    (e) =>
      !/Download the React DevTools/i.test(e) &&
      !/Lit is in dev mode/i.test(e),
  );
  expect(realErrors, `console errors: ${realErrors.join(" | ")}`).toEqual([]);
});
