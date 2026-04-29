"use client";

import { useState } from "react";
import { trpc } from "@/trpc/hooks";
import {
  useAddEventTypeHost,
  useRemoveEventTypeHost,
  useUpdateEventTypeHost,
} from "@/lib/mutations/use-event-type-mutations";
import { Button } from "@/components/ui/button";
import { BrutalistInlineEmpty } from "@/components/brutalist/inline-empty";
import { ConfirmDialog } from "@/components/brutalist/confirm-dialog";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

export function HostPoolDialog({
  slug,
  eventTypeId,
  eventTypeName,
  canWrite,
  open,
  onOpenChange,
}: {
  slug: string;
  eventTypeId: string;
  eventTypeName: string;
  canWrite: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader>
          <ResponsiveModalTitle>Hosts · {eventTypeName}</ResponsiveModalTitle>
          <ResponsiveModalDescription>
            Round-robin pool. Fixed hosts must be present; remaining members
            rotate by recent assignment ÷ weight.
          </ResponsiveModalDescription>
        </ResponsiveModalHeader>
        <HostPoolBody
          slug={slug}
          eventTypeId={eventTypeId}
          canWrite={canWrite}
        />
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function HostPoolBody({
  slug,
  eventTypeId,
  canWrite,
}: {
  slug: string;
  eventTypeId: string;
  canWrite: boolean;
}) {
  const { data: hosts, isLoading } = trpc.eventTypes.listHosts.useQuery({
    slug,
    eventTypeId,
  });
  const { data: members } = trpc.workspaces.listMembers.useQuery({ slug });

  return (
    <div className="flex flex-col gap-5 px-5 pb-6 sm:px-6">
      <div>
        {isLoading ? (
          <p className="text-[13px] opacity-55">Loading…</p>
        ) : !hosts || hosts.length === 0 ? (
          <BrutalistInlineEmpty>No hosts yet.</BrutalistInlineEmpty>
        ) : (
          <ul role="list" className="flex flex-col gap-2.5">
            {hosts.map((h) => (
              <li key={h.id}>
                <HostRow
                  slug={slug}
                  eventTypeId={eventTypeId}
                  host={h}
                  canWrite={canWrite}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite ? (
        <AddHostPicker
          slug={slug}
          eventTypeId={eventTypeId}
          members={members ?? []}
          existingUserIds={(hosts ?? []).map((h) => h.user.id)}
        />
      ) : null}
    </div>
  );
}

function HostRow({
  slug,
  eventTypeId,
  host,
  canWrite,
}: {
  slug: string;
  eventTypeId: string;
  host: {
    id: string;
    isFixed: boolean;
    priority: number;
    weight: number;
    recentAssignments: number;
    user: { id: string; handle: string | null; name: string | null; email: string };
  };
  canWrite: boolean;
}) {
  const updateHost = useUpdateEventTypeHost();
  const removeHost = useRemoveEventTypeHost();

  return (
    <article className="rounded-(--bru-r-sm) border-[1.5px] border-bru-line bg-bru-bg p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[14px] font-bold truncate">
          {host.user.name ?? host.user.handle ?? host.user.email}
        </h4>
        <span className="bru-eyebrow tabular-nums opacity-55">
          {host.recentAssignments} recent
        </span>
      </header>

      <p className="bru-eyebrow mt-2 opacity-55 truncate">
        {host.user.email}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
        <label className="bru-eyebrow inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={host.isFixed}
            disabled={!canWrite || updateHost.isPending}
            onChange={(e) =>
              updateHost.mutate({
                slug,
                eventTypeId,
                userId: host.user.id,
                isFixed: e.target.checked,
              })
            }
          />
          Fixed
        </label>
        <label className="bru-eyebrow inline-flex items-center gap-2">
          Priority
          <select
            value={host.priority}
            disabled={!canWrite || updateHost.isPending}
            onChange={(e) =>
              updateHost.mutate({
                slug,
                eventTypeId,
                userId: host.user.id,
                priority: Number(e.target.value),
              })
            }
            className="bru-input font-[family-name:var(--bru-mono)] text-[12px]"
          >
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="bru-eyebrow inline-flex items-center gap-2">
          Weight
          <input
            type="number"
            min={1}
            max={100}
            value={host.weight}
            disabled={!canWrite || updateHost.isPending}
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (
                Number.isFinite(next) &&
                next >= 1 &&
                next <= 100 &&
                next !== host.weight
              ) {
                updateHost.mutate({
                  slug,
                  eventTypeId,
                  userId: host.user.id,
                  weight: next,
                });
              }
            }}
            onChange={() => {}}
            className="bru-input w-20 font-[family-name:var(--bru-mono)] text-[12px]"
          />
        </label>
      </div>

      {canWrite ? (
        <div className="mt-3 flex justify-end">
          <ConfirmDialog
            title="Remove from pool?"
            description={`${host.user.name ?? host.user.handle ?? host.user.email} will no longer be assigned to bookings on this event type.`}
            confirmLabel="Remove"
            cancelLabel="Cancel"
            pending={removeHost.isPending}
            onConfirm={async () => {
              await removeHost.mutateAsync({
                slug,
                eventTypeId,
                userId: host.user.id,
              });
            }}
            trigger={
              <Button
                type="button"
                variant="brutalistGhost"
                size="brutalist"
                disabled={removeHost.isPending}
              >
                Remove
              </Button>
            }
          />
        </div>
      ) : null}
    </article>
  );
}

function AddHostPicker({
  slug,
  eventTypeId,
  members,
  existingUserIds,
}: {
  slug: string;
  eventTypeId: string;
  members: ReadonlyArray<{
    id: string;
    user: { id: string; handle: string | null; name: string | null; email: string };
  }>;
  existingUserIds: ReadonlyArray<string>;
}) {
  const existing = new Set(existingUserIds);
  const candidates = members.filter((m) => !existing.has(m.user.id));
  const [picked, setPicked] = useState<string>("");
  const addHost = useAddEventTypeHost({
    onSuccess: () => setPicked(""),
  });

  if (candidates.length === 0) {
    return (
      <p className="bru-eyebrow opacity-55">
        Every workspace member is already in the pool.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t-2 border-bru-line pt-5">
      <label className="bru-eyebrow inline-flex items-center gap-2">
        Add member
        <select
          value={picked}
          disabled={addHost.isPending}
          onChange={(e) => setPicked(e.target.value)}
          className="bru-input min-w-48 font-[family-name:var(--bru-mono)] text-[12px]"
        >
          <option value="">Select…</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.user.id}>
              {m.user.name ?? m.user.handle ?? m.user.email}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="brutalist"
        size="brutalist"
        disabled={!picked || addHost.isPending}
        onClick={() => {
          if (!picked) return;
          addHost.mutate({
            slug,
            eventTypeId,
            userId: picked,
          });
        }}
      >
        {addHost.isPending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}
