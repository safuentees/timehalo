"use client";

import { type ReactElement } from "react";
import { useFormatter } from "next-intl";
import { Popover } from "@base-ui/react/popover";
import { MailIcon } from "lucide-react";

// Hover preview popover for booking rows. Wraps the row's `<Link>`
// trigger so plain hover for ~500ms shows a compact preview
// without requiring a click. Click still opens the detail modal as
// before. Touch devices ignore hover and only respond to click —
// no extra code, Base UI's `useHover` interaction degrades.
//
// Built on top of Base UI's `Popover.Trigger` `openOnHover` props
// (verified via Context7 against `@mui/base-ui` docs at
// `react/components/popover/types.md`):
//
//   - `openOnHover` (default false) — toggles hover-trigger mode.
//   - `delay` (default 300ms) — wait before opening on mouse enter.
//   - `closeDelay` (default 0ms) — wait before closing on leave.
//
// Per WAI-ARIA APG: hover-discovered content must NOT contain
// primary interactive affordances since hover isn't keyboard-
// accessible. The popup is informational only — visitor name,
// slot, question excerpt, mailto. The full detail (cancel /
// reschedule / etc.) lives on the modal that opens on click.
//
// Delay calibration (500ms / 150ms): the 300ms default fires too
// eagerly on incidental cursor movement across a list — converges
// with Linear / GitHub / Notion timing (~400-500ms) and the user's
// "for X amount of seconds" framing. 150ms close-delay grants the
// user grace to move from the row into the popup before it
// dismisses — Floating UI's safe-polygon behavior (baked into
// Base UI's hover handler) keeps the popup open while the cursor
// traverses the diagonal between trigger and popup.
//
// `nativeButton={false}` is required because the rendered trigger
// is a Next.js `<Link>` (anchor), not a `<button>`. Without it,
// Base UI emits a `type="button"` attribute that anchors don't
// recognize.

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
          // z-index: same tier as other anchored popovers in the
          // dashboard (the workspace switcher menu, time picker,
          // duration picker). Above the page content + sidebar
          // chrome but below the dialog stack at z-200.
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
              // Stop propagation so the mailto click doesn't bubble
              // through to the underlying row's onClick (which would
              // both open the modal AND launch the mail client at
              // the same time).
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
