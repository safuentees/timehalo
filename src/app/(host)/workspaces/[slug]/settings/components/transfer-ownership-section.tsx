"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { useTransferOwnership } from "@/lib/mutations/use-transfer-ownership";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";

// Transfer ownership picker. Eligible recipients = workspace members
// other than the current owner. The user picks one + a ConfirmDialog
// validates the choice; on confirm the procedure runs an atomic
// OWNER↔ADMIN swap inside one transaction.
//
// Single picker + single confirm beats dub.co's two-step modal flow
// here — the procedure is atomic and the UI surface is small enough
// that one confirm covers the irreversibility.

export function TransferOwnershipSection({ slug }: { slug: string }) {
  const t = useTranslations("WorkspaceSettings");
  const { data: members } = trpc.workspaces.listMembers.useQuery({ slug });
  const [pickedUserId, setPickedUserId] = useState<string>("");

  const eligible = useMemo(
    () => (members ?? []).filter((m) => m.role !== "OWNER"),
    [members],
  );

  const transfer = useTransferOwnership({
    onSuccess: () => {
      setPickedUserId("");
    },
  });

  const target = eligible.find((m) => m.user.id === pickedUserId) ?? null;
  const targetName =
    target?.user.name ?? target?.user.handle ?? target?.user.email ?? "";

  return (
    <section aria-labelledby="transfer-legend">
      <SectionHeader
        legendId="transfer-legend"
        legend={t("transferLegend")}
        description={t("transferDescription")}
      />

      <div className="mt-5">
        {eligible.length === 0 ? (
          <OhInlineEmpty>
            {t("transferNoCandidates")}
          </OhInlineEmpty>
        ) : (
          <div className="flex flex-col gap-3">
            <label htmlFor="transfer-target" className="oh-legend">
              {t("transferTargetLabel")}
            </label>
            <select
              id="transfer-target"
              value={pickedUserId}
              onChange={(e) => setPickedUserId(e.target.value)}
              disabled={transfer.isPending}
              className="oh-input w-full font-[family-name:var(--oh-mono)] text-[13px]"
            >
              <option value="">{t("transferPlaceholder")}</option>
              {eligible.map((m) => {
                const display =
                  m.user.name ?? m.user.handle ?? m.user.email;
                return (
                  <option key={m.user.id} value={m.user.id}>
                    {display}
                  </option>
                );
              })}
            </select>

            <div className="flex justify-end">
              <ConfirmDialog
                trigger={
                  <Button
                    type="button"
                    variant="brutalistGhost"
                    size="brutalist"
                    disabled={!target || transfer.isPending}
                  >
                    {transfer.isPending
                      ? t("transferring")
                      : t("transferAction")}
                  </Button>
                }
                title={t("transferConfirmTitle")}
                description={t("transferConfirmDescription", {
                  target: targetName,
                })}
                confirmLabel={t("transferAction")}
                pendingLabel={t("transferring")}
                cancelLabel={t("cancel")}
                pending={transfer.isPending}
                onConfirm={async () => {
                  if (!target) return;
                  await transfer.mutateAsync({
                    slug,
                    newOwnerUserId: target.user.id,
                  });
                }}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
