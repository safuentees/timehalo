"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarIcon } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { buttonVariants } from "@/components/ui/button";
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
// Reschedule confirm is a Base UI `<Popover>` (B.PT305) — minimal
// inline confirm anchored to the trigger. Mid-stakes prompt that
// already lives in a modal doesn't need a second full-screen
// dialog stacked on top.

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
        {/* B.PT272 / B.PT273 — host card scales uniformly with
            container width via `@container` + `cqi` units (1cqi =
            1% of container's inline size, MDN
            `developer.mozilla.org/.../length#container_query_length_units`).
            **B.PT273 recalibration**: the original B.PT272
            multipliers were too conservative — picked so that at
            the BASE container width (~376px) the cqi value equaled
            the base size, which meant zero visible change at that
            same container. The receipt card is bounded by
            `max-w-[450px]`, so the container's actual range is
            narrow (~228px on small mobile to ~380px on desktop).
            Multipliers must be aggressive enough that ranging
            across THAT range produces visible movement.
            Recalibrated targets across container 228 → 380:
              Avatar 48 → 80px  (21cqi → clamp 48px floor, 88px ceiling)
              Gap    14 → 21px  (5.5cqi → clamp 14px floor, 24px ceiling)
              Name   17 → 30px  (8cqi  → clamp 17px floor, 32px ceiling)
              Eyebrow 10 → 13px (3.5cqi → clamp 10px floor, 14px ceiling)
            Floors floor the value on the smallest viewports so
            text stays readable; ceilings cap growth on huge
            containers (irrelevant in practice since the card caps
            at 450). Truncate on the name + handle text already
            handles the "wall touch" boundary — long names
            ellipsis-clip when content reaches the right edge. */}
        <div
          className="@container flex items-center"
          style={{ gap: "clamp(14px, 5.5cqi, 24px)" }}
        >
          {/* B.PT270 / B.PT272 / B.PT273 — shared `<HandleHostAvatar>`
              so the receipt-modal and `/h/[handle]` landing/modal
              identity row pull from one source of truth. The size
              prop now accepts a CSS string so the receipt can scale
              with container queries (`clamp(48px, 21cqi, 88px)`)
              while host-profile keeps its fixed Figma-spec 55px. */}
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
              // B.PT305 — Reschedule confirm migrated from
              // `<ConfirmDialog>` to a Base UI `<Popover>` so the
              // mid-stakes prompt sits inline next to the trigger
              // instead of taking over the full screen. The receipt
              // already lives in a modal; layering a second modal
              // on top of the first read heavy. Popover keeps the
              // confirm contextual + minimal — title, one-line
              // description, two buttons — and dismisses on outside
              // click or Escape automatically.
              //
              // `Popover.Close` handles dismissal for both Cancel
              // and Confirm. The Confirm button additionally fires
              // the navigation; the page unmounts before the close
              // animation finishes, which is fine.
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
                    <Popover.Popup className="flex w-[280px] flex-col gap-3 rounded-(--oh-r-sm) bg-[color:var(--oh-paper)] p-4 shadow-[var(--oh-shadow-resting)]">
                      <div className="flex flex-col gap-1">
                        <p className="text-[14px] font-bold leading-tight tracking-tight">
                          {t("rescheduleConfirmTitle")}
                        </p>
                        <p className="text-[12px] leading-[1.45] opacity-65">
                          {t("rescheduleConfirmDescription")}
                        </p>
                      </div>
                      <div className="flex items-center justify-end gap-2 font-[family-name:var(--oh-mono)] text-[10px] font-extrabold uppercase tracking-[2px]">
                        <Popover.Close className="rounded-(--oh-r-xs) px-2 py-1 opacity-55 transition-opacity hover:opacity-100">
                          {t("rescheduleConfirmCancel")}
                        </Popover.Close>
                        <Popover.Close
                          onClick={() => {
                            router.push(
                              `/h/${booking.host.handle}?reschedule=${booking.publicUid}`,
                            );
                          }}
                          className="rounded-(--oh-r-xs) bg-[color:var(--oh-ink)] px-2 py-1 text-[color:var(--oh-paper)] transition-opacity hover:opacity-90"
                        >
                          {t("rescheduleConfirmCta")}
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
