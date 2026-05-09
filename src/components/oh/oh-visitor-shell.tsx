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
  /** Optional root-level overrides for one-off Figma-exact visitor surfaces. */
  className?: string;
};

export function OhVisitorShell({ children, header, footer, className }: Props) {
  return (
    // B.PT216 — Two-layer shell, viewport-fit (no scroll).
    // Outer: `h-dvh overflow-hidden` pins the box to dynamic viewport
    // height (mobile-safe — `dvh` adapts to address bar collapse,
    // unlike `vh`). Per Tailwind docs (tailwindcss.com/docs/height
    // and the v3.4 dynamic-viewport blog), `h-dvh` is the canonical
    // unit for this. `overflow-hidden` clips so the page never
    // scrolls past the viewport in either axis.
    // Inner: `flex flex-1 flex-col min-h-0 overflow-hidden`. The
    // critical `min-h-0` overrides flex's default
    // `min-height: auto` — without it, the inner flex column
    // wouldn't shrink below its content's intrinsic height and the
    // outer `overflow-hidden` couldn't contain it.
    // Color: `bg-oh-bg-muted` (= `--oh-twdivider-bg`, 8% ink in
    // oklab over paper). Subtler than `--oh-frame` (sisal at 12%).
    // Sisal looked too dark per user feedback; this is the
    // "slightly darker paper" the codebase exposes via Tailwind
    // shorthand.
    // Inner radius `rounded-[25px]` matches landing card
    // `HANDLE_CARD_RADIUS = 25` for cross-route corner vocabulary.
    // B.PT217 — `oh-visitor-shell` class hooks the global override
    // in `globals.css` (`:where(html, body):has(.oh-visitor-shell)
    // { overflow: hidden; scrollbar-gutter: auto }`) which kills
    // the scrollbar gutter the global `html { scrollbar-gutter:
    // stable }` rule otherwise reserves on the right edge of the
    // viewport. Visible as a thin sliver of html bg without this.
    // Pin `--oh-paper` + `--oh-ink` per theme. Originally (B.PT219)
    // the visitor surface locked LIGHT-only — the entire derived
    // token system (`--oh-frame`, `--oh-content-muted`, `--oh-tint`,
    // etc.) recomputes via cascade once the base pair is set. The
    // dark-mode pair was added on 2026-05-09 — the public visitor
    // surface now honors the html `.dark` class same as the
    // dashboard, so a viewer hitting `/h/<handle>` from a dark-
    // mode device gets the dark Athens-Slate palette instead of
    // the cream surface flashing white. Light values are unchanged
    // (`#0a0a0a` ink / `#eee7d5` paper); dark values mirror the
    // global `.dark` block (`#ede4cf` ink / `#1a1a1a` paper).
    // See Tailwind docs `[--var:value]` arbitrary properties + CSS
    // custom properties resolving at use-site.
    <div className="oh-visitor-shell flex h-dvh flex-col overflow-hidden bg-oh-bg-muted p-[15px] [--oh-ink:#0a0a0a] [--oh-paper:#eee7d5] dark:[--oh-ink:#ede4cf] dark:[--oh-paper:#1a1a1a]">
      {/* B.PT218 — Inner panel switches from flex column to
          `relative` so children can absolute-position. Per Tailwind
          docs (tailwindcss.com/docs/position): "absolute … neighboring
          elements behave as if the absolutely positioned element
          doesn't exist." Header pinned top, footer pinned bottom,
          `<main>` absolute-fills the panel and centers its content
          via `flex items-center justify-center`. Result: <main> is
          centered relative to the ENTIRE panel, not centered between
          header and footer (which is what flex column produced
          previously). */}
      <div
        className={[
          // `oh-visitor-panel` carries the depth chrome (drop + 1px
          // tonal rim) via a CSS class — NOT inline style — so
          // motion's `layoutId` projection on descendant elements
          // (HandleMorphCard, identity phantoms) can't accidentally
          // strip it during the morph animation. Inline styles are
          // the layer motion writes to per-frame; class-applied
          // declarations are owned by the cascade and stay
          // continuous through the FLIP.
          "oh-visitor-panel relative min-h-0 flex-1 overflow-hidden rounded-[25px] bg-oh-bg text-oh-content",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {header ? (
          <div className="absolute inset-x-0 top-0 z-10">
            <OhVisitorHeader>{header}</OhVisitorHeader>
          </div>
        ) : null}
        <main className="absolute inset-0 flex items-center justify-center overflow-hidden">
          {children}
        </main>
        {footer ? (
          <div className="absolute inset-x-0 bottom-0 z-10">
            <OhVisitorFooter>{footer}</OhVisitorFooter>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Sticky brand + contextual-ref row. Hairline `border-b` + backdrop
// blur. Caller passes the children — typically:
//   <Link href="/" aria-label={...}>OH</Link>
//   <Link href={`/h/${handle}`}>/h/{handle}</Link>
function OhVisitorHeader({ children }: { children: ReactNode }) {
  return (
    // B.PT220 — `border-b-[1.5px] border-oh-line` removed (was the
    // hairline separator between header and main content). User
    // wants the header to read as part of the panel rather than a
    // chrome-divided strip. Restore later if a visual divider is
    // needed against scroll content.
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-oh-bg/85 px-5 py-4 backdrop-blur sm:px-8 sm:py-5 lg:px-12">
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
