"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowRight,
  CalendarIcon,
  CalendarClockIcon,
  Loader2,
  XIcon,
} from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { buttonVariants } from "@/components/ui/button";
import { BOOKING_SUBMIT_BUTTON_CLASS } from "@/components/calendar/booking-form";
import { cn } from "@/lib/utils";
import type { BookingConfirmationBooking } from "./booking-confirmation";
import { HandleHostAvatar } from "../../components/handle-host-avatar";

export function BookingReceiptContent({
  booking,
}: {
  booking: BookingConfirmationBooking;
}) {
  const router = useRouter();
  const t = useTranslations("BookingConfirmation");
  const format = useFormatter();
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied">(
    "idle",
  );
  const [isRescheduleNavPending, startRescheduleNavTransition] =
    useTransition();

  const hostName =
    booking.host.name ?? booking.host.handle ?? t("fallbackHostName");
  const startDate = new Date(booking.slotStart);
  const endDate = new Date(booking.slotEnd);
  const durationMinutes = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / 60000),
  );
  const tzLabel = getTimeZoneLabel(t("localTimeFallback"));

  const summaryText = [
    t("summaryTitle", { host: hostName }),
    format.dateTime(startDate, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    `${fmtTime(format, startDate)} – ${fmtTime(format, endDate)} (${tzLabel})`,
    t("summaryReference", { ref: booking.publicUid }),
  ].join("\n");

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("summaryTitle", { host: hostName }),
          text: summaryText,
          url: window.location.href,
        });
        flashShareState("shared");
        return;
      }
      await navigator.clipboard.writeText(
        `${summaryText}\n${window.location.href}`,
      );
      flashShareState("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  function flashShareState(next: "shared" | "copied") {
    setShareState(next);
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between p-5 sm:p-6">
      <div className="flex flex-col gap-6">
        <div
          className="@container flex items-center"
          style={{ gap: "clamp(14px, 5.5cqi, 24px)" }}
        >
          <HandleHostAvatar
            src={booking.host.image}
            alt={hostName}
            initials={toInitials(hostName)}
            size="clamp(48px, 21cqi, 88px)"
          />
          <div className="min-w-0 flex-1">
            <p
              className="oh-eyebrow opacity-55"
              style={{ fontSize: "clamp(10px, 3.5cqi, 14px)" }}
            >
              {t("withLabel")}
            </p>
            <p
              className="mt-0.5 truncate font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(17px, 8cqi, 32px)" }}
            >
              {hostName}
            </p>
            {booking.host.handle ? (
              <p
                className="mt-0.5 truncate oh-eyebrow opacity-55"
                style={{ fontSize: "clamp(10px, 3.5cqi, 14px)" }}
              >
                /h/{booking.host.handle}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-y-2">
          <dt className="oh-eyebrow opacity-55">{t("durationLabel")}</dt>
          <dd className="text-right font-[family-name:var(--oh-mono)] text-[13px] font-bold tabular-nums">
            {t("durationMinutes", { minutes: durationMinutes })}
          </dd>
          <dt className="oh-eyebrow opacity-55">{t("timeZoneLabel")}</dt>
          <dd className="truncate text-right font-[family-name:var(--oh-mono)] text-[12px] font-extrabold uppercase tracking-[1.5px] tabular-nums">
            {tzLabel}
          </dd>
        </dl>
      </div>

      <div className="flex flex-col gap-4">
        <a
          href={`/api/bookings/${booking.publicUid}/calendar`}
          className={cn(
            buttonVariants({ variant: "oh", size: "oh" }),
            "flex w-full items-center justify-center gap-2",
            BOOKING_SUBMIT_BUTTON_CLASS,
          )}
        >
          <CalendarIcon className="size-4" strokeWidth={2.25} />
          {t("addToCalendar")}
        </a>

        <div className="flex items-center justify-between gap-3 font-[family-name:var(--oh-mono)] text-[10px] font-extrabold uppercase tracking-[2px]">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleShare}
              className="opacity-55 transition-opacity hover:opacity-100"
            >
              {shareState === "idle"
                ? t("share")
                : shareState === "shared"
                  ? t("shared")
                  : t("copied")}
            </button>
            {booking.host.handle ? (
              <Popover.Root>
                <Popover.Trigger
                  nativeButton
                  className="opacity-55 transition-opacity hover:opacity-100 data-[popup-open]:opacity-100"
                >
                  {t("reschedule")}
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    sideOffset={10}
                    align="start"
                    style={{ zIndex: 200 }}
                  >
                    <Popover.Popup className="flex items-center gap-3 rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] py-2 pl-3 pr-2 shadow-[var(--oh-shadow-resting)]">
                      <div className="flex items-center gap-2">
                        <CalendarClockIcon
                          aria-hidden
                          strokeWidth={1.75}
                          className="size-3.5 shrink-0 opacity-55"
                        />
                        <p className="whitespace-nowrap text-[13px] font-bold leading-tight tracking-tight">
                          {t("rescheduleConfirmTitle")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Popover.Close
                          aria-label={t("rescheduleConfirmCancel")}
                          disabled={isRescheduleNavPending}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) opacity-55 transition-[opacity,background-color] hover:bg-[color:var(--oh-tint-hover)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          <XIcon
                            strokeWidth={2.25}
                            aria-hidden
                            className="size-3.5"
                          />
                        </Popover.Close>
                        <Popover.Close
                          aria-label={t("rescheduleConfirmCta")}
                          disabled={isRescheduleNavPending}
                          onClick={(e) => {
                            if (isRescheduleNavPending) {
                              e.preventDefault();
                              return;
                            }
                            startRescheduleNavTransition(() => {
                              router.push(
                                `/h/${booking.host.handle}?reschedule=${booking.publicUid}`,
                              );
                            });
                          }}
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-(--oh-r-xs) bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:hover:opacity-100"
                        >
                          {isRescheduleNavPending ? (
                            <Loader2
                              strokeWidth={2.25}
                              aria-hidden
                              className="size-3.5 animate-spin"
                            />
                          ) : (
                            <ArrowRight
                              strokeWidth={2.25}
                              aria-hidden
                              className="size-3.5"
                            />
                          )}
                        </Popover.Close>
                      </div>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            ) : null}
          </div>
          <span className="truncate opacity-40">#{booking.publicUid}</span>
        </div>
      </div>
    </div>
  );
}

function fmtTime(format: ReturnType<typeof useFormatter>, date: Date): string {
  return format.dateTime(date, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTimeZoneLabel(fallback: string): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const tail = zone.split("/").pop() ?? zone;
    return tail.replace(/_/g, " ").toUpperCase() || fallback;
  } catch {
    return fallback;
  }
}

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
