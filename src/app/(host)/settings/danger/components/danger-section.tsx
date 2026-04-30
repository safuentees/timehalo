"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { SectionHeader } from "@/components/oh/section-header";
import { DeleteAccountDialog } from "../../components/delete-account-dialog";

export function DangerSection() {
  const t = useTranslations("Settings");
  const tDanger = useTranslations("DangerZone");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavDanger")} />
      <section className="mt-8">
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
