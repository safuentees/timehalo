import type { ReactNode } from "react";
import { VisitorDebugOverlay } from "./_components/visitor-debug-overlay";

/**
 * Public host profile shell. As of B.PT59, the visitor surface adopts
 * the dashboard chrome (hairline borders, sentence-case typography,
 * oh-* token vocabulary) instead of the prior brutalist paper-and-ink
 * look. `oh-root` gives us the same color/font stack the dashboard
 * uses; the page itself is unauthenticated, so no sidebar/topbar
 * structural shell — just a clean page column.
 *
 * B.PT164 — wraps `{children}` in `<VisitorDebugOverlay>` so the Leva
 * animation-tweaking panel is available across every page in the
 * `/h/[handle]/*` route group (landing + booked + future). The
 * overlay self-gates to `process.env.NODE_ENV === "development"` AND
 * `?debug=1` so production users never see it.
 */
export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="oh-root">
      <VisitorDebugOverlay>{children}</VisitorDebugOverlay>
    </div>
  );
}
