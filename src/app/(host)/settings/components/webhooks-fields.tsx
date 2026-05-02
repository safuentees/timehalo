"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/trpc/hooks";
import { useDeleteWebhook } from "@/lib/mutations/use-delete-webhook";
import { Button } from "@/components/ui/button";
import { WebhookCreateDialog } from "./webhook-create-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhSelect } from "@/components/oh/oh-select";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";

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
              wrapperClassName="w-fit"
              className="min-w-[220px] font-[family-name:var(--oh-mono)] text-[14px]"
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

      <div className="mt-5">
        {isLoading ? (
          <p className="text-[13px] opacity-55">{t("loading")}</p>
        ) : !subs || subs.length === 0 ? (
          <NoSubsEmpty />
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
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

      <div className="mt-4">
        {isLocked ? <UpgradePrompt /> : <WebhookCreateDialog slug={slug} />}
      </div>
    </>
  );
}

function UpgradePrompt() {
  const t = useTranslations("Webhooks");
  return (
    <OhInlineEmpty>
      {t("upgradePrompt")}{" "}
      <a
        href="#billing-legend"
        className="underline decoration-dotted underline-offset-2 transition-opacity duration-150 ease-oh hover:opacity-100"
      >
        {t("upgradeLink")}
      </a>
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

  return (
    <article
      className={[
        "rounded-(--oh-r-sm) border-[1.5px] bg-oh-bg p-4 transition-colors duration-150 ease-oh",
        active
          ? "border-oh-line hover:border-oh-line-strong"
          : "border-oh-line opacity-60",
      ].join(" ")}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-black leading-[1.2]">
          {subscriberUrl}
        </h3>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              disabled={deleteWebhook.isPending}
            >
              {deleteWebhook.isPending ? t("deleting") : t("delete")}
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
      </header>

      {eventList.length > 0 ? (
        <p
          className="mt-2 truncate oh-eyebrow opacity-45"
          aria-label={t("eventsListLabel")}
        >
          {eventList.join(" / ")}
        </p>
      ) : null}
      {!active ? (
        <p className="mt-2 text-[12px] opacity-55">{t("inactiveHint")}</p>
      ) : null}
    </article>
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
