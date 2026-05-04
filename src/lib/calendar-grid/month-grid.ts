// Build the day-grid for a Month view.
//
// Returns an array of 35 or 42 days (5 or 6 weeks) covering the full
// calendar month plus enough leading/trailing days to align the
// week boundaries. Each day is the LOCAL midnight Date — caller
// handles event-bucket assignment per day.
//
// Pure function: given the same `(year, month, weekStartsOn)` input,
// always returns the same 35/42 days. No `Date.now()` reads.

export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export type MonthGridCell = {
  date: Date;
  /** True if `date` is in the requested month, false for leading /
   *  trailing fill from adjacent months. */
  isInMonth: boolean;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

/**
 * Build the calendar grid for the month containing `referenceDate`.
 *
 * @param referenceDate any date inside the target month
 * @param weekStartsOn 0 = Sunday, 1 = Monday (default)
 * @returns 35 or 42 cells covering full weeks
 */
export function buildMonthGrid(
  referenceDate: Date,
  weekStartsOn: WeekStart = 1,
): MonthGridCell[] {
  const targetYear = referenceDate.getFullYear();
  const targetMonth = referenceDate.getMonth();

  // First day of the target month at local midnight.
  const firstOfMonth = new Date(targetYear, targetMonth, 1);
  // Last day of the target month at local midnight.
  // Day 0 of (month+1) = last day of month; works across year boundary.
  const lastOfMonth = new Date(targetYear, targetMonth + 1, 0);

  // Step backward to the start of the week containing `firstOfMonth`.
  const firstWeekday = firstOfMonth.getDay(); // 0 (Sun) … 6 (Sat)
  const leadingOffset = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStart = addDays(firstOfMonth, -leadingOffset);

  // Step forward to the end of the week containing `lastOfMonth`.
  const lastWeekday = lastOfMonth.getDay();
  const weekEndDay = (weekStartsOn + 6) % 7;
  const trailingOffset = (weekEndDay - lastWeekday + 7) % 7;
  const gridEnd = addDays(lastOfMonth, trailingOffset);

  const cells: MonthGridCell[] = [];
  let cursor = startOfDay(gridStart);
  const endTimestamp = startOfDay(gridEnd).getTime();

  // Iterate by adding one day at a time. `setDate(getDate() + 1)`
  // handles month + DST transitions correctly.
  while (cursor.getTime() <= endTimestamp) {
    cells.push({
      date: new Date(cursor),
      isInMonth: cursor.getMonth() === targetMonth,
    });
    cursor = addDays(cursor, 1);
  }

  return cells;
}

/**
 * Day-of-week index ordered so the first entry matches `weekStartsOn`.
 * 1 (Mon) → ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
 * 0 (Sun) → ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
 */
export function dayOfWeekOrder(weekStartsOn: WeekStart): number[] {
  const order: number[] = [];
  for (let i = 0; i < 7; i++) order.push((weekStartsOn + i) % 7);
  return order;
}

const WEEKDAY_LABELS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function weekdayLabel(jsDay: number): string {
  return WEEKDAY_LABELS_SHORT[jsDay] ?? "";
}
