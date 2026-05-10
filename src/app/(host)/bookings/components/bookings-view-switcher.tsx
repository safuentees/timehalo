"use client";

import { OhPillSwitcher } from "@/components/oh/oh-pill-switcher";

export type ViewMode = "day" | "week" | "month" | "list";

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
      layoutIdKey="bookings-view-switcher"
    />
  );
}
