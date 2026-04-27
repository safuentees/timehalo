"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { Button } from "@/components/ui/button";
import { useDeleteWorkflow } from "@/lib/mutations/use-delete-workflow";
import { useUpdateWorkflow } from "@/lib/mutations/use-update-workflow";
import { WorkflowCreateDialog } from "./workflow-create-dialog";
import { SectionHeader } from "./section-header";

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

  return (
    <section>
      <SectionHeader
        legend={t("legend")}
        description={t("description")}
      />

      <div className="mt-5">
        {isLoading ? (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        ) : !data || data.length === 0 ? (
          <p className="text-[13px] opacity-55 border-[1.5px] border-dashed border-bru-line p-4 rounded-(--bru-r-xs)">
            {t("listEmpty")}
          </p>
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
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
        <WorkflowCreateDialog />
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
    <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {name}
        </h3>
        <span className="font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.8px] uppercase opacity-55 tabular-nums">
          {active ? t("statusActive") : t("statusInactive")}
        </span>
      </header>
      <p className="mt-2 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase opacity-55">
        {subtitle}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="brutalistGhost"
          size="brutalist"
          disabled={isUpdating}
          onClick={() => update.mutate({ id, active: !active })}
        >
          {active ? t("toggleOff") : t("toggleOn")}
        </Button>
        <Button
          type="button"
          variant="brutalistGhost"
          size="brutalist"
          disabled={isDeleting}
          onClick={() => remove.mutate({ id })}
        >
          {isDeleting ? t("deleting") : t("delete")}
        </Button>
      </div>
    </article>
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
