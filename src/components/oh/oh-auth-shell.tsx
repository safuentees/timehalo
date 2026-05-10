import type { ReactNode } from "react";

// Auth surface shell — `/login`, `/register`, future `/forgot-password`.
// Contract from `docs/layout-consistency-2026-05.md` §3.1:
//
//   <div className="flex min-h-dvh flex-col bg-oh-frame text-oh-ink">
//     <OhAuthHeader />                  optional brand mark
//     <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6">
//       <div className="w-full max-w-[420px]">{children}</div>
//     </main>
//     <OhAuthFooter />                  optional legal links
//   </div>
//
// Why this shape:
//   • `flex min-h-dvh flex-col` — viewport-fill outer + flex column so
//     `<main>` can grow. `min-h-dvh` (dynamic vh) NOT `min-h-screen` —
//     iOS Safari shrinks the chrome on scroll and dvh accounts for it.
//   • `<main className="flex-1 ... items-center justify-center">` —
//     centers the form vertically when content fits (Apple HIG "window
//     content fills the window naturally"); when content overflows, the
//     overflow direction wins and the form top-aligns with scroll. No
//     orphan whitespace below short forms anymore.
//   • Width vocabulary: 420px (`oh-w-narrow` per the doc). Single
//     source of truth lives here so consumers don't reach for inline
//     `max-w-[420px]` magic numbers.
//   • Brand chrome lives in `<OhAuthHeader>` instead of inline at the
//     top of every auth page. NOT sticky (pages are short, sticky has
//     no purpose here per the §3.5 decision matrix).
//   • `<OhAuthFooter>` for legal/links. Optional (most pages won't pass
//     it). Centered + muted typography; no border.

type Props = {
  children: ReactNode;
  /** Optional brand mark / wordmark above the form. */
  header?: ReactNode;
  /** Optional legal / copyright links below the form. */
  footer?: ReactNode;
};

export function OhAuthShell({ children, header, footer }: Props) {
  // B.PT284 follow-up — exact port of `OhVisitorShell` (the
  // `/h/[handle]` route's visitor shell). Three layers, no extras:
  //
  //   Layer 1 (page) — `bg-oh-bg-muted` filling the viewport, with
  //     15px padding on mobile / 24px on sm+. Same outer breathing
  //     the visitor uses (`p-[15px]` in `oh-visitor-shell.tsx:87`).
  //   Layer 2 (rounded panel) — `bg-oh-bg` paper + `rounded-[25px]`
  //     fills the padded space. Same radius the visitor's inner
  //     panel uses (`HANDLE_CARD_RADIUS = 25`). This is the "rounded
  //     container around the whole page that's inset-0" — the panel
  //     borders the entire viewport with concentric rounded corners.
  //   Layer 3 (form column) — centered, `max-w-[420px]`, no extra
  //     card. Form sits directly on the paper panel; inputs (paper
  //     + inset shadow) read as recessed INTO the panel, same as the
  //     visitor's booking form on /h/[handle].
  //
  // Auth surface follows the user's theme preference (light / dark /
  // system) — unlike the visitor shell at `/h/[handle]` (B.PT219) which
  // pins to the brand light tokens regardless of host preference,
  // these are the host's OWN auth pages and should respect the OS /
  // user-selected mode. The dark-mode `--oh-paper` / `--oh-ink` flip
  // happens automatically via the `.dark` rule on `:root`.
  return (
    <div className="flex min-h-dvh flex-col bg-oh-bg-muted p-[15px] text-[color:var(--oh-ink)] sm:p-[24px]">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[25px] bg-oh-bg">
        {header ? <OhAuthHeader>{header}</OhAuthHeader> : null}
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
          <div className="w-full max-w-[420px]">{children}</div>
        </main>
        {footer ? <OhAuthFooter>{footer}</OhAuthFooter> : null}
      </div>
    </div>
  );
}

// Top brand row. Borderless on auth surfaces — the form below carries
// its own visual weight via the bordered input edges. A border here
// would over-frame a short page.
function OhAuthHeader({ children }: { children: ReactNode }) {
  return (
    <header className="flex items-center justify-center px-5 pt-6 sm:px-6 sm:pt-8">
      {children}
    </header>
  );
}

// Bottom legal / link row. Muted text, centered, no border. Same
// rationale as the header — borderless on the short auth page.
function OhAuthFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="oh-eyebrow flex items-center justify-center gap-3 px-5 pb-6 opacity-55 sm:px-6 sm:pb-8">
      {children}
    </footer>
  );
}
