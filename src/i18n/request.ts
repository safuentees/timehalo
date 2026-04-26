import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  negotiateLocaleFromAcceptLanguage,
} from "./locales";

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
  const en = (await import("../../messages/en.json")).default;
  if (locale === "en") return en;
  const overrides = (await import(`../../messages/${locale}.json`)).default;
  return { ...en, ...overrides };
}
