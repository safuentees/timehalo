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

type Props = {
  children: ReactNode;
};

export function BrutalistPageShell({ children }: Props) {
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-8 sm:px-6 sm:py-10">
      {children}
    </div>
  );
}
