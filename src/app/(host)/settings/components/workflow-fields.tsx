"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";
import { useDeleteWorkflow } from "@/lib/mutations/use-delete-workflow";
import { useUpdateWorkflow } from "@/lib/mutations/use-update-workflow";
import { WorkflowCreateDialog } from "./workflow-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { OhCard } from "@/components/oh/oh-card";

// Settings → Workflows section. Lists user-scoped workflow rules
// (trigger × action × offset) and exposes the create dialog.
//
// Per-row affordances kept minimal for v1: an inline "active" toggle
// (the most common edit) and a delete button. Full edit lives in a
// future iteration — the server's update procedure already supports
// name + offset + active patches.

export function WorkflowFields() {
  const t = useTranslations("Workflows");
  const { data, isLoading } = trpc.workflows.list.useQuery();
  // B.PT18 — workflows are user-scoped today (`Workflow.userId` is
  // the only FK; no `workspaceId`). The server gate inside
  // `workflows.create` calls `planForUser(ctx.user.id)`, which reads
  // the user's primary owned workspace's Subscription. The UI mirrors
  // that with `users.plan` so the lock state stays consistent with
  // the procedure-level gate. Switching the topbar workspace no
  // longer flips the lock — workflows aren't workspace-scoped, so
  // they shouldn't appear to be. (Future SIGNAL-GATED row B.PT19
  // tracks the migration to workspace-scoped workflows when a real
  // need surfaces.)
  const { data: planResp } = trpc.users.plan.useQuery();
  const isLocked = planResp?.plan === "FREE";

  return (
    <section aria-labelledby="workflows-legend">
      <SectionHeader
        legendId="workflows-legend"
        legend={t("legend")}
        description={t("description")}
      />

      <div className="mt-5">
        {isLoading ? (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        ) : !data || data.length === 0 ? (
          <OhInlineEmpty>{t("listEmpty")}</OhInlineEmpty>
        ) : (
          <ul
            role="list"
            aria-labelledby="workflows-legend"
            className="flex flex-col gap-2.5"
          >
            {data.map((w) => (
              <li key={w.id}>
                <WorkflowRow
                  id={w.id}
                  name={w.name}
                  trigger={w.trigger}
                  offsetMinutes={w.offsetMinutes}
                  action={w.action}
                  template={w.template}
                  webhookEvent={w.webhookEvent}
                  active={w.active}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        {isLocked ? (
          <OhInlineEmpty>
            {t("upgradePrompt")}{" "}
            <a
              href="#billing-legend"
              className="underline decoration-dotted underline-offset-2 transition-opacity duration-150 ease-oh hover:opacity-100"
            >
              {t("upgradeLink")}
            </a>
          </OhInlineEmpty>
        ) : (
          <WorkflowCreateDialog />
        )}
      </div>
    </section>
  );
}

function WorkflowRow({
  id,
  name,
  trigger,
  offsetMinutes,
  action,
  template,
  webhookEvent,
  active,
}: {
  id: string;
  name: string;
  trigger: string;
  offsetMinutes: number;
  action: string;
  template: string | null;
  webhookEvent: string | null;
  active: boolean;
}) {
  const t = useTranslations("Workflows");
  const update = useUpdateWorkflow();
  const remove = useDeleteWorkflow();

  const subtitle = [
    t(`trigger_${trigger}` as TriggerKey),
    trigger === "BEFORE_EVENT" ? `${offsetMinutes}m` : null,
    t(`action_${action}` as ActionKey),
    template ?? webhookEvent ?? null,
  ]
    .filter(Boolean)
    .join(" / ");

  const isUpdating = update.isPending;
  const isDeleting = remove.isPending;

  return (
    <OhCard className="p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {name}
        </h3>
        <span className="oh-eyebrow tabular-nums">
          {active ? t("statusActive") : t("statusInactive")}
        </span>
      </header>
      <p className="oh-eyebrow mt-2">
        {subtitle}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ohGhost"
          size="oh"
          disabled={isUpdating}
          onClick={() => update.mutate({ id, active: !active })}
        >
          {active ? t("toggleOff") : t("toggleOn")}
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              disabled={isDeleting}
            >
              {isDeleting ? t("deleting") : t("delete")}
            </Button>
          }
          title={t("deleteTitle")}
          description={t("deleteDescription")}
          confirmLabel={t("delete")}
          pendingLabel={t("deleting")}
          cancelLabel={t("cancel")}
          pending={isDeleting}
          onConfirm={() => remove.mutateAsync({ id })}
        />
      </div>
    </OhCard>
  );
}

// Narrow message-key types so `t()` stays type-safe across the union.
type TriggerKey =
  | "trigger_BEFORE_EVENT"
  | "trigger_EVENT_CREATED"
  | "trigger_EVENT_CANCELLED"
  | "trigger_EVENT_RESCHEDULED";

type ActionKey =
  | "action_EMAIL_VISITOR"
  | "action_EMAIL_HOST"
  | "action_WEBHOOK_FIRE";
