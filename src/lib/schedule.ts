import { z } from "zod";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { DayOfWeek } from "@/generated/prisma/enums";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

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

const DEFAULT_RANGE: RangeValues = { from: "09:00", to: "17:00" };

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

type DbRow = {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
};

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
  stepMinutes: number;
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
  const seen = new Map<number, UpcomingSlot>();

  const hostFrom = toZonedTime(from, hostTimezone);

  for (let offset = 0; offset < days; offset++) {
    const hostDay = new Date(hostFrom);
    hostDay.setDate(hostFrom.getDate() + offset);
    const year = hostDay.getFullYear();
    const month = hostDay.getMonth();
    const date = hostDay.getDate();
    const dayRanges = byDay.get(JS_DAY_TO_ENUM[hostDay.getDay()]) ?? [];

    for (const r of dayRanges) {
      const [sh, sm] = r.startTime.split(":").map(Number);
      const [eh, em] = r.endTime.split(":").map(Number);

      const wallStart = makeWallClock(year, month, date, sh, sm);
      const wallEnd = makeWallClock(year, month, date, eh, em);
      const rangeStartMs = fromZonedTime(wallStart, hostTimezone).getTime();
      const rangeEndMs = fromZonedTime(wallEnd, hostTimezone).getTime();

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
