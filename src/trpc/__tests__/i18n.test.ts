import { describe, it, expect } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  negotiateLocaleFromAcceptLanguage,
} from "@/i18n/locales";

describe("i18n — locale set", () => {
  it("includes English as default", () => {
    expect(LOCALES).toContain("en");
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("isLocale narrows known values", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(123)).toBe(false);
  });
});

describe("i18n — Accept-Language negotiation", () => {
  it("picks the first supported tag", () => {
    expect(
      negotiateLocaleFromAcceptLanguage("es-MX,en;q=0.9,fr;q=0.5"),
    ).toBe("es");
  });

  it("falls through unsupported tags to a supported one", () => {
    expect(
      negotiateLocaleFromAcceptLanguage("fr-CA,de;q=0.9,en-US;q=0.5"),
    ).toBe("en");
  });

  it("returns null when no supported language matches", () => {
    expect(negotiateLocaleFromAcceptLanguage("de,fr;q=0.5")).toBeNull();
  });

  it("handles bare language tag without country", () => {
    expect(negotiateLocaleFromAcceptLanguage("es")).toBe("es");
  });

  it("treats empty string as no preference", () => {
    expect(negotiateLocaleFromAcceptLanguage("")).toBeNull();
  });

  it("ignores q-values in the preference order — first wins", () => {
    expect(
      negotiateLocaleFromAcceptLanguage("es;q=0.5,en;q=0.9"),
    ).toBe("es");
  });
});
