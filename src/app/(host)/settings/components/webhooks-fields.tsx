"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { Info, Trash2 } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { trpc } from "@/trpc/hooks";
import { useDeleteWebhook } from "@/lib/mutations/use-delete-webhook";
import { Button } from "@/components/ui/button";
import { WebhookCreateDialog } from "./webhook-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { OhCard } from "@/components/oh/oh-card";

export function WebhooksFields() {
  const t = useTranslations("Webhooks");
  const { data: workspaces, isLoading: workspacesLoading } =
    trpc.workspaces.list.useQuery();

  const [pickedSlug, setPickedSlug] = useState<string | null>(null);

  const activeSlug =
    workspaces?.find((w) => w.isActive)?.slug ??
    workspaces?.[0]?.slug ??
    null;
  const [prevActiveSlug, setPrevActiveSlug] = useState<string | null>(
    activeSlug,
  );
  if (activeSlug !== prevActiveSlug) {
    setPrevActiveSlug(activeSlug);
    setPickedSlug(null);
  }

  return (
    <section aria-labelledby="webhooks-legend">
      <SectionHeader
        legendId="webhooks-legend"
        legend={t("legend")}
        description={t("description")}
      />

      {workspacesLoading ? (
        <p className="mt-5 text-[13px] opacity-55">{t("loading")}</p>
      ) : !workspaces || workspaces.length === 0 ? (
        <NoWorkspaceEmpty />
      ) : (
        <WebhooksForWorkspace
          workspaces={workspaces}
          slug={
            pickedSlug && workspaces.some((w) => w.slug === pickedSlug)
              ? pickedSlug
              : (activeSlug ?? workspaces[0].slug)
          }
          onSlugChange={setPickedSlug}
        />
      )}
    </section>
  );
}

type WorkspaceListItem = {
  slug: string;
  name: string;
  isActive: boolean;
};

function WebhooksForWorkspace({
  workspaces,
  slug,
  onSlugChange,
}: {
  workspaces: WorkspaceListItem[];
  slug: string;
  onSlugChange: (slug: string) => void;
}) {
  const t = useTranslations("Webhooks");
  const { data: subs, isLoading } = trpc.webhooks.list.useQuery(
    { slug },
    { placeholderData: keepPreviousData },
  );
  const { data: plan } = trpc.billing.currentPlan.useQuery({ slug });
  const isLocked = plan?.plan === "FREE";
  const isOwner = plan?.callerRole === "OWNER";

  return (
    <>
      {workspaces.length > 1 ? (
        <div className="mt-5">
          <label htmlFor="webhooks-workspace" className="oh-legend">
            {t("workspaceLabel")}
          </label>
          <div className="mt-2">
            <OhSelect
              id="webhooks-workspace"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              wrapperClassName="w-full sm:w-fit"
              className="w-full font-[family-name:var(--oh-mono)] text-[14px] sm:w-auto sm:min-w-[220px]"
            >
              {workspaces.map((w) => (
                <option key={w.slug} value={w.slug}>
                  {w.name}
                </option>
              ))}
            </OhSelect>
          </div>
        </div>
      ) : null}

      {!isLocked || (subs && subs.length > 0) ? (
        <div className="mt-5">
          {isLoading ? (
            <p className="text-[13px] opacity-55">{t("loading")}</p>
          ) : !subs || subs.length === 0 ? (
            <NoSubsEmpty />
          ) : (
            <ul role="list" className="flex flex-col gap-2.5 [&>li]:min-w-0">
              {subs.map((s) => (
                <li key={s.publicUid}>
                  <WebhookRow
                    slug={slug}
                    publicUid={s.publicUid}
                    subscriberUrl={s.subscriberUrl}
                    events={s.events}
                    active={s.active}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        {isLocked ? (
          <UpgradePrompt
            isOwner={isOwner}
            ownerName={plan?.owner?.name ?? plan?.owner?.handle ?? null}
          />
        ) : (
          plan?.callerRole === "VIEWER" ? null : (
            <WebhookCreateDialog slug={slug} />
          )
        )}
      </div>
    </>
  );
}

function UpgradePrompt({
  isOwner,
  ownerName,
}: {
  isOwner: boolean;
  ownerName: string | null;
}) {
  const t = useTranslations("Webhooks");
  if (!isOwner && ownerName) {
    return (
      <OhInlineEmpty>
        {t("upgradePromptAskOwner", { ownerName })}
      </OhInlineEmpty>
    );
  }
  return (
    <OhInlineEmpty>
      {t("upgradePrompt")}{" "}
      <Link
        href="/settings/billing"
        className="oh-focus-ring !underline !underline-offset-4 !decoration-[1.5px] !decoration-current transition-opacity duration-150 ease-oh hover:opacity-100"
      >
        {t("upgradeLink")}
      </Link>
    </OhInlineEmpty>
  );
}

function WebhookRow({
  slug,
  publicUid,
  subscriberUrl,
  events,
  active,
}: {
  slug: string;
  publicUid: string;
  subscriberUrl: string;
  events: string;
  active: boolean;
}) {
  const t = useTranslations("Webhooks");
  const deleteWebhook = useDeleteWebhook();
  const eventList = events
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const hasMetadata = eventList.length > 0 || !active;

  return (
    <OhCard
      muted={!active}
      className="flex min-w-0 flex-col gap-2 p-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-black leading-[1.2]">
          {subscriberUrl}
        </h3>
        {hasMetadata ? (
          <Popover.Root>
            <Popover.Trigger
              className="oh-focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) text-[color:var(--oh-content-muted)] transition-[color,background-color] duration-150 ease-oh hover:bg-[var(--oh-tint)] hover:text-[var(--oh-ink)] data-[popup-open]:bg-[var(--oh-tint)] data-[popup-open]:text-[var(--oh-ink)] sm:hidden"
              aria-label={t("infoLabel")}
            >
              <Info
                strokeWidth={1.75}
                className="size-4"
                aria-hidden
              />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner
                sideOffset={6}
                align="end"
                style={{ zIndex: 100 }}
              >
                <Popover.Popup className="flex max-w-[260px] flex-col gap-2 rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] p-3 shadow-[var(--oh-shadow-resting)]">
                  {eventList.length > 0 ? (
                    <p
                      className="oh-eyebrow opacity-65"
                      aria-label={t("eventsListLabel")}
                    >
                      {eventList.join(" / ")}
                    </p>
                  ) : null}
                  {!active ? (
                    <p className="text-[12px] leading-[1.5] opacity-65">
                      {t("inactiveHint")}
                    </p>
                  ) : null}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
      </div>

      {eventList.length > 0 ? (
        <p
          className="hidden truncate oh-eyebrow opacity-45 sm:block"
          aria-label={t("eventsListLabel")}
        >
          {eventList.join(" / ")}
        </p>
      ) : null}
      {!active ? (
        <p className="hidden text-[12px] opacity-55 sm:block">
          {t("inactiveHint")}
        </p>
      ) : null}

      <div className="mt-auto self-end">
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ohGhost"
              size="icon-sm"
              disabled={deleteWebhook.isPending}
              aria-label={t("delete")}
            >
              <Trash2
                strokeWidth={1.75}
                className="size-4"
                aria-hidden
              />
            </Button>
          }
          title={t("deleteTitle")}
          description={t("deleteConfirm")}
          confirmLabel={t("delete")}
          pendingLabel={t("deleting")}
          cancelLabel={t("cancel")}
          pending={deleteWebhook.isPending}
          onConfirm={() => deleteWebhook.mutateAsync({ slug, publicUid })}
        />
      </div>
    </OhCard>
  );
}

function NoWorkspaceEmpty() {
  const t = useTranslations("Webhooks");
  return (
    <OhInlineEmpty className="mt-5">
      {t("noWorkspaceEmpty")}
    </OhInlineEmpty>
  );
}

function NoSubsEmpty() {
  const t = useTranslations("Webhooks");
  return <OhInlineEmpty>{t("noSubsEmpty")}</OhInlineEmpty>;
}
