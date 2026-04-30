import type { ReactNode } from "react";
import { OhProviders } from "@/components/oh/providers";
import { OhDashboardLayout } from "@/components/oh/oh-dashboard-layout";

// Parallel @modal slot (A7). The intercepted route at
// (host)/@modal/(.)bookings/[publicUid] renders a Sheet here when
// the host navigates from /bookings to /bookings/<publicUid>; on
// hard refresh of the same URL it falls through to the full page
// route at (host)/bookings/[publicUid]. Default fallback is
// (host)/@modal/default.tsx — null when no intercepted route
// matches.
export default async function DashboardLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode;
  modal: ReactNode;
}>) {
  return (
    <OhProviders>
      <OhDashboardLayout>{children}</OhDashboardLayout>
      {modal}
    </OhProviders>
  );
}
