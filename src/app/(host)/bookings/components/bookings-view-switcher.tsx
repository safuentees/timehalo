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

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
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
