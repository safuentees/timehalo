// Single source of truth for the app's locale set. Two locales today:
// English (default) and Spanish. Adding a new locale: append the code
// here, drop a matching JSON file in `messages/`, run pnpm tsc.
//
// Pattern reference: rallly /apps/web/src/i18n/i18n.ts — same shape,
// same default-spread + locale-overrides fallback strategy delegated
// to next-intl's missing-key handler.

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "oh_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse an Accept-Language header and return the first supported
 * locale, or null. Lightweight RFC 7231 §5.3.5 implementation —
 * splits on commas, drops q-values, matches language-tag prefix
 * against LOCALES in the user's preference order.
 *
 * Tested in isolation; consumed by the next-intl request handler.
 */
export function negotiateLocaleFromAcceptLanguage(
  accept: string,
): Locale | null {
  const candidates = accept
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    const prefix = candidate.split("-")[0];
    const match = LOCALES.find((l) => l === prefix);
    if (match) return match;
  }
  return null;
}
