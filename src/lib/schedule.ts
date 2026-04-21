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
