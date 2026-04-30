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

export function WorkflowFields() {
  const t = useTranslations("Workflows");
  const { data, isLoading } = trpc.workflows.list.useQuery();
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const activeSlug =
    workspaces?.find((w) => w.isActive)?.slug ?? workspaces?.[0]?.slug;
  const { data: plan } = trpc.billing.currentPlan.useQuery(
    { slug: activeSlug ?? "" },
    { enabled: Boolean(activeSlug) },
  );
  const isLocked = plan?.plan === "FREE";

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
    <article className="rounded-(--oh-r-sm) border-[1.5px] border-oh-line bg-oh-bg p-4 transition-colors duration-150 ease-oh hover:border-oh-line-strong">
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
    </article>
  );
}

type TriggerKey =
  | "trigger_BEFORE_EVENT"
  | "trigger_EVENT_CREATED"
  | "trigger_EVENT_CANCELLED"
  | "trigger_EVENT_RESCHEDULED";

type ActionKey =
  | "action_EMAIL_VISITOR"
  | "action_EMAIL_HOST"
  | "action_WEBHOOK_FIRE";
