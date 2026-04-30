import { test, expect } from "@playwright/test";

// Hydration stress test — hard-refreshes each authed route N times and
// fails on ANY hydration mismatch console error across all reloads.
//
// Why a stress variant: the base `hydration-authed.spec.ts` does one
// reload per route, which catches deterministic mismatches. But the
// useId-counter-drift class of bug (B.PT48 / B.PT49 / B.PT50) is
// non-deterministic — it depends on whether the upstream provider
// tree's hook ordering happens to differ on a given paint. A single
// reload per route can pass even when the underlying tree is fragile.
// 5 reloads × every route catches the flaky tail.
//
// If a regression lands and this spec catches it: add stable IDs to
// the offending Base UI primitive trigger (per the pattern in B.PT48 /
// B.PT50) OR root-cause the upstream drift (per B.PT49).

import { TEST_HANDLE } from "./test-constants";

const HYDRATION_RE = /hydrat|did not match|server.+rendered|server\/client/i;

const RELOADS_PER_ROUTE = 5;

const STRESS_ROUTES = [
  "/bookings",
  "/availability",
  "/profile",
  "/workspaces",
  // Settings hub. /general is the default landing; /billing carries
  // the workspace-scoped eager-nested prefetch most likely to drift.
  "/settings/general",
  "/settings/billing",
  "/settings/workflows",
  "/settings/calendars",
  "/settings/developer",
  "/settings/danger",
  // Workspace-scoped pages — the singleton Dialog triggers in
  // members-panel + workspace settings live here.
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

    // First navigation. waitUntil "load" + buffer mirrors the base
    // hydration-authed spec — networkidle never fires (live-queue SSE).
    await page.goto(route, { waitUntil: "load" });
    await page.waitForTimeout(1500);

    // N hard refreshes. Each reload re-runs SSR + hydration; if the
    // useId counter drifts on any of them, we catch it.
    for (let i = 0; i < RELOADS_PER_ROUTE - 1; i++) {
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(1500);
    }

    const hydrationErrors = allErrors.filter((e) => HYDRATION_RE.test(e));

    if (hydrationErrors.length > 0) {
      // First-line summary makes the test output readable; full body
      // goes into the assertion message so a failed CI run shows the
      // exact stack.
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
