"use client";

import { useTranslations } from "next-intl";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { WorkflowFields } from "../../components/workflow-fields";

export function WorkflowsSection() {
  const t = useTranslations("Settings");
  return (
    <OhPageShell tight>
      <OhPageHeader title={t("subnavWorkflows")} />
      <div className="mt-8">
        <WorkflowFields />
      </div>
    </OhPageShell>
  );
}
