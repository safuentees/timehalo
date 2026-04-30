"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { ApiKeysFields } from "../../components/api-keys-fields";

export function DeveloperSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavDeveloper")} />
      <div className="mt-8">
        <ApiKeysFields />
      </div>
    </OhPageShell>
  );
}
