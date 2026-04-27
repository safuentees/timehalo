import type { ReactNode } from "react";

// Repo-wide page container — same width, padding, and rhythm everywhere
// the host app puts content. Bookings is the canonical reference; this
// lifts those values so /profile, /availability, /settings, and any new
// page can't drift back into "almost matches" territory.
//
// Padding rhythm: py-8 / sm:py-10. Intentionally tighter than the
// "feels-too-much" py-14 it replaces — the page header already has its
// own pb-6 below the rule, so the outer padding doesn't need to carry
// the breathing room.
//
// Density variants:
//   • default (760px)  — content-light pages: Bookings, Availability,
//     Profile. The /h/[handle] hero column lives here too.
//   • tight   (672px)  — dense single-column forms with many stacked
//     sections. Settings is the canonical example: 6 sections + danger
//     zone read as a sprawl at 760px and as a column at 672. Cal.com
//     runs its settings layout at the equivalent of max-w-3xl (768px),
//     we sit one notch tighter because we render single-column rather
//     than label-on-left value-on-right.

type Props = {
  children: ReactNode;
  /** Use the tighter 672px column for settings-style dense pages. */
  tight?: boolean;
};

export function BrutalistPageShell({ children, tight = false }: Props) {
  return (
    <div
      className={[
        "mx-auto w-full px-4 py-8 sm:px-6 sm:py-10",
        tight ? "max-w-2xl" : "max-w-[760px]",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
