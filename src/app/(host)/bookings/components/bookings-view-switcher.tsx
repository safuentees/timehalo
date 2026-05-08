"use client";

import { OhPillSwitcher } from "@/components/oh/oh-pill-switcher";

// Bookings view-mode switcher (B.PT134 → B.PT286).
//
// Segmented control with four modes — Day / Week / Month / List — that
// drive HOW the bookings page renders. Orthogonal to the existing
// upcoming/past tab bar (`?tab=`) which decides WHICH bookings are
// shown.
//
// B.PT286 — refactored from the bespoke GSAP underline into a
// `<OhPillSwitcher>` (white-pill-on-paper-track aesthetic, slid via
// motion's `layoutId`). One canonical primitive used for every
// segmented control in the app.

export type ViewMode = "day" | "week" | "month" | "list";

// Month grid is desktop-only — at <md (~768px) the 7-column layout
// gives each cell ~57px wide; chips can't fit and "+N MORE" overflow
// dominates every cell (per the comment in `bookings-list.tsx`'s
// month branch). Linear / Notion drop their grid views the same way
// at narrow widths. Cal.com's bookings page is list-only on every
// viewport, so we're aligning closer to the dub/Linear pattern of
// "drop the option that doesn't work" rather than rendering month
// as a list-fallback in the same surface as the dedicated List view.
// CSS-driven hide via `hiddenAtBelow` keeps SSR markup stable; the
// chip is `display: none` below md without any client-side filter.
const OPTIONS: {
  value: ViewMode;
  label: string;
  hiddenAtBelow?: "md";
}[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month", hiddenAtBelow: "md" },
  { value: "list", label: "List" },
];

export function BookingsViewSwitcher({
  value,
  onValueChange,
  ariaLabel = "View mode",
}: {
  value: ViewMode;
  onValueChange: (next: ViewMode) => void;
  ariaLabel?: string;
}) {
  return (
    <OhPillSwitcher
      options={OPTIONS}
      value={value}
      onChange={onValueChange}
      ariaLabel={ariaLabel}
    />
  );
}
