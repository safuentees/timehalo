"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { ApiKeysFields } from "../../components/api-keys-fields";
import { WebhooksFields } from "../../components/webhooks-fields";

export function DeveloperSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavDeveloper")} />
      <div className="mt-8 flex flex-col gap-12">
        <ApiKeysFields />
        <WebhooksFields />
      </div>
    </OhPageShell>
  );
}
