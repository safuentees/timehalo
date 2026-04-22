import type { ReactNode } from "react";

export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <div className="bru-root bru-profile-shell">{children}</div>;
}
