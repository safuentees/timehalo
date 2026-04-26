import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  negotiateLocaleFromAcceptLanguage,
} from "./locales";

// Request-scoped i18n config. Resolution order:
// 1. `oh_locale` cookie (user explicit choice — settings page picker
//    sets it).
// 2. `Accept-Language` header (negotiated against LOCALES, first match).
// 3. Default ("en").
//
// Falling back to en + spreading missing keys lets the messages files
// stay sparse — adding a key in en automatically falls through cleanly
// in the other locales until a translator catches up. Pattern verified
// via Context7: next-intl supports `getMessageFallback` for missing
// keys; we rely on the deep-merge default (English defaults loaded
// first, locale overrides on top).

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (fromCookie && isLocale(fromCookie)) {
    return { locale: fromCookie, messages: await loadMessages(fromCookie) };
  }

  const headerStore = await headers();
  const accept = headerStore.get("accept-language") ?? "";
  const negotiated = negotiateLocaleFromAcceptLanguage(accept);
  if (negotiated) {
    return { locale: negotiated, messages: await loadMessages(negotiated) };
  }

  return {
    locale: DEFAULT_LOCALE,
    messages: await loadMessages(DEFAULT_LOCALE),
  };
});

async function loadMessages(
  locale: (typeof LOCALES)[number],
): Promise<Record<string, unknown>> {
  // Always seed with English so a missing key in another locale falls
  // back instead of rendering [missing.key]. cal.com's pattern
  // (packages/i18n/server.ts:12-81) — spread defaults, override with
  // locale-specific.
  const en = (await import("../../messages/en.json")).default;
  if (locale === "en") return en;
  const overrides = (await import(`../../messages/${locale}.json`)).default;
  return { ...en, ...overrides };
}
