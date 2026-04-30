"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { TimezoneFields } from "./timezone-fields";
import { LanguageFields } from "./language-fields";
import { ThemeFields } from "./theme-fields";
import { WorkflowFields } from "./workflow-fields";
import { CalendarFields } from "./calendar-fields";
import { ApiKeysFields } from "./api-keys-fields";
import { BillingFields } from "./billing-fields";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { SectionHeader } from "@/components/oh/section-header";

export default function SettingsForm({ timezones }: { timezones: string[] }) {
  const tSettings = useTranslations("Settings");
  const tDanger = useTranslations("DangerZone");

  return (
    <OhPageShell>
      <OhPageHeader title={tSettings("title")} />
      <div className="mt-8 flex flex-col gap-12">
        <TimezoneFields timezones={timezones} />
        <LanguageFields />
        <ThemeFields />
        <WorkflowFields />
        <CalendarFields />
        <ApiKeysFields />
        <BillingFields />
      </div>

      <section className="mt-16">
        <SectionHeader
          legend={tDanger("label")}
          title={tDanger("deleteAccountTitle")}
          description={tDanger("deleteAccountDescription")}
        />
        <div className="mt-5">
          <DeleteAccountDialog />
        </div>
      </section>
    </OhPageShell>
  );
}
