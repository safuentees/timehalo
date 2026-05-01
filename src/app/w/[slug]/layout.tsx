import type { ReactNode } from "react";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="oh-root">{children}</div>;
}
