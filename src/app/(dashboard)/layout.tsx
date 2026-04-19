import type { ReactNode } from "react";
import { BrutalistProviders } from "@/components/brutalist/providers";
import { BrutalistDashboardLayout } from "@/components/brutalist/brutalist-dashboard-layout";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <BrutalistProviders>
      <BrutalistDashboardLayout>{children}</BrutalistDashboardLayout>
    </BrutalistProviders>
  );
}
