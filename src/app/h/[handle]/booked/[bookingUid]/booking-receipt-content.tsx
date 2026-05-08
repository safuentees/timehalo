"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/oh/confirm-dialog";
import { BOOKING_SUBMIT_BUTTON_CLASS } from "@/components/calendar/booking-form";
import { cn } from "@/lib/utils";
import type { BookingConfirmationBooking } from "./booking-confirmation";
import { HandleHostAvatar } from "../../components/handle-host-avatar";

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
    // B.PT267 / B.PT268 — `justify-evenly` distributes the top
    // group (host+meta) and bottom group (button+footer) with
    // EQUAL gaps at the cream's top edge, between the groups,
    // and at the bottom edge. Per MDN + Tailwind docs:
    //   justify-content: space-evenly
    //   "spacing between each pair of adjacent items, the
    //    main-start edge and the first item, and the main-end
    //    edge and the last item, are all exactly the same."
    //
    // **B.PT268 — must use `flex-1`, not `h-full`**, for this
    // div to actually fill the cream container's height. The
    // cream container is `flex min-h-0 flex-1 flex-col` — its
    // height is computed via flex layout, not declared
    // explicitly. CSS percentage heights (`h-full` =
    // `height: 100%`) don't reliably resolve against a
    // flex-computed parent height; without an explicit height
    // ancestor, the % collapses to `auto`/content-size. Result:
    // this div sized to its content (~236px) and sat at the top
    // of the 377px cream container, with `justify-evenly`
    // having no slack to distribute. Swapping to `flex-1`
    // (== `flex: 1 1 0%`) is the codebase's canonical chain:
    // it's a flex-layout instruction, not a percentage, so it
    // grows to fill the parent's main axis regardless of
    // percentage-resolution rules. Same pattern the form-card,
    // MonthCalendar wrapper, and oh-slot-list itself use.
    //
    // `py-` intentionally omitted: outer vertical padding
    // would compound on top of justify-evenly's first/last
    // gaps, making edge space visibly larger than the inter-
    // group gap. Letting justify-evenly own ALL vertical
    // distribution keeps every gap mathematically equal.
    // Horizontal `px-5 sm:px-6` stays — not on the distribution
    // axis, owns the cream-edge inset for content readability.
    <div className="flex min-h-0 flex-1 flex-col justify-between p-5 sm:p-6">
      {/* Top group — host card + meta strip */}
      <div className="flex flex-col gap-6">
        {/* Host card — replaces the page-variant's CHECK badge as the
          primary visual anchor. The chrome-row title already
          confirms "Booked on …", so the body's job is to ground the
          meeting in a face + handle, not re-confirm the booking
          state. Avatar 48 (down from 40+sm:48 in the page variant)
          keeps the row dense; eyebrow/name/handle stack on the right. */}
        {/* B.PT272 — host card scales uniformly with container width
            via `@container` + `cqi` units (CSS container query length
            unit, 1cqi = 1% of container's inline size — see MDN
            `developer.mozilla.org/.../length#container_query_length_units`).
            The flex row is marked as a query container; the avatar
            size, gap, and font-sizes all use `clamp(min, Ncqi, max)`
            so they grow proportionally as the cream-content area
            widens. Calibrated at ~376px container width: avatar 48
            → 12.77cqi, gap 14 → 3.7cqi, name 17px → 4.5cqi, eyebrow
            10px → 2.66cqi. `clamp()` bounds keep values readable on
            tiny viewports and prevent runaway growth on huge ones.
            Truncate on the name + handle text already handles the
            "wall touch" boundary — long names ellipsis-clip when
            content reaches the right edge. Same primitive the
            codebase's `oh-drawer-weekdays-cell` uses for cqi-driven
            scaling (see `globals.css:2629`). */}
        <div
          className="@container flex items-center bg-amber-200"
          style={{ gap: "clamp(10px, 3.7cqi, 22px)" }}
        >
          {/* B.PT270 / B.PT272 — shared `<HandleHostAvatar>` so the
              receipt-modal and `/h/[handle]` landing/modal identity
              row pull from one source of truth. The size prop now
              accepts a CSS string so the receipt can scale with
              container queries (`clamp(40px, 12.77cqi, 88px)`)
              while host-profile keeps its fixed Figma-spec 55px. */}
          <HandleHostAvatar
            src={booking.host.image}
            alt={hostName}
            initials={toInitials(hostName)}
            size="clamp(40px, 12.77cqi, 88px)"
          />
          <div className="min-w-0 flex-1">
            <p
              className="oh-eyebrow opacity-55"
              style={{ fontSize: "clamp(9px, 2.66cqi, 13px)" }}
            >
              {t("withLabel")}
            </p>
            <p
              className="mt-0.5 truncate font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(15px, 4.5cqi, 26px)" }}
            >
              {hostName}
            </p>
            {booking.host.handle ? (
              <p
                className="mt-0.5 truncate oh-eyebrow opacity-55"
                style={{ fontSize: "clamp(9px, 2.66cqi, 13px)" }}
              >
                /h/{booking.host.handle}
              </p>
            ) : null}
          </div>
        </div>

        {/* Meta strip — duration + tz. Two columns with mono
          numerics on the right; same legend/value pattern the
          dashboard's hub pages use. The hairline border-y from the
          first pass was removed (B.PT266) — separators between the
          host card and the action stack created an extra visual
          layer that wasn't pulling its weight. Spacing alone (the
          parent's gap-6) carries the rhythm. */}
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

      {/* Bottom group — primary action + footer row. Pinned to the
          bottom of the cream by the parent's `justify-between`. */}
      <div className="flex flex-col gap-4">
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
