"use client";

import { useTranslations } from "next-intl";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { TimezoneFields } from "./timezone-fields";
import { LanguageFields } from "./language-fields";
import { ThemeFields } from "./theme-fields";
import { WorkflowFields } from "./workflow-fields";
import { CalendarFields } from "./calendar-fields";
import { ApiKeysFields } from "./api-keys-fields";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { SectionHeader } from "@/components/brutalist/section-header";

// Account settings page shell — pure layout, no form state. Each
// section owns its own commit affordance (cal.com / dub.co pattern):
// timezone has a per-section Save button, language autosaves on
// pick, theme autosaves on click, workflows + calendar + api-keys
// commit through dialogs and inline mutations.
//
// Previously this file owned a global <BrutalistSaveBar> that only
// committed the timezone but visually claimed to commit the whole
// page — confusing for the user, untruthful affordance. Now there's
// no global save bar on /settings; the pattern is reserved for pages
// that ARE one form (/profile, /availability).

export default function SettingsForm({ timezones }: { timezones: string[] }) {
  const tSettings = useTranslations("Settings");
  const tDanger = useTranslations("DangerZone");

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title={tSettings("title")} />
      <div className="mt-8 flex flex-col gap-12">
        <TimezoneFields timezones={timezones} />
        <LanguageFields />
        <ThemeFields />
        <WorkflowFields />
        <CalendarFields />
        <ApiKeysFields />
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
    </BrutalistPageShell>
  );
}
