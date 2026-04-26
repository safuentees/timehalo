import { z } from "zod";

export const DEFAULT_TIMEZONE = "UTC";

const ianaOverrides: Record<string, string> = {
  "Europe/Kiev": "Europe/Kyiv",
};

export function normalizeIanaId(id: string): string {
  return ianaOverrides[id] ?? id;
}

const fixedOffsetPrefixes = ["etc/", "gmt", "utc"];

function isGeographic(timeZone: string): boolean {
  const lower = timeZone.toLowerCase();
  if (lower === "utc") return true;
  return !fixedOffsetPrefixes.some((prefix) => lower.startsWith(prefix));
}

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

export function isValidTimezone(tz: string): boolean {
  return resolveTimezone(tz) !== null;
}

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
