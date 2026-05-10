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

// Workspace settings hub. Surfaces B.PT5's lifecycle procedures —
// rename / delete / leave / transferOwnership — under one page,
// gated by role.
//
// Sections render conditionally:
//   - General (rename + slug change): always visible. Rename inputs
//     enable when callerScopes carries `workspace.write`.
//   - Transfer ownership: OWNER only.
//   - Leave: visible when the caller is NOT the owner.
//   - Danger zone (delete): OWNER only. Typed-confirm pattern matches
//     `delete-account-dialog.tsx`.
//
// Ordering follows rallly's general-settings page (general → leave →
// delete) plus a transfer-ownership row in the middle that rallly
// doesn't have because rallly's space model has no co-owners.

export default function SettingsPanel({ slug }: { slug: string }) {
  const t = useTranslations("WorkspaceSettings");
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWriteWorkspace = callerScopes.includes("workspace.write");
  const isOwner = workspace?.callerRole === "OWNER";

  return (
    <OhPageShell>
      <OhPageHeader title={workspace?.name ?? t("title")} />

      {/* Shared sub-nav: back-to-workspaces link + Members |
          Settings tab strip. Single source of truth across both
          detail pages — see workspace-detail-nav.tsx for why. */}
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
