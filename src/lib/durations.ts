import { z } from "zod";

export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 480;
export const DURATION_LIST_MAX_LENGTH = 8;

export const durationMinutesSchema = z
  .number()
  .int()
  .min(DURATION_MIN_MINUTES, `Must be at least ${DURATION_MIN_MINUTES} minutes`)
  .max(DURATION_MAX_MINUTES, `Must be at most ${DURATION_MAX_MINUTES} minutes`);

export const durationsListSchema = z
  .array(durationMinutesSchema)
  .max(DURATION_LIST_MAX_LENGTH, `At most ${DURATION_LIST_MAX_LENGTH} durations`)
  .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b));

export function parseDurationsList(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const filtered = parsed.filter(
      (v): v is number =>
        typeof v === "number" &&
        Number.isInteger(v) &&
        v >= DURATION_MIN_MINUTES &&
        v <= DURATION_MAX_MINUTES,
    );
    return Array.from(new Set(filtered)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export function resolveDurationChoices({
  durationMins,
  durationMinsList,
}: {
  durationMins: number;
  durationMinsList: string;
}): number[] {
  const parsed = parseDurationsList(durationMinsList);
  if (parsed.length === 0) return [durationMins];
  return parsed;
}
