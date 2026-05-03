import { DAY_KEYS, type DayKey } from "@/lib/schedule";

// Pure helpers extracted from availability-fields.tsx (B.PT26B).
// Lives without "use client" so vitest property tests can import
// directly without pulling React + next-intl deps. The component
// builds a `DayLabelStrings` object via next-intl's `useFormatter`
// + `useTranslations` and threads it into these helpers; tests
// inject a synthetic identity nameOf to focus on the range-
// compression algorithm.

export type DayNameOf = (
  key: DayKey,
  length: "short" | "long",
) => string;

export type DayLabelStrings = {
  nameOf: DayNameOf;
  empty: string;
  everyDay: string;
};

const WEEKDAYS: ReadonlySet<DayKey> = new Set([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
]);
const WEEKENDS: ReadonlySet<DayKey> = new Set(["sat", "sun"]);
const DAY_INDEX: Record<DayKey, number> = Object.fromEntries(
  DAY_KEYS.map((key, index) => [key, index]),
) as Record<DayKey, number>;

function sortDays(days: DayKey[]): DayKey[] {
  return [...new Set(days)].sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);
}

/**
 * Produce a compact human label for a set of days.
 *
 * Range-compression algorithm:
 *   - `[]` → `strings.empty` (e.g. "No days" / "Sin días")
 *   - all 7 → `strings.everyDay` (e.g. "Every day")
 *   - mon..fri only → "{Mon} – {Fri}" (locale-aware)
 *   - sat, sun → "{Sat} – {Sun}"
 *   - else: walk sorted indices, open a run on each value, close on
 *     contiguity break. Each closed run emits a single name (run of 1)
 *     or "{start} – {end}" (run of 2+). Joined with ", ".
 *
 *     [mon, tue, wed]            → "Mon – Wed"
 *     [mon, tue, wed, fri, sat]  → "Mon – Wed, Fri – Sat"
 *     [mon, wed, fri]            → "Mon, Wed, Fri"
 *
 * Locale wiring:
 *   `strings.nameOf` resolves a DayKey to its localized weekday name
 *   for the requested length. The component constructs it via
 *   `useFormatter().dateTime(refDate, { weekday: length })`.
 */
export function formatDayLabel(
  days: DayKey[],
  length: "short" | "long",
  strings: DayLabelStrings,
): string {
  if (days.length === 0) return strings.empty;
  if (days.length === 7) return strings.everyDay;

  const name = (key: DayKey) => strings.nameOf(key, length);

  const isAllWeekdays =
    days.length === 5 &&
    days.every((d) => WEEKDAYS.has(d)) &&
    WEEKDAYS.size === days.length;
  if (isAllWeekdays) return `${name("mon")} – ${name("fri")}`;

  const isAllWeekends =
    days.length === 2 &&
    days.every((d) => WEEKENDS.has(d)) &&
    WEEKENDS.size === days.length;
  if (isAllWeekends) return `${name("sat")} – ${name("sun")}`;

  const sorted = sortDays(days);
  const indices = sorted.map((d) => DAY_INDEX[d]);
  const runs: Array<[number, number]> = [];
  let start = indices[0];
  let prev = start;
  for (let i = 1; i < indices.length; i++) {
    const curr = indices[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      runs.push([start, prev]);
      start = curr;
      prev = curr;
    }
  }
  runs.push([start, prev]);

  return runs
    .map(([s, e]) =>
      s === e
        ? name(sorted[indices.indexOf(s)])
        : `${name(sorted[indices.indexOf(s)])} – ${name(sorted[indices.indexOf(e)])}`,
    )
    .join(", ");
}

/**
 * Validation sentinel keys for a single hour-block draft. Pure
 * function — caller maps the sentinel to a localized message via
 * next-intl. The overlap payload includes the locale-aware short
 * day names produced by `nameOf`, so an es-locale user sees
 * "overlap:lun, mié" instead of "overlap:Mon, Wed."
 *
 * Returns:
 *   - `null` — valid
 *   - `"needsDay"` — no days picked
 *   - `"endBeforeStart"` — `from >= to`
 *   - `"overlap:<comma-list-of-day-names>"` — the draft's time range
 *     overlaps another block on at least one shared day. Day names
 *     are short-form, locale-resolved.
 */
export type BlockDraftLike = { days: DayKey[]; from: string; to: string };
export type BlockLike = BlockDraftLike;

export function validateDraft(
  draft: BlockDraftLike,
  others: BlockLike[],
  nameOf: DayNameOf,
): string | null {
  if (draft.days.length === 0) return "needsDay";
  if (draft.from >= draft.to) return "endBeforeStart";
  for (const other of others) {
    const shared = draft.days.filter((d) => other.days.includes(d));
    if (shared.length === 0) continue;
    if (draft.from < other.to && other.from < draft.to) {
      return `overlap:${shared.map((d) => nameOf(d, "short")).join(", ")}`;
    }
  }
  return null;
}

/**
 * Build a `DayNameOf` from next-intl's formatter. Maps each DayKey
 * to a fixed reference Date in 2025 (`2025-01-06` is a Monday;
 * weekday +N for `tue..sun`) and asks the formatter for that
 * weekday's localized name.
 *
 * Memoize at the call site so the closure isn't rebuilt every
 * render.
 */
export type Formatter = {
  dateTime: (
    value: Date,
    options: { weekday: "short" | "long" },
  ) => string;
};

const REF_DATES: Record<DayKey, Date> = {
  mon: new Date("2025-01-06T12:00:00Z"),
  tue: new Date("2025-01-07T12:00:00Z"),
  wed: new Date("2025-01-08T12:00:00Z"),
  thu: new Date("2025-01-09T12:00:00Z"),
  fri: new Date("2025-01-10T12:00:00Z"),
  sat: new Date("2025-01-11T12:00:00Z"),
  sun: new Date("2025-01-12T12:00:00Z"),
};

export function buildDayNameOf(format: Formatter): DayNameOf {
  return (key, length) =>
    format.dateTime(REF_DATES[key], { weekday: length });
}
