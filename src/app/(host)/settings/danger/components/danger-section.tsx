"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { SectionHeader } from "@/components/oh/section-header";
import { DataExportButton } from "../../components/data-export-button";
import { DeleteAccountDialog } from "../../components/delete-account-dialog";

export function DangerSection() {
  const t = useTranslations("Settings");
  const tDanger = useTranslations("DangerZone");
  const tExport = useTranslations("DataExport");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavDanger")} />
      <div className="mt-8 flex flex-col gap-12">
        <section>
          <SectionHeader
            legend={tExport("label")}
            title={tExport("title")}
            description={tExport("description")}
          />
          <div className="mt-5">
            <DataExportButton />
          </div>
        </section>
        <section>
          <SectionHeader
            legend={tDanger("label")}
            title={tDanger("deleteAccountTitle")}
            description={tDanger("deleteAccountDescription")}
          />
          <div className="mt-5">
            <DeleteAccountDialog />
          </div>
        </section>
      </div>
    </OhPageShell>
  );
}
