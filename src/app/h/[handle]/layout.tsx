import type { ReactNode } from "react";
import { VisitorDebugOverlay } from "./_components/visitor-debug-overlay";

export default async function HostLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="oh-root">
      <VisitorDebugOverlay>{children}</VisitorDebugOverlay>
    </div>
  );
}
