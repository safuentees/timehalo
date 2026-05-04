import { describe, it, expect } from "vitest";
import {
  buildMonthGrid,
  dayOfWeekOrder,
  weekdayLabel,
} from "../month-grid";

const localDate = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("buildMonthGrid (week starts Monday)", () => {
  it("returns 35 cells for May 2026 (Fri-start month, fits in 5 weeks)", () => {
    const cells = buildMonthGrid(localDate(2026, 5, 15), 1);
    expect(cells).toHaveLength(35);
    expect(cells[0].date.getDate()).toBe(27); // Mon Apr 27
    expect(cells[0].date.getMonth()).toBe(3); // April (0-indexed)
    expect(cells[0].isInMonth).toBe(false);
    expect(cells[34].date.getDate()).toBe(31); // Sun May 31
    expect(cells[34].date.getMonth()).toBe(4); // May
    expect(cells[34].isInMonth).toBe(true);
  });

  it("returns 42 cells when leading + trailing fill overflows 5 rows (March 2026)", () => {
    const cells = buildMonthGrid(localDate(2026, 3, 15), 1);
    expect(cells).toHaveLength(42);
    expect(cells[0].date.getMonth()).toBe(1); // Feb (leading)
    expect(cells[0].date.getDate()).toBe(23); // Mon Feb 23
    expect(cells[41].date.getMonth()).toBe(3); // Apr (trailing)
    expect(cells[41].date.getDate()).toBe(5); // Sun Apr 5
  });

  it("starts the grid on Monday for week-start = 1", () => {
    const cells = buildMonthGrid(localDate(2026, 5, 15), 1);
    expect(cells[0].date.getDay()).toBe(1); // Monday
  });

  it("ends the grid on Sunday for week-start = 1", () => {
    const cells = buildMonthGrid(localDate(2026, 5, 15), 1);
    expect(cells[cells.length - 1].date.getDay()).toBe(0); // Sunday
  });

  it("flags every day of the target month with isInMonth=true", () => {
    const cells = buildMonthGrid(localDate(2026, 5, 15), 1);
    const inMonth = cells.filter((c) => c.isInMonth);
    expect(inMonth).toHaveLength(31); // May has 31 days
    expect(new Set(inMonth.map((c) => c.date.getDate())).size).toBe(31);
  });

  it("handles year boundary (Dec 2025 → Jan 2026)", () => {
    const cells = buildMonthGrid(localDate(2025, 12, 15), 1);
    expect(cells).toHaveLength(35);
    expect(cells[0].date.getDate()).toBe(1);
    expect(cells[0].date.getMonth()).toBe(11); // Dec
    expect(cells[34].date.getMonth()).toBe(0); // Jan (trailing)
  });

  it("handles a leap-year February (Feb 2024)", () => {
    const cells = buildMonthGrid(localDate(2024, 2, 15), 1);
    const inMonth = cells.filter((c) => c.isInMonth);
    expect(inMonth).toHaveLength(29); // Leap year
  });
});

describe("buildMonthGrid (week starts Sunday)", () => {
  it("starts on Sunday for week-start = 0", () => {
    const cells = buildMonthGrid(localDate(2026, 5, 15), 0);
    expect(cells[0].date.getDay()).toBe(0); // Sunday
    expect(cells[cells.length - 1].date.getDay()).toBe(6); // Saturday
  });
});

describe("dayOfWeekOrder", () => {
  it("Mon-start: returns [Mon, Tue, Wed, Thu, Fri, Sat, Sun]", () => {
    expect(dayOfWeekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("Sun-start: returns [Sun, Mon, Tue, Wed, Thu, Fri, Sat]", () => {
    expect(dayOfWeekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("weekdayLabel", () => {
  it("returns 3-letter uppercase labels", () => {
    expect(weekdayLabel(0)).toBe("SUN");
    expect(weekdayLabel(1)).toBe("MON");
    expect(weekdayLabel(6)).toBe("SAT");
  });
});
