"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/i18n/actions";
import {
  LOCALES,
  LOCALE_LABELS,
  isLocale,
  type Locale,
} from "@/i18n/locales";
import { SectionHeader } from "@/components/brutalist/section-header";

// Language picker. Sets the `oh_locale` cookie via a server action,
// then revalidatePath('/', 'layout') refreshes every server-rendered
// page below the root layout in the new locale. Native <select> for
// the brutalist aesthetic — no fancy search or grouping at this size.

export function LanguageFields() {
  const t = useTranslations("Settings");
  const current = useLocale() as Locale;
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby="language-legend">
      <SectionHeader
        legendId="language-legend"
        legend={t("languageLegend")}
        description={t("languageDescription")}
      />
      <select
        id="locale"
        aria-labelledby="language-legend"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          start(async () => {
            await setLocaleAction(next);
          });
        }}
        className="bru-input mt-5 min-w-[220px] font-[family-name:var(--oh-mono)] text-[14px]"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </section>
  );
}
