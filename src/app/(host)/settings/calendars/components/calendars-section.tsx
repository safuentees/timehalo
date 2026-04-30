"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { CalendarFields } from "../../components/calendar-fields";

export function CalendarsSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavCalendars")} />
      <div className="mt-8">
        <CalendarFields />
      </div>
    </OhPageShell>
  );
}
