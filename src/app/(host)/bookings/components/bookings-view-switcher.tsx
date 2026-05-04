"use client";

import { forwardRef, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Bookings view-mode switcher (B.PT134).
//
// Segmented control with four modes — DAY / WEEK / MONTH / LIST — that
// drive HOW the bookings page renders. Orthogonal to the existing
// upcoming/past tab bar (`?tab=`) which decides WHICH bookings are shown:
// the calendar modes (Day/Week/Month) span a date range that always
// includes both upcoming and past slots, and only the LIST mode keeps the
// upcoming/past split.
//
// Lifted shape from `BookingsTabBar` in `bookings-list.tsx`:
//   - base-ui `Tabs` / `TabsList` / `TabsTrigger` for free a11y +
//     keyboard nav (arrow keys, Home/End)
//   - `variant="line"` kills the primitive's default bg-muted fill +
//     rounded pill, and `after:hidden` on each trigger kills the
//     line-variant's per-trigger underline pseudo — we render an
//     explicit child `<span data-view-underline>` so the FLIP animation
//     can target a real element, not a pseudo-element.
//   - mounted underline is positioned via pure CSS
//     (`absolute -bottom-[5px] left-0 right-0 h-0.5 bg-oh-ink`) so SSR
//     paints the bar at its final position on first frame — no JS
//     measurement, no flash-of-no-bar. GSAP `from()` only runs on
//     subsequent transitions.
//   - controlled component: parent owns `value` + `onValueChange`. The
//     /bookings page wires this to the `?view=` URL param in B.PT135+.
//
// FLIP animation: when `value` changes, the OLD underline unmounts
// (its parent trigger lost `isActive`) and the NEW underline mounts at
// its CSS-final position. We capture the old trigger's
// `getBoundingClientRect()` first, then `gsap.from()` temporarily
// transforms the new underline back to the old position + size, then
// animates back to identity — net effect is the underline appears to
// slide between triggers, but the resting state is always pure CSS.
//
// Hardcoded English labels: this component will be wired into the host
// page at B.PT135 with i18n. For now (playground only) the labels are
// hardcoded for visual consistency between locales — Spanish DÍA /
// SEMANA / MES / LISTA have varying widths that break the segmented-
// control symmetry; the right answer is icon-or-tooltip in production,
// surfaced as an open question in B.PT135.

export type ViewMode = "day" | "week" | "month" | "list";

const LABELS: Record<ViewMode, string> = {
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  list: "LIST",
};

export function BookingsViewSwitcher({
  value,
  onValueChange,
  ariaLabel = "View mode",
}: {
  value: ViewMode;
  onValueChange: (next: ViewMode) => void;
  ariaLabel?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLButtonElement>(null);
  const weekRef = useRef<HTMLButtonElement>(null);
  const monthRef = useRef<HTMLButtonElement>(null);
  const listBtnRef = useRef<HTMLButtonElement>(null);
  // Initialize with the current view so the first useGSAP run sees
  // prev === current and returns early — no animation on mount, the
  // SSR-rendered underline is already at the correct position.
  const prevValueRef = useRef<ViewMode>(value);

  const refFor = (mode: ViewMode): HTMLButtonElement | null => {
    switch (mode) {
      case "day":
        return dayRef.current;
      case "week":
        return weekRef.current;
      case "month":
        return monthRef.current;
      case "list":
        return listBtnRef.current;
    }
  };

  useGSAP(
    () => {
      const prev = prevValueRef.current;
      if (prev === value) return;
      prevValueRef.current = value;

      const fromEl = refFor(prev);
      const toEl = refFor(value);
      if (!fromEl || !toEl) return;

      const newUnderline = toEl.querySelector<HTMLSpanElement>(
        "[data-view-underline]",
      );
      if (!newUnderline) return;

      // Reduced-motion: snap, no animation. The global blanket from
      // B.PT119 collapses transitions to 0.01ms, but GSAP timelines
      // bypass CSS transitions — explicit guard here.
      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // FLIP — transform-only, GPU-friendly. transformOrigin "left"
      // grows scaleX from the left edge instead of center, matching
      // BookingsTabBar's curve.
      gsap.from(newUnderline, {
        x: fromRect.left - toRect.left,
        scaleX: fromRect.width / toRect.width,
        transformOrigin: "left center",
        duration: 0.35,
        ease: "power3.inOut",
        overwrite: true,
      });
    },
    { scope: listRef, dependencies: [value] },
  );

  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as ViewMode)}>
      <TabsList
        ref={listRef}
        aria-label={ariaLabel}
        variant="line"
        className="h-auto w-fit gap-3 p-0"
      >
        <ViewTrigger
          ref={dayRef}
          mode="day"
          isActive={value === "day"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={weekRef}
          mode="week"
          isActive={value === "week"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={monthRef}
          mode="month"
          isActive={value === "month"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={listBtnRef}
          mode="list"
          isActive={value === "list"}
        />
      </TabsList>
    </Tabs>
  );
}

const ViewTrigger = forwardRef<
  HTMLButtonElement,
  { mode: ViewMode; isActive: boolean }
>(function ViewTrigger({ mode, isActive }, ref) {
  return (
    <TabsTrigger
      ref={ref}
      value={mode}
      aria-label={`Switch to ${LABELS[mode]} view`}
      className={cn(
        // Strip the line-variant's default chrome — pseudo-underline,
        // padding, hover bg — so the only visible affordance is the
        // mono-caps label + (when active) the FLIP underline. Layout:
        // text-only trigger, py-1 just to give the focus ring breathing
        // room around the cap-height of the label.
        "group/view inline-flex items-center h-auto rounded-none border-0 bg-transparent p-0 py-1",
        "shadow-none data-active:shadow-none after:hidden",
        // oh-eyebrow = mono 10px font-extrabold tracking-2 uppercase
        // opacity-55. Active state overrides opacity to 100 (fully
        // legible). Hover lifts opacity for inactive triggers — the
        // dashboard's "tertiary text affordance" pattern (per
        // dashboard-forms.md hover+color contracts).
        "oh-eyebrow",
        isActive
          ? "opacity-100"
          : "opacity-55 hover:opacity-100 transition-opacity duration-200",
      )}
    >
      <span>{LABELS[mode]}</span>
      {isActive ? (
        <span
          data-view-underline
          aria-hidden
          className="pointer-events-none absolute -bottom-[5px] left-0 right-0 h-0.5 bg-[color:var(--oh-ink)]"
        />
      ) : null}
    </TabsTrigger>
  );
});

function ViewSeparator() {
  // Hairline vertical rule — 1px, 22% ink. Drawn at the cap-height of
  // the mono labels so it reads as a visual separator between equal
  // text affordances. aria-hidden because it's decorative; tablist
  // keyboard nav skips it.
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-px self-center bg-oh-line"
    />
  );
}
