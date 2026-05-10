import { z } from "zod";

export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 480;
export const DURATION_LIST_MAX_LENGTH = 8;
export const DURATION_TITLE_MAX_LENGTH = 60;
export const DURATION_DESCRIPTION_MAX_LENGTH = 240;

export const durationMinutesSchema = z
  .number()
  .int()
  .min(DURATION_MIN_MINUTES, `Must be at least ${DURATION_MIN_MINUTES} minutes`)
  .max(DURATION_MAX_MINUTES, `Must be at most ${DURATION_MAX_MINUTES} minutes`);

const optionalTrimmedString = (max: number) =>
  z
    .string()
    .max(max, `Must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    });

export const durationOptionSchema = z.object({
  minutes: durationMinutesSchema,
  title: optionalTrimmedString(DURATION_TITLE_MAX_LENGTH),
  description: optionalTrimmedString(DURATION_DESCRIPTION_MAX_LENGTH),
});

export type DurationOption = z.infer<typeof durationOptionSchema>;

export const durationsListSchema = z
  .array(durationOptionSchema)
  .max(DURATION_LIST_MAX_LENGTH, `At most ${DURATION_LIST_MAX_LENGTH} durations`)
  .transform((arr) => {
    const byMinutes = new Map<number, DurationOption>();
    for (const opt of arr) byMinutes.set(opt.minutes, opt);
    return Array.from(byMinutes.values()).sort((a, b) => a.minutes - b.minutes);
  });

export function parseDurationsList(raw: string): DurationOption[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const upgraded: DurationOption[] = [];
    for (const v of parsed) {
      if (typeof v === "number" && Number.isInteger(v)) {
        if (v >= DURATION_MIN_MINUTES && v <= DURATION_MAX_MINUTES) {
          upgraded.push({ minutes: v, title: null, description: null });
        }
        continue;
      }
      if (v && typeof v === "object" && "minutes" in v) {
        const o = v as { minutes: unknown; title?: unknown; description?: unknown };
        if (
          typeof o.minutes !== "number" ||
          !Number.isInteger(o.minutes) ||
          o.minutes < DURATION_MIN_MINUTES ||
          o.minutes > DURATION_MAX_MINUTES
        ) {
          continue;
        }
        upgraded.push({
          minutes: o.minutes,
          title:
            typeof o.title === "string" && o.title.trim().length > 0
              ? o.title.slice(0, DURATION_TITLE_MAX_LENGTH)
              : null,
          description:
            typeof o.description === "string" &&
            o.description.trim().length > 0
              ? o.description.slice(0, DURATION_DESCRIPTION_MAX_LENGTH)
              : null,
        });
      }
    }
    const byMinutes = new Map<number, DurationOption>();
    for (const opt of upgraded) byMinutes.set(opt.minutes, opt);
    return Array.from(byMinutes.values()).sort(
      (a, b) => a.minutes - b.minutes,
    );
  } catch {
    return [];
  }
}

export function resolveDurationChoices({
  durationMinsList,
}: {
  durationMinsList: string;
}): DurationOption[] {
  return parseDurationsList(durationMinsList);
}
