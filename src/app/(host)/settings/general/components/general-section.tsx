"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { TimezoneFields } from "../../components/timezone-fields";
import { LanguageFields } from "../../components/language-fields";
import { ThemeFields } from "../../components/theme-fields";

export function GeneralSection({ timezones }: { timezones: string[] }) {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavGeneral")} />
      <div className="mt-8 flex flex-col gap-12">
        <TimezoneFields timezones={timezones} />
        <LanguageFields />
        <ThemeFields />
      </div>
    </OhPageShell>
  );
}
