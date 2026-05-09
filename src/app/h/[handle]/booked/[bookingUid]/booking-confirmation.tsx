"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { OhVisitorShell } from "@/components/oh/oh-visitor-shell";
import {
  HANDLE_CARD_RADIUS_STYLE,
  HANDLE_SLOT_LIST_RADIUS_STYLE,
} from "../../components/handle-morph-parts";
import { HandleMorphCard } from "../../components/handle-morph-card";
import { BookingReceiptContent } from "./booking-receipt-content";

// Un-intercepted booking-receipt page — `/h/<handle>/booked/<uid>`.
// Mirrors the intercepted-modal route's visual exactly so a visitor
// landing on this URL directly (email link, shared URL, hard reload)
// sees the same receipt chrome they would have seen if they reached
// it through the in-app flow. Per user feedback (2026-05-09): "must
// match the same exact styling of the intercepted route but just
// remove inside the modal the chevron and the x button."
//
// What's kept identical to `BookingReceiptModal`:
//   - `HandleMorphCard` outer chrome (depth shadow + paper bg via the
//     `oh-handle-morph-card` CSS class, theme-aware)
//   - Chrome row layout — 3-column grid `[1.75rem_1fr_1.75rem]` so
//     the centered title sits at the exact same visual midpoint as
//     the modal (empty placeholders preserve the rhythm; no X / no
//     chevron renders into them)
//   - Cream content container with the same inset shadow + radius
//   - `BookingReceiptContent` body (host card + meta strip + primary
//     CTA + share/reschedule footer) — already shared, no changes
//
// What's intentionally different from the modal:
//   - No `FocusOn` wrapper / no Escape handler / no click-outside
//     dismiss — there's nothing to dismiss on a standalone page
//   - No `layoutId` on `HandleMorphCard` — no shared-element morph
//     because there's no source rect for motion to FLIP from
//   - No close button + no chevron in the chrome row (the user's
//     explicit ask)
//   - Wrapped in a full-viewport `bg-oh-bg-muted` flex-center
//     container instead of `OhVisitorShell`. The shell's inner-panel
//     would render as a SECOND rounded paper layer behind the morph
//     card; mirroring the modal means the morph card IS the visible
//     surface, sitting on the muted-paper outer chrome alone.

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
  const format = useFormatter();

  // Same chrome-row title as the modal — date + time as the primary
  // confirmation signal. ICU args so locale rules pick the right
  // preposition + ordering. Source-of-truth lives here for both
  // routes (modal reads its own copy via the same i18n key).
  const startDate = new Date(booking.slotStart);
  const titleDate = format.dateTime(startDate, {
    month: "short",
    day: "numeric",
  });
  const titleTime = format.dateTime(startDate, {
    hour: "numeric",
    minute: "2-digit",
  });
  const titleText = t("badgeBookedOn", {
    date: titleDate,
    time: titleTime,
  });

  return (
    // Wrap in `OhVisitorShell` so the standalone page picks up the
    // same brand chrome the visitor surface (`/h/[handle]`) ships:
    // muted-paper outer, rounded paper inner panel (with
    // `oh-visitor-panel`'s depth shadow), sticky header. The morph
    // card is the `<main>` content; the shell centers it. This keeps
    // the inner-panel + morph-card nesting identical to the
    // intercepted-modal context, where the modal sits over the same
    // visitor-surface inner panel underneath.
    //
    // Header carries a single small clickable link back to the
    // host's profile (`/h/<handle>`) so a visitor who landed here
    // via an email / shared link can navigate to the host's main
    // page. The link uses the same `oh-legend` mono-caps style the
    // visitor profile's header uses for the handle eyebrow, so it
    // reads as part of the same chrome vocabulary across routes.
    <OhVisitorShell
      header={
        booking.host.handle ? (
          <Link
            href={`/h/${booking.host.handle}`}
            className="oh-focus-ring oh-legend rounded-(--oh-r-xs) opacity-65 transition-opacity hover:opacity-100"
          >
            /h/{booking.host.handle}
          </Link>
        ) : null
      }
    >
      <HandleMorphCard
        // No `layoutId` — standalone page, nothing to morph from.
        // `HandleMorphCard` still applies `oh-handle-morph-card` for
        // chrome parity (drop shadow + 1px tonal rim from
        // `--oh-handle-card-shadow`, theme-aware) and the radius
        // longhands via `HANDLE_CARD_RADIUS_STYLE`.
        style={{
          ...HANDLE_CARD_RADIUS_STYLE,
        }}
        // Same dimensional formula as the modal — square card capped
        // at 450, collapses on narrow viewports via the `min(viewport
        // - padding, 450)` expression. `p-[15px]` matches the modal's
        // outer padding so the inner cream container has the same
        // bounds.
        className="min-h-[min(calc(100dvw-32px),450px)] w-[min(calc(100dvw-32px),450px)] max-w-none overflow-hidden p-[15px] sm:min-h-[min(calc(100dvw-64px),450px)] sm:w-[min(calc(100dvw-64px),450px)]"
      >
        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-[15px]">
          {/* Chrome row — title only. The modal renders a 3-column
              grid `[1.75rem_1fr_1.75rem]` with an X button on the
              right; we keep the same grid template (empty spans on
              both sides) so the title sits at the exact same visual
              center as the modal. The empty `aria-hidden` spans
              preserve the chrome's rhythm without rendering any
              affordance. */}
          <div className="relative z-30 grid h-7 shrink-0 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-2">
            <span aria-hidden />
            <span className="justify-self-center truncate font-[family-name:var(--font-grotesk)] text-sm font-semibold leading-none tracking-tight text-[color:var(--oh-ink)]">
              {titleText}
            </span>
            <span aria-hidden />
          </div>
          {/* Cream content container — same inset shadow + radius +
              theme-aware bg as the modal's slot-list. No `motion.div`
              wrapper because there's no shared-layout transition on
              this route. */}
          <div
            style={{
              ...HANDLE_SLOT_LIST_RADIUS_STYLE,
              boxShadow: "inset 0 0 4px rgba(0,0,0,0.25)",
            }}
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F5EFDF] dark:bg-[#272727]"
          >
            <BookingReceiptContent booking={booking} />
          </div>
        </div>
      </HandleMorphCard>
    </OhVisitorShell>
  );
}
