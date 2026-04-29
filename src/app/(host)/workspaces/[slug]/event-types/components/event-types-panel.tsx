"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { ArrowLeftIcon, UsersIcon } from "lucide-react";
import { trpc } from "@/trpc/hooks";
import { useDeleteEventType } from "@/lib/mutations/use-event-type-mutations";
import { Button } from "@/components/ui/button";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { BrutalistPageHeader } from "@/components/brutalist/page-header";
import { BrutalistPageShell } from "@/components/brutalist/page-shell";
import { ConfirmDialog } from "@/components/brutalist/confirm-dialog";
import { SectionHeader } from "@/components/brutalist/section-header";
import { EventTypeCreateDialog } from "./event-type-create-dialog";
import { EventTypeEditDialog } from "./event-type-edit-dialog";
import { HostPoolDialog } from "./host-pool-dialog";

// B4 panel — workspace event-types management. Three slices stacked
// in the standard /settings rhythm:
//   1. Header + back link to /workspaces
//   2. Event types section — list + Create CTA + per-row Edit /
//      Hosts / Delete affordances
//
// Permission gating reads from workspaces.get.callerScopes — the
// server enforces, the client toggles "show vs hide" only.

export default function EventTypesPanel({ slug }: { slug: string }) {
  const { data: workspace } = trpc.workspaces.get.useQuery({ slug });
  const { data: eventTypes, isLoading } = trpc.eventTypes.list.useQuery({
    slug,
  });

  const callerScopes = workspace?.callerScopes ?? [];
  const canWrite = callerScopes.includes("workspace.write");

  return (
    <BrutalistPageShell>
      <BrutalistPageHeader title={workspace?.name ?? "Event types"} />

      <div className="mt-4">
        <Link
          href="/workspaces"
          className="bru-eyebrow inline-flex items-center gap-1.5 transition-opacity hover:opacity-100"
        >
          <ArrowLeftIcon className="size-3" aria-hidden />
          Back to workspaces
        </Link>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <section aria-labelledby="event-types-legend">
          <SectionHeader
            legendId="event-types-legend"
            legend="Event types"
            description="Bookable resources. Each event type runs its own host pool."
            action={canWrite ? <EventTypeCreateDialog slug={slug} /> : undefined}
          />

          <div className="mt-5">
            {isLoading ? (
              <p className="text-[13px] opacity-55">Loading…</p>
            ) : !eventTypes || eventTypes.length === 0 ? (
              <BrutalistInlineEmpty>
                No event types yet. Create one to start accepting bookings.
              </BrutalistInlineEmpty>
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
    </BrutalistPageShell>
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
  const [editOpen, setEditOpen] = useState(false);
  const [hostsOpen, setHostsOpen] = useState(false);
  const deleteEventType = useDeleteEventType();

  return (
    <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4 transition-colors duration-150 ease-bru hover:border-bru-line-strong">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[16px] leading-[1.2] font-black truncate">
          {eventType.name}
        </h3>
        <span className="bru-eyebrow tabular-nums">
          {eventType.durationMins}m
        </span>
      </header>

      <p className="bru-eyebrow mt-2 tabular-nums opacity-55">
        /{eventType.slug}
      </p>

      <p className="mt-2 text-[13px] opacity-75">
        {eventType._count.hosts}{" "}
        {eventType._count.hosts === 1 ? "host" : "hosts"} ·{" "}
        {eventType._count.bookings}{" "}
        {eventType._count.bookings === 1 ? "booking" : "bookings"}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="brutalist"
          onClick={() => setHostsOpen(true)}
        >
          <UsersIcon className="size-3.5" />
          Hosts
        </Button>
        {canWrite ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="brutalist"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
            <ConfirmDialog
              title="Delete event type?"
              description={`Removes "${eventType.name}" and its host pool. Past bookings are kept (eventTypeId nullifies). This cannot be undone.`}
              confirmLabel="Delete"
              cancelLabel="Cancel"
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
                  variant="brutalistGhost"
                  size="brutalist"
                  disabled={deleteEventType.isPending}
                >
                  Delete
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
