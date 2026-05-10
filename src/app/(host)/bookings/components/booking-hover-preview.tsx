"use client";

import { type ReactElement } from "react";
import { useFormatter } from "next-intl";
import { Popover } from "@base-ui/react/popover";
import { MailIcon } from "lucide-react";

export function BookingHoverPreview({
  trigger,
  visitorName,
  visitorEmail,
  question,
  slotStart,
  fmtSlotTime,
}: {
  trigger: ReactElement;
  visitorName: string;
  visitorEmail: string;
  question: string | null;
  slotStart: Date;
  fmtSlotTime: (d: Date) => string;
}) {
  const format = useFormatter();
  const slotDateLabel = format.dateTime(slotStart, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Popover.Root>
      <Popover.Trigger
        render={trigger}
        nativeButton={false}
        openOnHover
        delay={500}
        closeDelay={150}
      />
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          align="start"
          style={{ zIndex: 100 }}
        >
          <Popover.Popup className="flex max-w-[320px] flex-col gap-2 rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] p-4 shadow-[var(--oh-shadow-resting)]">
            <h4 className="truncate text-[15px] font-black leading-[1.2]">
              {visitorName}
            </h4>
            <p className="oh-eyebrow tabular-nums">{slotDateLabel}</p>
            <p className="oh-eyebrow tabular-nums opacity-65">
              {fmtSlotTime(slotStart)}
            </p>
            {question ? (
              <p className="mt-1 line-clamp-3 text-[13px] italic leading-[1.5] opacity-75">
                &ldquo;{question}&rdquo;
              </p>
            ) : null}
            <a
              href={`mailto:${visitorEmail}`}
              onClick={(e) => e.stopPropagation()}
              className="oh-eyebrow oh-focus-ring mt-1 inline-flex min-w-0 items-center gap-1.5 rounded-(--oh-r-xs) opacity-55 transition-opacity duration-150 ease-oh hover:opacity-100"
            >
              <MailIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{visitorEmail}</span>
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
