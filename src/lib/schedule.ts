import { z } from "zod";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { DayOfWeek } from "@/generated/prisma/enums";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

/**
 * Single source of truth for the weekly schedule. Imported by both the
 * tRPC router (validates input, transforms rows) and the client form
 * (zodResolver, default values).
 */

// ——— Schema ———

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const rangeSchema = z
  .object({
    from: z.string().regex(timeRegex, "HH:MM"),
    to: z.string().regex(timeRegex, "HH:MM"),
  })
  .refine((r) => r.from < r.to, {
    message: "End must be after start",
    path: ["to"],
  });

const daySchema = z.object({
  enabled: z.boolean(),
  ranges: z.array(rangeSchema),
});

export const scheduleSchema = z.object({
  mon: daySchema,
  tue: daySchema,
  wed: daySchema,
  thu: daySchema,
  fri: daySchema,
  sat: daySchema,
  sun: daySchema,
});

export type ScheduleValues = z.infer<typeof scheduleSchema>;
export type RangeValues = z.infer<typeof rangeSchema>;
export type DayValues = z.infer<typeof daySchema>;

export type DayKey = keyof ScheduleValues;

// ——— Form <-> DB mapping ———

export const DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export const DAY_KEY_TO_ENUM: Record<DayKey, DayOfWeek> = {
  mon: DayOfWeek.MONDAY,
  tue: DayOfWeek.TUESDAY,
  wed: DayOfWeek.WEDNESDAY,
  thu: DayOfWeek.THURSDAY,
  fri: DayOfWeek.FRIDAY,
  sat: DayOfWeek.SATURDAY,
  sun: DayOfWeek.SUNDAY,
};

const ENUM_TO_DAY_KEY: Record<DayOfWeek, DayKey> = {
  MONDAY: "mon",
  TUESDAY: "tue",
  WEDNESDAY: "wed",
  THURSDAY: "thu",
  FRIDAY: "fri",
  SATURDAY: "sat",
  SUNDAY: "sun",
};

// ——— Defaults ———

const DEFAULT_RANGE: RangeValues = { from: "09:00", to: "17:00" };

// DB-row form of the Mon-Fri 9-5 default. Seeded into AvailabilityRange
// when a user is created (auth.register + events.createUser) so the
// onboarding "draw weekly hours" step is auto-checked from day 1.
// Mirrors cal.com's pattern in packages/lib/availability.ts.
export const DEFAULT_AVAILABILITY_ROWS: ReadonlyArray<{
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}> = [
  { dayOfWeek: DayOfWeek.MONDAY, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: DayOfWeek.TUESDAY, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: DayOfWeek.WEDNESDAY, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: DayOfWeek.THURSDAY, startTime: "09:00", endTime: "17:00" },
  { dayOfWeek: DayOfWeek.FRIDAY, startTime: "09:00", endTime: "17:00" },
];

export const defaultSchedule: ScheduleValues = {
  mon: { enabled: true, ranges: [DEFAULT_RANGE] },
  tue: { enabled: true, ranges: [DEFAULT_RANGE] },
  wed: { enabled: true, ranges: [DEFAULT_RANGE] },
  thu: { enabled: true, ranges: [DEFAULT_RANGE] },
  fri: { enabled: true, ranges: [DEFAULT_RANGE] },
  sat: { enabled: false, ranges: [] },
  sun: { enabled: false, ranges: [] },
};

// ——— Pure converters ———

type DbRow = {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
};

/** Group a flat list of DB rows into the form's weekly shape. */
export function rowsToFormValues(rows: DbRow[]): ScheduleValues {
  const blank = (): DayValues => ({ enabled: false, ranges: [] });
  const values: ScheduleValues = {
    mon: blank(),
    tue: blank(),
    wed: blank(),
    thu: blank(),
    fri: blank(),
    sat: blank(),
    sun: blank(),
  };

  for (const row of rows) {
    const key = ENUM_TO_DAY_KEY[row.dayOfWeek];
    values[key].enabled = true;
    values[key].ranges.push({ from: row.startTime, to: row.endTime });
  }

  return values;
}

/**
 * Flatten the form's weekly shape into the rows we persist. Days with
 * `enabled: false` or empty ranges contribute zero rows — "implicitly off".
 */
export function formValuesToRows(values: ScheduleValues): Array<{
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}> {
  return DAY_KEYS.flatMap((key) => {
    const day = values[key];
    if (!day.enabled || day.ranges.length === 0) return [];
    return day.ranges.map((r) => ({
      dayOfWeek: DAY_KEY_TO_ENUM[key],
      startTime: r.from,
      endTime: r.to,
    }));
  });
}

// ——— Slot generation ———

// JS Date.getDay() returns 0=Sunday..6=Saturday; Prisma enum starts at MONDAY.
const JS_DAY_TO_ENUM: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

export type UpcomingSlot = { start: string; end: string };

/**
 * Walk the next `days` calendar days *in the host's timezone*, and for
 * each day's availability ranges emit back-to-back fixed-length slots.
 * Only future slots are returned; past times on the first day are
 * skipped. Returned dates are ISO strings (UTC) so they survive JSON
 * serialization to the client and the visitor renders them in their
 * own zone via Intl.DateTimeFormat.
 *
 * The host declares "Mondays 09:00–17:00" — that's 09:00 *in their
 * zone*. fromZonedTime maps each (year, month, date, HH:MM, zone)
 * tuple to the correct UTC instant, DST-aware. Compare to the
 * pre-A3 implementation which used Date#setHours (server-local time)
 * — that worked accidentally when the server ran UTC and broke
 * silently otherwise.
 */
export function generateUpcomingSlots({
  ranges,
  from,
  days,
  stepMinutes,
  eventDurationMinutes,
  hostTimezone = DEFAULT_TIMEZONE,
}: {
  ranges: DbRow[];
  from: Date;
  days: number;
  /** Slot grid step (visitor-facing density). Defaults to 15 across the app. */
  stepMinutes: number;
  /**
   * B.PT277 — full event length the visitor would book at this slot.
   * Drives two things separate from `stepMinutes`:
   *   1. The slot's `end` ISO reflects the picked duration so callers
   *      (status check, collision predicate, calendar write) can use
   *      `[start, end)` as the booking range without recomputing.
   *   2. A slot only emits when `start + duration ≤ rangeEnd` — a
   *      60-min booking can't start at 9:45 if availability ends at
   *      10:00. Mirrors cal.com's `slots.ts:178` while-loop guard
   *      (`slotStartTime.add(eventLength).isAfter(range.end)`).
   * When omitted, falls back to `stepMinutes` (today's behaviour: 15
   * step + 15 length, single-duration hosts).
   */
  eventDurationMinutes?: number;
  hostTimezone?: string;
}): UpcomingSlot[] {
  const byDay = new Map<DayOfWeek, DbRow[]>();
  for (const r of ranges) {
    const list = byDay.get(r.dayOfWeek) ?? [];
    list.push(r);
    byDay.set(r.dayOfWeek, list);
  }

  const stepMs = stepMinutes * 60_000;
  const eventMs = (eventDurationMinutes ?? stepMinutes) * 60_000;
  const nowMs = from.getTime();
  // Dedupe by slot-start timestamp. Overlapping availability ranges on
  // the same day (e.g. 10:00–17:00 and 14:00–18:00) would otherwise emit
  // duplicate slots in the overlap window, which breaks React keys and
  // shows the same chip twice to the visitor.
  const seen = new Map<number, UpcomingSlot>();

  // `from` is a UTC instant. We need its calendar date *in the host's
  // zone* so day-of-week mapping respects the host's local midnight.
  // toZonedTime returns a Date whose component getters return host-zone
  // values, then we step day-by-day from there.
  const hostFrom = toZonedTime(from, hostTimezone);

  for (let offset = 0; offset < days; offset++) {
    const hostDay = new Date(hostFrom);
    hostDay.setDate(hostFrom.getDate() + offset);
    const year = hostDay.getFullYear();
    const month = hostDay.getMonth();
    const date = hostDay.getDate();
    // getDay() on a host-zone Date returns the host's local weekday.
    const dayRanges = byDay.get(JS_DAY_TO_ENUM[hostDay.getDay()]) ?? [];

    for (const r of dayRanges) {
      const [sh, sm] = r.startTime.split(":").map(Number);
      const [eh, em] = r.endTime.split(":").map(Number);

      // Build wall-clock strings for the host's local time, then map
      // to UTC. fromZonedTime handles the DST gap/overlap edge cases:
      // a "spring forward" hour that doesn't exist gets the post-jump
      // instant, a "fall back" hour gets the first occurrence.
      const wallStart = makeWallClock(year, month, date, sh, sm);
      const wallEnd = makeWallClock(year, month, date, eh, em);
      const rangeStartMs = fromZonedTime(wallStart, hostTimezone).getTime();
      const rangeEndMs = fromZonedTime(wallEnd, hostTimezone).getTime();

      // B.PT277 — step by `stepMs` (the visitor-facing chip cadence)
      // but require `start + eventMs ≤ rangeEnd` so the booked range
      // genuinely fits inside the host's availability. With multi-
      // duration enabled, a 60-min visitor on a range that ends at
      // 17:00 sees their last bookable slot at 16:00 (not 16:45).
      for (let t = rangeStartMs; t + eventMs <= rangeEndMs; t += stepMs) {
        if (t > nowMs && !seen.has(t)) {
          seen.set(t, {
            start: new Date(t).toISOString(),
            end: new Date(t + eventMs).toISOString(),
          });
        }
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.start.localeCompare(b.start),
  );
}

// fromZonedTime accepts either a Date or an ISO-ish string. Strings
// are easier to reason about — no implicit zone interpretation. Build
// "YYYY-MM-DDTHH:MM:00" zero-padded.
function makeWallClock(
  year: number,
  month: number,
  date: number,
  hour: number,
  minute: number,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(date)}T${pad(hour)}:${pad(minute)}:00`;
}
