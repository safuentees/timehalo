"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useDeleteEventType } from "@/lib/mutations/use-event-type-mutations";
import { Button } from "@/components/ui/button";
import { OhInlineEmpty } from "@/components/oh/inline-empty";
import { OhPageHeader } from "@/components/oh/page-header";
import { OhPageShell } from "@/components/oh/page-shell";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { SectionHeader } from "@/components/oh/section-header";
import { EventTypeCreateDialog } from "./event-type-create-dialog";
import { EventTypeEditDialog } from "./event-type-edit-dialog";
import { HostPoolDialog } from "./host-pool-dialog";

export default function EventTypesPanel({ slug }: { slug: string }) {
  const t = useTranslations("EventTypes");
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });
  const { data: eventTypes, isLoading } = trpc.eventTypes.list.useQuery({
    slug,
  });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWrite = callerScopes.includes("workspace.write");

  return (
    <OhPageShell>
      <OhPageHeader title={workspace?.name ?? t("pageTitleFallback")} />

      <div className="mt-4">
        <Link
          href="/workspaces"
          className="oh-eyebrow inline-flex items-center gap-1.5 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          {t("backToWorkspaces")}
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <section aria-labelledby="event-types-legend">
          <SectionHeader
            legendId="event-types-legend"
            legend={t("legend")}
            description={t("description")}
            action={canWrite ? <EventTypeCreateDialog slug={slug} /> : undefined}
          />

          <div className="mt-5">
            {isLoading ? (
              <p className="text-[13px] opacity-55">{t("loading")}</p>
            ) : !eventTypes || eventTypes.length === 0 ? (
              <OhInlineEmpty>{t("emptyHint")}</OhInlineEmpty>
            ) : (
              <ul
                role="list"
                aria-labelledby="event-types-legend"
                className="flex flex-col gap-2.5"
              >
                {eventTypes.map((et) => (
                  <li key={et.id}>
                    <EventTypeRow
                      slug={slug}
                      eventType={et}
                      canWrite={canWrite}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </OhPageShell>
  );
}

function EventTypeRow({
  slug,
  eventType,
  canWrite,
}: {
  slug: string;
  eventType: {
    id: string;
    slug: string;
    name: string;
    durationMins: number;
    _count: { hosts: number; bookings: number };
  };
  canWrite: boolean;
}) {
  const t = useTranslations("EventTypes");
  const [editOpen, setEditOpen] = useState(false);
  const [hostsOpen, setHostsOpen] = useState(false);
  const deleteEventType = useDeleteEventType();

  return (
    <article className="oh-sheen rounded-(--oh-r-sm) bg-oh-bg p-4 shadow-[var(--oh-shadow-resting)] transition-[box-shadow,background-color] duration-150 ease-oh hover:shadow-[var(--oh-shadow-hover)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {eventType.name}
        </h3>
        <span className="oh-eyebrow tabular-nums">
          {eventType.durationMins}m
        </span>
      </header>

      <p className="oh-eyebrow mt-2 tabular-nums opacity-55">
        /{eventType.slug}
      </p>

      <p className="oh-description mt-2">
        {t("summary", {
          hostsCount: eventType._count.hosts,
          bookingsCount: eventType._count.bookings,
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ohGhost"
          size="oh"
          onClick={() => setHostsOpen(true)}
        >
          <UsersIcon className="size-3.5" />
          {t("hostsButton")}
        </Button>
        {canWrite ? (
          <>
            <Button
              type="button"
              variant="ohGhost"
              size="oh"
              onClick={() => setEditOpen(true)}
            >
              {t("editButton")}
            </Button>
            <ConfirmDialog
              title={t("deleteConfirmTitle")}
              description={t("deleteConfirmDescription", { name: eventType.name })}
              confirmLabel={t("deleteConfirmConfirm")}
              cancelLabel={t("deleteConfirmCancel")}
              pending={deleteEventType.isPending}
              onConfirm={async () => {
                await deleteEventType.mutateAsync({
                  slug,
                  eventTypeId: eventType.id,
                });
              }}
              trigger={
                <Button
                  type="button"
                  variant="ohGhost"
                  size="oh"
                  disabled={deleteEventType.isPending}
                >
                  {t("deleteButton")}
                </Button>
              }
            />
          </>
        ) : null}
      </div>

      <EventTypeEditDialog
        slug={slug}
        eventType={eventType}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <HostPoolDialog
        slug={slug}
        eventTypeId={eventType.id}
        eventTypeName={eventType.name}
        canWrite={canWrite}
        open={hostsOpen}
        onOpenChange={setHostsOpen}
      />
    </article>
  );
}
