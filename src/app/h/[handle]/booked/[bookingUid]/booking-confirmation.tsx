"use client";

import { useState } from "react";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon, CheckIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
import { cn } from "@/lib/utils";

export type BookingConfirmationBooking = {
  publicUid: string;
  slotStart: Date | string;
  slotEnd: Date | string;
  host: {
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

type BookingConfirmationProps = {
  booking: BookingConfirmationBooking;
};

export function BookingConfirmation({ booking }: BookingConfirmationProps) {
  const t = useTranslations("BookingConfirmation");
  const startDate = new Date(booking.slotStart);

  return (
    <OhVisitorShell
      header={
        <>
          <Link
            href="/"
            aria-label={t("headerHomeAria")}
            className="oh-focus-ring rounded-(--oh-r-xs) font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase decoration-oh-content underline-offset-4 transition-[text-decoration] hover:underline"
          >
            OH
          </Link>
          {booking.host.handle ? (
            <Link
              href={`/h/${booking.host.handle}`}
              className="oh-focus-ring oh-legend rounded-(--oh-r-xs) transition-opacity hover:opacity-100"
            >
              /h/{booking.host.handle}
            </Link>
          ) : null}
        </>
      }
      footer={
        <>
          <span>Officehours</span>
          <span className="tabular-nums">
            {t("footerReceipt", { stamp: fmtStamp(startDate) })}
          </span>
        </>
      }
    >
      <BookingConfirmationContent booking={booking} variant="page" />
    </OhVisitorShell>
  );
}

export function BookingConfirmationContent({
  booking,
  variant = "page",
}: BookingConfirmationProps & { variant?: "page" | "modal" }) {
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
  const weekday = format.dateTime(startDate, { weekday: "long" });
  const monthDay = format
    .dateTime(startDate, { month: "long", day: "numeric" })
    .toUpperCase();
  const slotTime = `${fmtTime(format, startDate)} – ${fmtTime(format, endDate)}`;
  const tzLabel = getTimeZoneLabel(t("localTimeFallback"));
  const summaryText = [
    t("summaryTitle", { host: hostName }),
    weekday + ", " + monthDay,
    `${slotTime} (${tzLabel})`,
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
    <div
      className={cn(
        variant === "modal"
          ? "w-full px-5 py-7 sm:px-6 sm:py-8"
          : "mx-auto w-full max-w-[440px] px-5 py-12 sm:max-w-[560px] sm:px-8 sm:py-20 lg:max-w-[680px] lg:px-12 lg:py-28",
      )}
    >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-(--oh-r-xs) border-[1.5px] border-oh-content bg-oh-content text-oh-bg sm:size-8"
            >
              <CheckIcon className="size-4 sm:size-[18px]" strokeWidth={3} />
            </span>
            <span className="oh-legend sm:text-[12px]">
              {t("badgeBooked")}
            </span>
          </div>

          <div
            className={cn(
              variant === "modal" ? "mt-7 sm:mt-8" : "mt-10 sm:mt-14 lg:mt-20",
            )}
          >
            <p className="oh-legend sm:text-[13px]">
              {weekday}
            </p>
            <p
              className={cn(
                "mt-2 font-black leading-[0.88] tracking-[-0.045em] uppercase sm:mt-3",
                variant === "modal"
                  ? "text-[clamp(42px,9vw,72px)]"
                  : "text-[clamp(48px,14vw,160px)]",
              )}
            >
              {monthDay}
            </p>
            <p
              className={cn(
                "mt-4 font-[family-name:var(--oh-mono)] text-[16px] font-bold tabular-nums sm:mt-6 sm:text-[18px]",
                variant === "page" ? "lg:text-[20px]" : undefined,
              )}
            >
              {slotTime}
            </p>
            <p className="mt-1 oh-eyebrow sm:text-[11px]">
              {tzLabel}
            </p>
          </div>

          <div
            className={cn(
              "flex items-center gap-3 border-t-[1.5px] border-oh-line pt-6 sm:gap-4 sm:pt-8",
              variant === "modal" ? "mt-8 sm:mt-9" : "mt-10 sm:mt-14 lg:mt-20",
            )}
          >
            <Avatar className="size-10 rounded-(--oh-r-xs) sm:size-12">
              <AvatarImage
                src={booking.host.image ?? undefined}
                alt={hostName}
                className="rounded-(--oh-r-xs)"
              />
              <AvatarFallback className="rounded-(--oh-r-xs) bg-oh-paper font-[family-name:var(--oh-mono)] text-[12px] font-extrabold text-oh-ink sm:text-[14px]">
                {toInitials(hostName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight sm:text-[17px]">
                {t("withHost", { name: hostName })}
              </p>
              {booking.host.handle ? (
                <p className="mt-0.5 truncate oh-eyebrow sm:text-[11px]">
                  /h/{booking.host.handle}
                </p>
              ) : null}
            </div>
          </div>

          <a
            href={`/api/bookings/${booking.publicUid}/calendar`}
            className={cn(
              buttonVariants({ variant: "oh", size: "oh" }),
              "mt-8 w-full justify-center gap-2 sm:mt-10 sm:h-11",
              variant === "page" ? "lg:h-12" : undefined,
            )}
          >
            <CalendarIcon />
            {t("addToCalendar")}
          </a>

          <div className="mt-6 flex items-center justify-between gap-4 font-[family-name:var(--oh-mono)] text-[10px] font-extrabold tracking-[2px] uppercase sm:mt-8 sm:text-[11px]">
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
  );
}

function fmtTime(format: ReturnType<typeof useFormatter>, date: Date): string {
  return format.dateTime(date, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
