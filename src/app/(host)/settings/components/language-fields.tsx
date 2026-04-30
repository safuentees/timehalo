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
import { OhSelect } from "@/components/oh/oh-select";
import { SectionHeader } from "@/components/oh/section-header";

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
      <div className="mt-5">
        <OhSelect
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
          wrapperClassName="w-fit"
          className="min-w-[220px] font-[family-name:var(--oh-mono)] text-[14px]"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </OhSelect>
      </div>
    </section>
  );
}
