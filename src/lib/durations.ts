import { z } from "zod";

// Visitor-selectable duration list on an EventType. Stored on
// `EventType.durationMinsList` as a JSON-stringified Int[] (SQLite
// has no native array type — same shape as `User.onboardingManual
// Steps`). Empty `[]` falls back to single-duration behavior;
// `bookings.create` and the /h/[handle] chip strip both treat
// `EventType.durationMins` as the only choice in that case.
//
// Bounds:
//   • Minimum 5 minutes — slot generation grids by 15 today, but a
//     5-minute floor lets future tighter grids carry without
//     re-validating the schema.
//   • Maximum 480 minutes (8 hours) — caps at a workday so a host
//     can't accidentally type 9999 and shadow their entire
//     availability with one booking.
//   • Distinct values — UI dedupes on add; server dedupes on write
//     to belt-and-suspenders against direct API calls.
//   • Sorted ascending — stable on-disk shape; the chip strip
//     renders shortest-first by convention.
//
// Cap of 8 entries — the chip strip on /h/[handle] is a horizontal
// row; >8 chips overflows on mobile + reads as "indecisive host"
// rather than "flexible host." Cal.com defaults to a 5-entry list
// (15/30/45/60/90); 8 is comfortable headroom without being a wall.

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

// Defensive parse for the raw JSON-string column. Malformed rows,
// non-array payloads, or entries that fall outside the bounds all
// collapse to an empty array — the UI treats `[]` as "host hasn't
// configured durations; default to durationMins." Mirrors `parseManual
// Steps` in the users router.
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

// Resolve the visitor's effective duration choice list given the
// EventType's stored configuration. When the host hasn't configured
// any durations, the singleton default is the only choice. When
// configured, the configured list is canonical (the default is
// implicitly included only if the host added it).
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
