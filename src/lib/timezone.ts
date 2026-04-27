import { z } from "zod";

// IANA timezone validation, normalization, and zoned-time math.
// Pattern reference: rallly /apps/web/src/utils/timezone-schema.ts.
//
// Two distinct concerns live here:
// 1. Validation — accept strings only when they round-trip through
//    `Intl.DateTimeFormat`'s resolved-options. ICU provides the truth;
//    we layer a small override map on top for cases where ICU lags
//    behind the IANA database (e.g. "Europe/Kiev" → "Europe/Kyiv").
// 2. Math — convert "wall-clock time in zone X" ↔ UTC. Slot
//    generation lives in src/lib/schedule.ts and uses these helpers.

export const DEFAULT_TIMEZONE = "UTC";

// Override runtime canonicalization when ICU data lags behind IANA
// updates. Add new entries as they appear in the wild.
const ianaOverrides: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
};

export function normalizeIanaId(id: string): string {
  return ianaOverrides[id] ?? id;
}

const fixedOffsetPrefixes = ["etc/", "gmt", "utc"];

function isGeographic(timeZone: string): boolean {
  const lower = timeZone.toLowerCase();
  // "UTC" is a special-case allowed value — the schema's default and a
  // legitimate choice for ops/CI bots. Treated as geographic-equivalent.
  if (lower === "utc") return true;
  return !fixedOffsetPrefixes.some((prefix) => lower.startsWith(prefix));
}

/**
 * Resolve a candidate timezone string to its canonical IANA ID via the
 * runtime, then apply manual overrides. Returns the canonical ID, or
 * `null` if the string is not a valid timezone the runtime knows.
 */
export function resolveTimezone(tz: string): string | null {
  try {
    const resolved = Intl.DateTimeFormat(undefined, {
      timeZone: tz,
    }).resolvedOptions().timeZone;
    return normalizeIanaId(resolved);
  } catch {
    return null;
  }
}

/**
 * Cheap boolean — does the runtime accept this string as a timezone?
 * Use when you want a yes/no without the canonical-form return.
 */
export function isValidTimezone(tz: string): boolean {
  return resolveTimezone(tz) !== null;
}

/**
 * Zod schema that transforms inputs to the canonical IANA ID and
 * rejects anything the runtime doesn't recognize OR anything that
 * isn't a geographic zone (we don't accept "Etc/GMT-5" style fixed
 * offsets — DST awareness needs a real zone).
 */
export const timezoneSchema = z.string().transform((tz, ctx) => {
  const resolved = resolveTimezone(tz);
  if (resolved === null) {
    ctx.issues.push({
      code: "custom",
      message: "Must be a valid IANA timezone",
      input: tz,
    });
    return z.NEVER;
  }
  if (!isGeographic(resolved)) {
    ctx.issues.push({
      code: "custom",
      message: "Must be a geographic timezone (e.g. America/New_York)",
      input: tz,
    });
    return z.NEVER;
  }
  return resolved;
});

// Compact offline fallback for runtimes without `Intl.supportedValuesOf`.
const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Resolve the runtime's full IANA timezone list once. Call from a
 * server component and pass the result to client components as a prop
 * — Node's ICU and the browser's ICU disagree on aliases (e.g.
 * Africa/Asmera vs Africa/Asmara), so computing this in a client
 * `useMemo` triggers a hydration mismatch.
 */
export function getRuntimeTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      // Fall through.
    }
  }
  return FALLBACK_TIMEZONES;
}

/**
 * Client-only helper. Returns the browser's current zone via
 * Intl.DateTimeFormat. Used by the booking form to capture the
 * visitor's zone at submit time, and by the host settings form to
 * pre-fill on first save.
 */
export function getBrowserTimezone(): string {
  if (typeof Intl === "undefined") return DEFAULT_TIMEZONE;
  try {
    return (
      normalizeIanaId(
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ) || DEFAULT_TIMEZONE
    );
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
