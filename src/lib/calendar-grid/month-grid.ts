
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export type MonthGridCell = {
  date: Date;
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

export function buildMonthGrid(
  referenceDate: Date,
  weekStartsOn: WeekStart = 1,
): MonthGridCell[] {
  const targetYear = referenceDate.getFullYear();
  const targetMonth = referenceDate.getMonth();

  const firstOfMonth = new Date(targetYear, targetMonth, 1);
  const lastOfMonth = new Date(targetYear, targetMonth + 1, 0);

  const firstWeekday = firstOfMonth.getDay(); // 0 (Sun) … 6 (Sat)
  const leadingOffset = (firstWeekday - weekStartsOn + 7) % 7;
  const gridStart = addDays(firstOfMonth, -leadingOffset);

  const lastWeekday = lastOfMonth.getDay();
  const weekEndDay = (weekStartsOn + 6) % 7;
  const trailingOffset = (weekEndDay - lastWeekday + 7) % 7;
  const gridEnd = addDays(lastOfMonth, trailingOffset);

  const cells: MonthGridCell[] = [];
  let cursor = startOfDay(gridStart);
  const endTimestamp = startOfDay(gridEnd).getTime();

  while (cursor.getTime() <= endTimestamp) {
    cells.push({
      date: new Date(cursor),
      isInMonth: cursor.getMonth() === targetMonth,
    });
    cursor = addDays(cursor, 1);
  }

  return cells;
}

export function dayOfWeekOrder(weekStartsOn: WeekStart): number[] {
  const order: number[] = [];
  for (let i = 0; i < 7; i++) order.push((weekStartsOn + i) % 7);
  return order;
}

const WEEKDAY_LABELS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function weekdayLabel(jsDay: number): string {
  return WEEKDAY_LABELS_SHORT[jsDay] ?? "";
}
