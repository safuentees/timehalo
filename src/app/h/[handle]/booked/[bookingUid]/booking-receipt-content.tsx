"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { BOOKING_SUBMIT_BUTTON_CLASS } from "@/components/calendar/booking-form";
import { cn } from "@/lib/utils";
import type { BookingConfirmationBooking } from "./booking-confirmation";

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
        <div className="flex items-center gap-3.5">
          <Avatar className="size-12">
            <AvatarImage src={booking.host.image ?? undefined} alt={hostName} />
            <AvatarFallback className="bg-oh-paper font-[family-name:var(--oh-mono)] text-[12px] font-extrabold text-oh-ink">
              {toInitials(hostName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="oh-eyebrow opacity-55">{t("withLabel")}</p>
            <p className="mt-0.5 truncate text-[17px] font-bold leading-tight tracking-tight">
              {hostName}
            </p>
            {booking.host.handle ? (
              <p className="mt-0.5 truncate oh-eyebrow opacity-55">
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
              <ConfirmDialog
                trigger={
                  <button
                    type="button"
                    className="opacity-55 transition-opacity hover:opacity-100"
                  >
                    {t("reschedule")}
                  </button>
                }
                title={t("rescheduleConfirmTitle")}
                description={t("rescheduleConfirmDescription")}
                confirmLabel={t("rescheduleConfirmCta")}
                cancelLabel={t("rescheduleConfirmCancel")}
                onConfirm={() => {
                  router.push(
                    `/h/${booking.host.handle}?reschedule=${booking.publicUid}`,
                  );
                }}
              />
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
