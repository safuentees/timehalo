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

export function isOpenSlot(slot: Slot): boolean {
  return slot.status === "open";
}

export function isTakenSlot(slot: Slot): boolean {
  return slot.status === "taken";
}

export function computeDensityMap(slots: Slot[]): Map<string, DayDensity> {
  const counts = new Map<string, { open: number; taken: number }>();
  for (const s of slots) {
    const key = toKey(new Date(s.start));
    const current = counts.get(key) ?? { open: 0, taken: 0 };
    if (isOpenSlot(s)) {
      current.open += 1;
    } else {
      current.taken += 1;
    }
    counts.set(key, current);
  }
  const map = new Map<string, DayDensity>();
  for (const [date, count] of counts) {
    const totalCount = count.open + count.taken;
    map.set(date, {
      date,
      count: count.open,
      takenCount: count.taken,
      totalCount,
      isFullyBooked: count.open === 0 && count.taken > 0,
      level: densityLevel(count.open),
    });
  }
  return map;
}

export function slotsOn(slots: Slot[], date: Date): Slot[] {
  const key = toKey(date);
  return slots.filter((s) => toKey(new Date(s.start)) === key);
}

function startOfDayLocal(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function dayIndex(target: Date, fromMidnight: Date): number {
  const t = startOfDayLocal(target).getTime();
  const f = fromMidnight.getTime();
  return Math.round((t - f) / 86_400_000);
}

export function bookingDensityWindow(
  bookings: Array<{ slotStart: Date | string }>,
  fromDate: Date,
  days: number,
): number[] {
  const from = startOfDayLocal(fromDate);
  const counts = new Array<number>(days).fill(0);
  for (const b of bookings) {
    const start =
      b.slotStart instanceof Date ? b.slotStart : new Date(b.slotStart);
    const i = dayIndex(start, from);
    if (i >= 0 && i < days) counts[i] += 1;
  }
  let max = 0;
  for (const c of counts) if (c > max) max = c;
  if (max === 0) return counts; // already all zeros
  return counts.map((c) => c / max);
}

export function slotBusynessWindow(
  slots: Slot[],
  fromDate: Date,
  days: number,
): number[] {
  const from = startOfDayLocal(fromDate);
  const taken = new Array<number>(days).fill(0);
  const total = new Array<number>(days).fill(0);
  for (const s of slots) {
    const i = dayIndex(new Date(s.start), from);
    if (i < 0 || i >= days) continue;
    total[i] += 1;
    if (isTakenSlot(s)) taken[i] += 1;
  }
  return total.map((t, i) => (t === 0 ? 0 : taken[i] / t));
}
