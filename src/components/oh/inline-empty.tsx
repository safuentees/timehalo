import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small "no items yet" placeholder — single-line recessed box used
// inside a settings sub-section (workflows-empty, api-keys-empty,
// calendar-empty, etc.). Sibling to <OhEmpty>, which is the
// page-level empty state with an icon + title + action. This one is
// the inline variant: just a message, no chrome.
//
// Pattern: `oh-empty-surface` — frame-tinted bg + inset shadow that
// reads as a recessed scoop in the panel paper, not as a framed CTA.
// Replaces the previous 1.5px dotted border treatment (audit on
// 2026-05-09): the dotted outline read as a CTA against the otherwise
// borderless panel chrome and competed visually with primary actions.
// The well treatment uses the same depth vocabulary the rest of the
// surface speaks (resting/hover/popup/panel shadows) so empty states
// fit the language instead of declaring themselves as outliers.
//
// Use children as the message so callers can pass plain text or
// composed nodes (e.g. with a "Connect Google" link inline).

export function OhInlineEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "oh-empty-surface rounded-(--oh-r-sm) px-4 py-3.5 text-[13px] opacity-65",
        className,
      )}
    >
      {children}
    </p>
  );
}
