import type { ReactNode } from "react";

/**
 * Public workspace shell. Same `oh-root` wrapper the `/h/<handle>` shell
 * uses (B.PT59 unified visitor surface) — hairline borders, sentence-case
 * typography, oh-* token vocabulary. The page itself is unauthenticated;
 * no sidebar/topbar, just a clean page column.
 */
export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="oh-root">{children}</div>;
}
