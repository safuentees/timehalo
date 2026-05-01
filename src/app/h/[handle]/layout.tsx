import type { ReactNode } from "react";

/**
 * Public host profile shell. As of B.PT59, the visitor surface adopts
 * the dashboard chrome (hairline borders, sentence-case typography,
 * oh-* token vocabulary) instead of the prior brutalist paper-and-ink
 * look. `oh-root` gives us the same color/font stack the dashboard
 * uses; the page itself is unauthenticated, so no sidebar/topbar
 * structural shell — just a clean page column.
 */
export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="oh-root">{children}</div>;
}
