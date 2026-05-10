import { z } from "zod";

// Visitor-selectable duration options on an EventType. Stored on
// `EventType.durationMinsList` as JSON TEXT. The on-disk shape is
// either the legacy `number[]` ("[15, 30]") or the current
// `DurationOption[]`
// (`[{"minutes":15,"title":"Quick chat"}, {"minutes":30}]`). The
// parser below upgrades legacy rows on read so callers always see
// the object shape.
//
// Why widen from int → object on the same column instead of a new
// table: the list is a closed set (cap 8) bound to a single
// EventType, never queried by content, never joined. A row would
// add referential overhead with zero query benefit. Keeping the
// JSON column also dodges the prisma migrate against Turso friction
// (per `.claude/rules/database-runbook.md`).
//
// Bounds (minutes):
//   • 5 minute floor — slot generation grids by 15 today, 5-min
//     floor lets future tighter grids carry without re-validation.
//   • 480 minute ceiling (8h) — caps at a workday so a host can't
//     accidentally type 9999 and shadow availability with one
//     booking.
//   • Distinct minutes — UI dedupes; server dedupes on write.
//   • Sorted ascending — chip strip renders shortest-first.
//
// Bounds (title):
//   • Max 60 chars — fits on a chip without wrapping at typical
//     viewport widths. Cal.com caps custom event-type titles at 60.
//   • Whitespace-only collapses to null (treated as "no title set,
//     use the duration label as the chip caption").
//
// Bounds (description):
//   • Max 240 chars — short paragraph that reads cleanly in the
//     handle-modal subtitle slot. Cal.com event-type descriptions
//     are markdown + 1500 chars; we stay plaintext + tight.
//   • Whitespace-only collapses to null.
//
// Cap of 8 entries — the chip strip on /h/[handle] is a horizontal
// row; >8 chips overflow on mobile. Cal.com defaults to 5 entries
// (15/30/45/60/90).

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

// Trim whitespace, collapse empty to null. Used by both title and
// description so the on-disk shape never carries semantic-empty
// strings (`""` and `"   "` both → null).
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

// Dedupes by `minutes` (last-wins so a re-typed title overrides),
// then sorts ascending. The transform is the canonical normalize
// step before write.
export const durationsListSchema = z
  .array(durationOptionSchema)
  .max(DURATION_LIST_MAX_LENGTH, `At most ${DURATION_LIST_MAX_LENGTH} durations`)
  .transform((arr) => {
    const byMinutes = new Map<number, DurationOption>();
    for (const opt of arr) byMinutes.set(opt.minutes, opt);
    return Array.from(byMinutes.values()).sort((a, b) => a.minutes - b.minutes);
  });

// Defensive parse for the raw JSON-string column. Three legal
// shapes after schema evolution:
//   • `[]`                                — empty (host hasn't set anything)
//   • `[15, 30]`                          — legacy int array
//   • `[{"minutes":15,"title":"…"}, …]`   — current
// Plus illegal/malformed: parse error, non-array, entries failing
// bounds → all collapse to `[]` (UI shows "no bookable durations").
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
    // Dedupe by minutes (last-wins), sort ascending.
    const byMinutes = new Map<number, DurationOption>();
    for (const opt of upgraded) byMinutes.set(opt.minutes, opt);
    return Array.from(byMinutes.values()).sort(
      (a, b) => a.minutes - b.minutes,
    );
  } catch {
    return [];
  }
}

// Resolve the visitor's effective duration choice list from the
// EventType's `durationMinsList` column. Bootstrap (setHandle) seeds
// new EventType rows with `[{minutes: durationMins}]`; B.PT278's
// backfill migration converted every pre-existing `[]` →
// `[durationMins]` so on-disk rows reflect the host's actual
// bookable durations.
//
// Empty result means "host has no bookable durations" — the visitor
// page renders a placeholder and `bookings.create` refuses. Don't
// re-introduce the fallback to `durationMins`: it makes the editor
// (`/profile`) show fewer chips than the visitor view because adding
// a first chip overwrites the implicit fallback rather than appending
// to it. Pre-seeding at write time keeps editor + visitor in lockstep.
//
// `durationMins` stays on `ResolvedEventType` because it remains the
// no-input default for `bookings.create` when the visitor omits a
// duration AND the list contains it (the chip strip wires only to
// `durationChoices` so this is purely a programmatic-call fallback).
export function resolveDurationChoices({
  durationMinsList,
}: {
  durationMinsList: string;
}): DurationOption[] {
  return parseDurationsList(durationMinsList);
}
