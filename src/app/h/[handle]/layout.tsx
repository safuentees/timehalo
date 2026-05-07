import type { ReactNode } from "react";
import { VisitorDebugOverlay } from "./_components/visitor-debug-overlay";
import { HostRouteMotionShell } from "./components/host-route-motion-shell";

export default async function HostLayout({
  children,
  receipt,
}: Readonly<{ children: ReactNode; receipt: ReactNode }>) {
  return (
    <div className="oh-root">
      <VisitorDebugOverlay>
        <HostRouteMotionShell receipt={receipt}>{children}</HostRouteMotionShell>
      </VisitorDebugOverlay>
    </div>
  );
}
