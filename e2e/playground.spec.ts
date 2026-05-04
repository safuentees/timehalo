import { test, expect } from "@playwright/test";

// Visual regression for the dev playground (B.PT120). Each route
// rendered, screenshotted, compared against the committed baseline.
// Catches the "this surface no longer matches the dashboard chrome"
// class of regression automatically — same coverage Chromatic +
// Storybook would give for ~$150/mo, but free + driven entirely by
// the existing Playwright infrastructure.
//
// `workers: 1` is set at config root — snapshots are deterministic
// across runs. Anonymous (no auth) — playground pages are public
// because the (dev) layout 404s in production via `notFound()`.
//
// Baseline capture (one-time, after this spec lands):
//   1. Make sure no other dev server holds port 3001 — Playwright's
//      `webServer.reuseExistingServer: !CI` means it'll point at any
//      occupant, including a sibling worktree's server.
//   2. Run `pnpm exec playwright test e2e/playground.spec.ts
//      --update-snapshots` from this worktree. Playwright boots a
//      fresh dev server, captures one baseline per route, writes
//      them to `e2e/playground.spec.ts-snapshots/`.
//   3. Commit the snapshot directory alongside this spec.
//   4. Subsequent runs (`pnpm exec playwright test
//      e2e/playground.spec.ts`) compare against the baselines and
//      fail on visual diff.
//
// `waitUntil: "load"` + 1.5s buffer per `.claude/rules/testing.md`
// *Spec patterns* — the project bans `networkidle` because the live-
// queue SSE subscription on `/bookings` keeps the connection open
// forever. Public playground pages don't subscribe to the queue, so
// `networkidle` would technically work here, but using the canonical
// `load + 1.5s` keeps every spec on the same vocabulary.

const PLAYGROUND_ROUTES = [
  "/playground",
  "/playground/components/button",
  "/playground/components/bookings-view-switcher",
  "/playground/pages/handle",
  "/playground/pages/booked",
  "/playground/animations/chrome-morph",
  // Per-variant full-screen routes (B.PT124) — the chrome morph at
  // production scale, one variant per page.
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
    // `fullPage: true` so the screenshot covers below-the-fold
    // content (button gallery is tall, mobile-nav lab is tall).
    // `animations: "disabled"` short-circuits any in-flight CSS
    // transitions / animations — combined with the global reduced-
    // motion blanket from B.PT119, the captured frame is the resting
    // state of every element on the page.
    await expect(page).toHaveScreenshot({
      fullPage: true,
      animations: "disabled",
    });
  });
}
