import type { DayDensity, Slot } from "./types";

export function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function densityLevel(count: number): 0 | 1 | 2 | 3 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

export function computeDensityMap(slots: Slot[]): Map<string, DayDensity> {
  const counts = new Map<string, number>();
  for (const s of slots) {
    const key = toKey(new Date(s.start));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const map = new Map<string, DayDensity>();
  for (const [date, count] of counts) {
    map.set(date, { date, count, level: densityLevel(count) });
  }
  return map;
}

export function slotsOn(slots: Slot[], date: Date): Slot[] {
  const key = toKey(date);
  return slots.filter((s) => toKey(new Date(s.start)) === key);
}
