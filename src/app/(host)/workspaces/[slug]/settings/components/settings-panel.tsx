"use client";

import { Link } from "next-view-transitions";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { GeneralSection } from "./general-section";
import { TransferOwnershipSection } from "./transfer-ownership-section";
import { LeaveSection } from "./leave-section";
import { DangerSection } from "./danger-section";

export default function SettingsPanel({ slug }: { slug: string }) {
  const t = useTranslations("WorkspaceSettings");
  const tWorkspaces = useTranslations("Workspaces");
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWriteWorkspace = callerScopes.includes("workspace.write");
  const isOwner = workspace?.callerRole === "OWNER";

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title={workspace?.name ?? t("title")} />

      <div className="mt-4">
        <Link
          href={`/workspaces/${slug}/members`}
          className="oh-eyebrow inline-flex items-center gap-1.5 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          {tWorkspaces("backToMembers")}
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <GeneralSection
          slug={slug}
          name={workspace?.name ?? ""}
          canEdit={canWriteWorkspace}
        />

        {isOwner ? (
          <TransferOwnershipSection slug={slug} />
        ) : null}

        {workspace && !isOwner ? (
          <LeaveSection slug={slug} workspaceName={workspace.name} />
        ) : null}

        {isOwner ? (
          <DangerSection slug={slug} workspaceSlug={slug} />
        ) : null}
      </div>
    </BrutalistPageShell>
  );
}
