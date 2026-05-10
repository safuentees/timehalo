"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { GeneralSection } from "./general-section";
import { TransferOwnershipSection } from "./transfer-ownership-section";
import { LeaveSection } from "./leave-section";
import { DangerSection } from "./danger-section";
import { WorkspaceDetailNav } from "../../components/workspace-detail-nav";

export default function SettingsPanel({ slug }: { slug: string }) {
  const t = useTranslations("WorkspaceSettings");
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWriteWorkspace = callerScopes.includes("workspace.write");
  const isOwner = workspace?.callerRole === "OWNER";

  return (
    <OhPageShell>
      <OhPageHeader title={workspace?.name ?? t("title")} />

      <WorkspaceDetailNav slug={slug} active="settings" />

      <div className="mt-8 flex flex-col gap-12">
        <GeneralSection
          slug={slug}
          name={workspace?.name ?? ""}
          canEdit={canWriteWorkspace}
        />

        {isOwner ? <TransferOwnershipSection slug={slug} /> : null}

        {workspace && !isOwner ? (
          <LeaveSection slug={slug} workspaceName={workspace.name} />
        ) : null}

        {isOwner ? <DangerSection slug={slug} workspaceSlug={slug} /> : null}
      </div>
    </OhPageShell>
  );
}
