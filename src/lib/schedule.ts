import { z } from "zod";
import { DayOfWeek } from "@/generated/prisma/enums";

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
 * Walk the next `days` calendar days, and for each day's availability ranges
 * emit back-to-back fixed-length slots. Only future slots are returned; past
 * times on the first day are skipped. Returned dates are ISO strings so they
 * survive JSON serialization to the client.
 */
export function generateUpcomingSlots({
  ranges,
  from,
  days,
  stepMinutes,
}: {
  ranges: DbRow[];
  from: Date;
  days: number;
  stepMinutes: number;
}): UpcomingSlot[] {
  const byDay = new Map<DayOfWeek, DbRow[]>();
  for (const r of ranges) {
    const list = byDay.get(r.dayOfWeek) ?? [];
    list.push(r);
    byDay.set(r.dayOfWeek, list);
  }

  const stepMs = stepMinutes * 60_000;
  const nowMs = from.getTime();
  // Dedupe by slot-start timestamp. Overlapping availability ranges on
  // the same day (e.g. 10:00–17:00 and 14:00–18:00) would otherwise emit
  // duplicate slots in the overlap window, which breaks React keys and
  // shows the same chip twice to the visitor.
  const seen = new Map<number, UpcomingSlot>();

  for (let offset = 0; offset < days; offset++) {
    const day = new Date(from);
    day.setDate(from.getDate() + offset);
    const dayRanges = byDay.get(JS_DAY_TO_ENUM[day.getDay()]) ?? [];

    for (const r of dayRanges) {
      const [sh, sm] = r.startTime.split(":").map(Number);
      const [eh, em] = r.endTime.split(":").map(Number);

      const rangeStart = new Date(day);
      rangeStart.setHours(sh, sm, 0, 0);
      const rangeEnd = new Date(day);
      rangeEnd.setHours(eh, em, 0, 0);

      for (let t = rangeStart.getTime(); t + stepMs <= rangeEnd.getTime(); t += stepMs) {
        if (t > nowMs && !seen.has(t)) {
          seen.set(t, {
            start: new Date(t).toISOString(),
            end: new Date(t + stepMs).toISOString(),
          });
        }
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.start.localeCompare(b.start),
  );
}
