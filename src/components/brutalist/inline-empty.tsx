import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small "no items yet" placeholder — single-line dashed box used inside
// a settings sub-section (workflows-empty, api-keys-empty, calendar-
// empty, etc.). Sibling to <BrutalistEmpty>, which is the page-level
// empty state with an icon + title + action. This one is the inline
// variant: just a message, no chrome.
//
// Pattern documented in brutalist-ui.md: 1.5px dashed oh-line border,
// rounded-(--oh-r-xs), p-4, 13px opacity-55 text. Audit on 2026-04-27
// found the same six-class string repeated in three places with margin
// drift — single source of truth here.
//
// Use children as the message so callers can pass plain text or
// composed nodes (e.g. with a "Connect Google" link inline).

export function BrutalistInlineEmpty({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-(--oh-r-xs) border-[1.5px] border-dashed border-oh-line p-4 text-[13px] opacity-55",
        className,
      )}
    >
      {children}
    </p>
  );
}
