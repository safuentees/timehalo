import type { ReactNode } from "react";
import { BrutalistProviders } from "@/components/brutalist/providers";
import { BrutalistDashboardLayout } from "@/components/brutalist/brutalist-dashboard-layout";

export default async function DashboardLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode;
  modal: ReactNode;
}>) {
  return (
    <BrutalistProviders>
      <BrutalistDashboardLayout>{children}</BrutalistDashboardLayout>
      {modal}
    </BrutalistProviders>
  );
}
