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
import { Field } from "@/components/ui/field";

// Language picker. Sets the `oh_locale` cookie via a server action,
// then revalidatePath('/', 'layout') refreshes every server-rendered
// page below the root layout in the new locale. Native <select> for
// the brutalist aesthetic — no fancy search or grouping at this size.

export function LanguageFields() {
  const t = useTranslations("Settings");
  const current = useLocale() as Locale;
  const [pending, start] = useTransition();

  return (
    <Field>
      <label
        htmlFor="locale"
        className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55"
      >
        {t("languageLegend")}
      </label>
      <p className="mt-3 text-[13px] leading-[1.5] opacity-65 max-w-prose">
        {t("languageDescription")}
      </p>
      <select
        id="locale"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (!isLocale(next)) return;
          start(async () => {
            await setLocaleAction(next);
          });
        }}
        className="bru-input mt-3 min-w-[220px] font-[family-name:var(--bru-mono)] text-[14px]"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </Field>
  );
}
