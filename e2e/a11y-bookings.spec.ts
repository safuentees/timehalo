import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const VIEWS = [
  { url: "/bookings?view=list", label: "list" },
  { url: "/bookings?view=day&date=2026-05-04", label: "day" },
  { url: "/bookings?view=week&date=2026-05-04", label: "week" },
  { url: "/bookings?view=month&date=2026-05-04", label: "month" },
];

for (const view of VIEWS) {
  test(`a11y: /bookings ${view.label} view`, async ({ page }) => {
    await page.goto(view.url, { waitUntil: "load" });
    await page.waitForTimeout(1500);

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .include('[role="region"]')
      .include('[aria-label="View mode"]')
      .analyze();

    if (accessibilityScanResults.violations.length > 0) {
      console.log(
        `\n=== a11y violations on ${view.label} view ===`,
      );
      for (const v of accessibilityScanResults.violations) {
        console.log(
          `  [${v.impact ?? "?"}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`,
        );
        for (const n of v.nodes.slice(0, 3)) {
          console.log(`    target: ${n.target.join(" ")}`);
          console.log(`    html: ${n.html.slice(0, 160)}`);
        }
      }
      console.log("=== End ===\n");
    }

    const blockers = accessibilityScanResults.violations.filter((v) =>
      v.impact === "critical" || v.impact === "serious",
    );
    expect(blockers).toEqual([]);
  });
}
