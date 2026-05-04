// Pre-flight validation for drag-to-reschedule drops (B.PT152).
//
// The `bookings.reschedule` procedure rejects with NOT_FOUND ("That
// slot isn't available anymore") when the new slot isn't in the host's
// generated upcoming slots — either because the time is outside the
// host's availability ranges, OR because another booking already
// occupies that exact time. Both paths return HTTP 404 to the client
// and look like a mysterious failure.
//
// Both checks are client-derivable from data we already have in the
// React Query cache (calendarEvents from `bookings.listForHost`,
// availability ranges from `schedule.get` which the page prefetches).
// Doing them client-side BEFORE opening the confirm dialog gives the
// host a precise toast instead of "404" + saves a server round-trip.
//
// The procedure remains the source of truth — these checks are a
// best-effort UX layer. A race (someone else booked that slot in the
// last 2s, the host's availability changed mid-drag) still falls
// through to the procedure's CONFLICT / NOT_FOUND, which surfaces
// via the mutation hook's error toast.
//
// Pure TS, no React. Pairs with `event-geometry.ts` — together they
// cover the geometry + validity contract for drag-to-reschedule.

import type { CalendarEvent } from "@/lib/calendar-grid/types";

// Mirrors the Prisma `DayOfWeek` enum and `AvailabilityRange` row
// shape returned by `schedule.get`. Kept inline so this file has no
// dependency on Prisma's generated types (which only exist on the
// server).
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
  /** "HH:MM" 24-hour wall-clock string. */
  startTime: string;
  /** "HH:MM" 24-hour wall-clock string. */
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

/**
 * Validate a drop target before committing the reschedule.
 *
 * @param newSlotStart proposed start time (host-local Date)
 * @param sourceRefId  refId of the booking being moved — excluded from
 *                     the collision check so a no-op drop on the same
 *                     time doesn't false-positive
 * @param events       all calendar events (`bookings.listForHost`)
 * @param ranges       host availability ranges (`schedule.get`)
 * @param now          current time — defaults to `new Date()`. Pass an
 *                     override for tests / pinned-clock scenarios.
 */
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

  // Past slots — bookings.reschedule rejects with BAD_REQUEST. Catch
  // it here for parity (server still enforces).
  if (newSlotStart.getTime() <= nowMs) {
    return { ok: false, reason: "in-past" };
  }

  // Slot collision — does another booking already start at this exact
  // millisecond? Excludes the source booking so a no-op drop (same
  // time) doesn't false-positive (the caller's no-op short-circuit
  // catches that earlier, but defense in depth).
  const collision = events.find(
    (e) =>
      e.refId !== sourceRefId &&
      e.start.getTime() === newSlotStart.getTime(),
  );
  if (collision) return { ok: false, reason: "slot-occupied" };

  // Availability range check — is `newSlotStart`'s wall-clock time
  // within any availability range for the day-of-week? Operates in the
  // host's local timezone (the Date we receive is built via
  // `pixelToTime` against the column's date with local components).
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
    // start inclusive, end exclusive — matches `generateUpcomingSlots`
    // semantics where the loop condition `t + stepMs <= rangeEndMs`
    // emits slots whose START is strictly < rangeEnd.
    return minutesIntoDay >= startMin && minutesIntoDay < endMin;
  });
  if (!inRange) return { ok: false, reason: "outside-availability" };

  return { ok: true };
}
