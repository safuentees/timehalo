import type { BusyTime } from "./types";

// Pure functions for merging + subtracting busy ranges. Live on
// their own so they're testable without touching Prisma or fetch.
//
// Slot subtraction rule: a candidate slot [s, e) is removed when ANY
// busy range overlaps it — even partially. A 15-min slot with a
// 30-min meeting starting in the middle is unbookable. Same
// semantics cal.com uses.

export type Slot = {
  /** ISO UTC string. */
  start: string;
  /** ISO UTC string. */
  end: string;
};

/**
 * Merge overlapping / adjacent busy ranges into a minimal set,
 * sorted by start. Idempotent.
 */
export function mergeBusyTimes(ranges: ReadonlyArray<BusyTime>): BusyTime[] {
  if (ranges.length === 0) return [];
  const sorted = ranges
    .map((r) => ({
      start: new Date(r.start).getTime(),
      end: new Date(r.end).getTime(),
    }))
    .sort((a, b) => a.start - b.start);
  const out: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = out[out.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      out.push({ ...range });
    }
  }
  return out.map((r) => ({
    start: new Date(r.start).toISOString(),
    end: new Date(r.end).toISOString(),
  }));
}

/**
 * Subtract a set of busy ranges from a list of candidate slots.
 * A slot is dropped if it overlaps with any busy range — even
 * partially. Caller passes the slots already sorted by start; the
 * returned list preserves that order.
 */
export function subtractBusyTimes<T extends Slot>(
  slots: ReadonlyArray<T>,
  busy: ReadonlyArray<BusyTime>,
): T[] {
  if (busy.length === 0) return [...slots];
  const merged = mergeBusyTimes(busy).map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));
  if (merged.length === 0) return [...slots];

  const out: T[] = [];
  let busyIdx = 0;
  for (const slot of slots) {
    const slotStart = new Date(slot.start).getTime();
    const slotEnd = new Date(slot.end).getTime();

    // Advance the busy cursor past ranges that ended before this
    // slot starts. The slots-sorted invariant lets us walk linearly.
    while (busyIdx < merged.length && merged[busyIdx].end <= slotStart) {
      busyIdx++;
    }

    // Overlap check against the current busy range. If the next
    // busy range starts before slotEnd AND ends after slotStart,
    // the slot is unbookable.
    const cur = merged[busyIdx];
    const overlaps =
      cur && cur.start < slotEnd && cur.end > slotStart;
    if (!overlaps) out.push(slot);
  }
  return out;
}
