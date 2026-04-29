import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Section primitive — the host-side booking detail page (and any
// future detail surfaces) renders a stack of these. Pattern reference:
// cal.com's <Section> in BookingDetailsSheet.tsx (modules/bookings/
// components, ~line 1087): every semantic block is a label + content
// wrapper with consistent vertical rhythm.
//
// Brutalist mapping:
//   - Title: mono uppercase, 10/2.5px tracking, opacity-55 (same as
//     `bru-eyebrow` / `.bru-legend` from globals.css). Functions as
//     section eyebrow.
//   - Content: full text contrast, regular weight.
//   - Vertical rhythm: 12px between title and content; sections
//     compose with `gap-8` (32px) on the parent flex column for the
//     "settings rhythm" we already use everywhere.
//
// `dim` skips the section when the value would render empty — the
// detail page conditionally surfaces sections (no Question section
// when there's no question), but for the rare zero-state case we
// don't want the section to disappear entirely (e.g. "no audit
// history yet" wants to show the heading + an inline empty). Caller
// passes the empty placeholder as children.

export function BrutalistSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <p className="bru-eyebrow">{title}</p>
      <div>{children}</div>
    </section>
  );
}
