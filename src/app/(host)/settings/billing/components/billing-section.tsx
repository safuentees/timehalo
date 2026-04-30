"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { BillingFields } from "../../components/billing-fields";

export function BillingSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavBilling")} />
      <div className="mt-8">
        <BillingFields />
      </div>
    </OhPageShell>
  );
}
