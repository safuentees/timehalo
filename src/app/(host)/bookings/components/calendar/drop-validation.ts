
import type { CalendarEvent } from "@/lib/calendar-grid/types";

export type DayOfWeek =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

export type AvailabilityRange = {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
};

export type DropValidationResult =
  | { ok: true }
  | { ok: false; reason: "slot-occupied" | "outside-availability" | "in-past" };

const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function validateDrop({
  newSlotStart,
  sourceRefId,
  events,
  ranges,
  now,
}: {
  newSlotStart: Date;
  sourceRefId: string;
  events: ReadonlyArray<CalendarEvent>;
  ranges: ReadonlyArray<AvailabilityRange>;
  now?: Date;
}): DropValidationResult {
  const nowMs = (now ?? new Date()).getTime();

  if (newSlotStart.getTime() <= nowMs) {
    return { ok: false, reason: "in-past" };
  }

  const collision = events.find(
    (e) =>
      e.refId !== sourceRefId &&
      e.start.getTime() === newSlotStart.getTime(),
  );
  if (collision) return { ok: false, reason: "slot-occupied" };

  const dayKey = JS_DAY_TO_ENUM[newSlotStart.getDay()];
  const dayRanges = ranges.filter((r) => r.dayOfWeek === dayKey);
  if (dayRanges.length === 0) {
    return { ok: false, reason: "outside-availability" };
  }
  const minutesIntoDay =
    newSlotStart.getHours() * 60 + newSlotStart.getMinutes();
  const inRange = dayRanges.some((r) => {
    const startMin = timeToMinutes(r.startTime);
    const endMin = timeToMinutes(r.endTime);
    return minutesIntoDay >= startMin && minutesIntoDay < endMin;
  });
  if (!inRange) return { ok: false, reason: "outside-availability" };

  return { ok: true };
}
