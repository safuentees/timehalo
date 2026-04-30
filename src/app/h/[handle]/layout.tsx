import type { ReactNode } from "react";

/**
 * Public host profile shell. Scopes the brutalist paper/ink palette + font
 * stack + container-queries to the route, but without the dashboard sidebar
 * — this page is visitor-facing and needs its own minimal chrome.
 */
export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="oh-root oh-profile-shell">{children}</div>;
}
