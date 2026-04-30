import type { ReactNode } from "react";

export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="oh-root oh-profile-shell">{children}</div>;
}
