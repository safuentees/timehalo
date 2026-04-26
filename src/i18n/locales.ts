
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
