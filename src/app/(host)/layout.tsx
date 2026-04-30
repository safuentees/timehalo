import type { ReactNode } from "react";
import { OhProviders } from "@/components/oh/providers";
import { OhDashboardLayout } from "@/components/oh/oh-dashboard-layout";

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
