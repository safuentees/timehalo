"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/trpc/hooks";
import { useCalendarSetSelected } from "@/lib/mutations/use-calendar-set-selected";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
} from "@/components/ui/responsive-modal";

// Per-credential calendar selector. Lists every calendar on the
// connected account; each row toggles whether busy-times from that
// calendar count against the host's availability. Save sends the
// full set — `setSelected` reconciles.
//
// The dialog opens when `credentialId` is non-null. Caller controls
// the open state by setting the id (open) or null (closed).

type Props = {
  credentialId: string | null;
  externalAccountEmail: string | null;
  onClose: () => void;
};

export function CalendarPickDialog({
  credentialId,
  externalAccountEmail,
  onClose,
}: Props) {
  const t = useTranslations("Calendar");
  const open = credentialId !== null;
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveModalContent>
        <ResponsiveModalHeader className="px-5 pt-2 pb-4">
          <ResponsiveModalTitle className="font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase">
            {t("pickTitle")}
            {externalAccountEmail ? (
              <span className="ml-2 font-normal opacity-60 normal-case tracking-normal text-[12px]">
                {externalAccountEmail}
              </span>
            ) : null}
          </ResponsiveModalTitle>
        </ResponsiveModalHeader>
        {credentialId ? (
          <CalendarPickBody
            credentialId={credentialId}
            onClose={onClose}
          />
        ) : null}
      </ResponsiveModalContent>
    </ResponsiveModal>
  );
}

function CalendarPickBody({
  credentialId,
  onClose,
}: {
  credentialId: string;
  onClose: () => void;
}) {
  const t = useTranslations("Calendar");
  const { data, isLoading, error } = trpc.calendar.listCalendars.useQuery(
    { credentialId },
    { staleTime: 0 },
  );
  // Local toggle overrides keyed by externalCalendarId. The server
  // payload is the source of truth; this map records pending edits
  // so a refetch (e.g. global invalidation after another mutation)
  // doesn't clobber in-flight choices.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const setSelected = useCalendarSetSelected({
    onSuccess: () => {
      onClose();
    },
  });

  if (error) {
    return (
      <div className="px-5 pb-6 text-[13px] opacity-65">
        {error.message}
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="px-5 pb-6 text-[13px] opacity-65">
        {t("loading")}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="px-5 pb-6 text-[13px] opacity-65">
        {t("pickEmpty")}
      </div>
    );
  }

  const rows = data.map((c) => ({
    ...c,
    selected: overrides[c.externalCalendarId] ?? c.selected,
  }));

  function toggle(externalCalendarId: string, current: boolean) {
    setOverrides((prev) => ({ ...prev, [externalCalendarId]: !current }));
  }

  async function onSave() {
    await setSelected.mutateAsync({
      credentialId,
      calendars: rows
        .filter((c) => c.selected)
        .map((c) => ({
          externalCalendarId: c.externalCalendarId,
          summary: c.summary,
          isPrimary: c.isPrimary,
        })),
    });
  }

  const isPending = setSelected.isPending;

  return (
    <div className="px-5 pb-6 flex flex-col gap-5">
      <p className="text-[13px] leading-[1.5] opacity-65">
        {t("pickDescription")}
      </p>
      <ul
        role="list"
        className="border-2 border-bru-line divide-y-2 divide-bru-line"
      >
        {rows.map((c) => (
          <li
            key={c.externalCalendarId}
            className="flex items-center gap-3 px-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">
                {c.summary}
              </p>
              {c.isPrimary ? (
                <p className="mt-1 font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[2px] uppercase opacity-55">
                  {t("primaryBadge")}
                </p>
              ) : null}
            </div>
            <Switch
              checked={c.selected}
              onCheckedChange={() =>
                toggle(c.externalCalendarId, c.selected)
              }
              aria-label={c.summary}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="brutalistGhost"
          size="brutalist"
          onClick={onClose}
          disabled={isPending}
        >
          {t("cancel")}
        </Button>
        <Button
          type="button"
          variant="brutalist"
          size="brutalist"
          onClick={onSave}
          disabled={isPending}
        >
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
