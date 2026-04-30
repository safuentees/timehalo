import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small "no items yet" placeholder — single-line dashed box used inside
// a settings sub-section (workflows-empty, api-keys-empty, calendar-
// empty, etc.). Sibling to <OhEmpty>, which is the page-level
// empty state with an icon + title + action. This one is the inline
// variant: just a message, no chrome.
//
// Pattern: 1.5px dotted placeholder border (--oh-line-placeholder, ~12%
// ink), rounded-(--oh-r-xs), p-4, 13px opacity-55 text. Audit on
// 2026-04-27 found the same six-class string repeated in three places
// with margin drift — single source of truth here. Dotted (not dashed)
// + soft placeholder color so the frame reads as the page bg, not as a
// framed CTA outline.
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
        "rounded-(--oh-r-xs) border-[1.5px] border-dotted border-[var(--oh-line-placeholder)] p-4 text-[13px] opacity-55",
        className,
      )}
    >
      {children}
    </p>
  );
}
