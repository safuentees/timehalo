import type { BusyTime } from "./types";

export type Slot = {
  start: string;
  end: string;
};

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

    while (busyIdx < merged.length && merged[busyIdx].end <= slotStart) {
      busyIdx++;
    }

    const cur = merged[busyIdx];
    const overlaps =
      cur && cur.start < slotEnd && cur.end > slotStart;
    if (!overlaps) out.push(slot);
  }
  return out;
}
