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

// B.PT265 — receipt-modal-only content. Standalone /booked page
// keeps `BookingConfirmationContent` (variant="page") with its
// billboard date hero. The intercepted-modal route gets a tighter,
// host-first layout: the date+time live in the chrome row's title
// (set by `booking-receipt-modal.tsx`), so the body focuses on
// host identity, the meta strip, and the action stack — no
// duplication, no oversized hero competing with the surrounding
// frame.
//
// Action hierarchy (Apple HIG-style):
//   - Primary: Add to calendar — same pill shape as BookingForm's
//     Confirm Booking button (`BOOKING_SUBMIT_BUTTON_CLASS` is
//     exported for this exact reuse)
//   - Secondary: Share + Reschedule — link-style mono caps in a
//     hairline-separated footer row, matching the visitor surface's
//     tertiary-chrome vocabulary
//
// Reschedule remains gated by `<ConfirmDialog>` per the
// `oh-ui.md` destructive-action rule (visitor is leaving a finished
// receipt; mid-stakes confirm).

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

  // Share payload mirrors the page-variant summary so a
  // share-from-modal lands the same blob as a share-from-receipt
  // page would. Source of truth lives here, not in two places.
  const summaryText = [
    t("summaryTitle", { host: hostName }),
    format
      .dateTime(startDate, {
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
    <div className="flex flex-col gap-6 px-5 py-7 sm:px-6 sm:py-8">
      {/* Host card — replaces the page-variant's CHECK badge as the
          primary visual anchor. The chrome-row title already
          confirms "Booked on …", so the body's job is to ground the
          meeting in a face + handle, not re-confirm the booking
          state. Avatar 48 (down from 40+sm:48 in the page variant)
          keeps the row dense; eyebrow/name/handle stack on the right. */}
      <div className="flex items-center gap-3.5">
        <Avatar className="size-12 rounded-(--oh-r-xs)">
          <AvatarImage
            src={booking.host.image ?? undefined}
            alt={hostName}
            className="rounded-(--oh-r-xs)"
          />
          <AvatarFallback className="rounded-(--oh-r-xs) bg-oh-paper font-[family-name:var(--oh-mono)] text-[12px] font-extrabold text-oh-ink">
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

      {/* Meta strip — duration + tz. Hairlines top + bottom frame
          the row as a discrete information layer (visually
          separates the host from the action stack below). Two
          columns with mono numerics on the right; same legend/value
          pattern the dashboard's hub pages use. */}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-y-2 border-y border-oh-line py-4">
        <dt className="oh-eyebrow opacity-55">{t("durationLabel")}</dt>
        <dd className="text-right font-[family-name:var(--oh-mono)] text-[13px] font-bold tabular-nums">
          {t("durationMinutes", { minutes: durationMinutes })}
        </dd>
        <dt className="oh-eyebrow opacity-55">{t("timeZoneLabel")}</dt>
        <dd className="truncate text-right font-[family-name:var(--oh-mono)] text-[12px] font-extrabold uppercase tracking-[1.5px] tabular-nums">
          {tzLabel}
        </dd>
      </dl>

      {/* Primary action — Add to Calendar shaped exactly like
          BookingForm's Confirm Booking pill (BOOKING_SUBMIT_BUTTON_
          CLASS, exported from booking-form.tsx). The button.tsx
          `oh` variant supplies paper-on-ink + ink-on-paper hover;
          the constant adds the rounded-[10px] pill, mono 13
          ExtraBold, shadow halo, active depress. Same primary CTA
          vocabulary across the booking flow. */}
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

      {/* Footer — secondary actions + reference id. Share + Reschedule
          stay link-style (no border, no fill) so the primary CTA
          above keeps its visual weight. Reference id sits on the
          right at 40% opacity — present for support tickets, doesn't
          compete. Single flex row keeps the height tight. */}
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
