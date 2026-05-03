import type { ReactNode } from "react";

// Visitor surface shell — `/h/<handle>`, `/h/<handle>/booked/<uid>`,
// `/w/<slug>`, `/w/<slug>/<eventTypeSlug>`, `/w/<slug>/<eventTypeSlug>/
// booked/<uid>`, `/preview/<handle>`. Contract from
// `docs/layout-consistency-2026-05.md` §3.1:
//
//   <div className="flex min-h-dvh flex-col bg-oh-bg text-oh-content">
//     <OhVisitorHeader />               sticky brand + contextual ref
//     <main className="flex-1">{children}</main>
//     <OhVisitorFooter />               optional brand + receipt stamp (sm+)
//   </div>
//
// The reference impl is `booking-confirmation.tsx` (the post-booking
// receipt) — it shipped this exact shape inline pre-B.PT106. B.PT111
// migrates the receipt to consume this primitive instead of re-stating
// the chrome. B.PT110 / B.PT112 wrap the host + team profiles.
//
// Why this shape:
//   • `flex min-h-dvh flex-col` — viewport fill + flex column for
//     `<main className="flex-1">`. Short content (e.g. a host with no
//     bio) fills the column instead of leaving an orphan band of
//     `--oh-bg` below the picker.
//   • `<header className="sticky top-0 z-10 ...">` — stays visible
//     across long booking flows so the visitor keeps brand + handle
//     context while scrolling slot pickers / forms / confirmation.
//     Sticky chrome here makes sense (per §3.5) because the surface
//     has real scroll content; the auth surface skips sticky for the
//     opposite reason (short page, sticky is overkill).
//   • Backdrop blur (`bg-oh-bg/80 backdrop-blur`) so the sticky header
//     reads as a deliberate chrome layer over scrolling content rather
//     than an opaque slab. Browser support is universal in 2026.
//   • `<OhVisitorFooter>` is `hidden sm:flex` — mobile receipts skip
//     the footer; desktop carries brand + receipt-stamp metadata as
//     the "finished bottom edge" the doc calls out.

type Props = {
  children: ReactNode;
  /** Optional sticky header content — typically brand mark left, contextual ref right. */
  header?: ReactNode;
  /** Optional desktop-only footer content — brand left, metadata right. */
  footer?: ReactNode;
};

export function OhVisitorShell({ children, header, footer }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-[color:var(--oh-bg)] text-[color:var(--oh-content)]">
      {header ? <OhVisitorHeader>{header}</OhVisitorHeader> : null}
      <main className="flex-1">{children}</main>
      {footer ? <OhVisitorFooter>{footer}</OhVisitorFooter> : null}
    </div>
  );
}

// Sticky brand + contextual-ref row. Hairline `border-b` + backdrop
// blur. Caller passes the children — typically:
//   <Link href="/" aria-label={...}>OH</Link>
//   <Link href={`/h/${handle}`}>/h/{handle}</Link>
function OhVisitorHeader({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-[1.5px] border-oh-line bg-[color:var(--oh-bg)]/85 px-5 py-4 backdrop-blur sm:px-8 sm:py-5 lg:px-12">
      {children}
    </header>
  );
}

// Desktop-only footer. Hairline `border-t`. Caller passes children —
// typically:
//   <span>Officehours</span>
//   <span className="tabular-nums">Receipt {stamp}</span>
function OhVisitorFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="oh-eyebrow hidden items-center justify-between border-t-[1.5px] border-oh-line px-8 py-5 sm:flex lg:px-12">
      {children}
    </footer>
  );
}
