"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLeaveWorkspace } from "@/lib/mutations/use-leave-workspace";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/brutalist/confirm-dialog";
import { SectionHeader } from "@/components/brutalist/section-header";

// Leave-workspace section. Visible only when the caller isn't the
// owner — owners must transfer or delete instead, the procedure
// blocks the action server-side either way. Single ConfirmDialog
// because leaving a non-owned workspace is recoverable (re-invite
// flow), so the typed-confirm pattern is overkill.

export function LeaveSection({
  slug,
  workspaceName,
}: {
  slug: string;
  workspaceName: string;
}) {
  const t = useTranslations("WorkspaceSettings");
  const router = useRouter();

  const leave = useLeaveWorkspace({
    onSuccess: () => {
      router.replace("/workspaces");
    },
  });

  return (
    <section aria-labelledby="leave-legend">
      <SectionHeader
        legendId="leave-legend"
        legend={t("leaveLegend")}
        description={t("leaveDescription")}
      />

      <div className="mt-5 flex justify-end">
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="brutalistGhost"
              size="brutalist"
              disabled={leave.isPending}
            >
              {leave.isPending ? t("leaving") : t("leaveAction")}
            </Button>
          }
          title={t("leaveConfirmTitle")}
          description={t("leaveConfirmDescription", {
            workspace: workspaceName,
          })}
          confirmLabel={t("leaveAction")}
          pendingLabel={t("leaving")}
          cancelLabel={t("cancel")}
          pending={leave.isPending}
          onConfirm={async () => {
            await leave.mutateAsync({ slug });
          }}
        />
      </div>
    </section>
  );
}
