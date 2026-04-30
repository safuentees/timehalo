import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { OhProviders } from "@/components/oh/providers";
import { OhDashboardLayout } from "@/components/oh/oh-dashboard-layout";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function DashboardLayout({
  children,
  modal,
}: Readonly<{
  children: ReactNode;
  modal: ReactNode;
}>) {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.users.me.prefetch(),
    trpc.workspaces.list.prefetch(),
  ]);

  return (
    <OhProviders>
      <HydrationBoundary state={dehydrate(trpc.queryClient)}>
        <OhDashboardLayout>{children}</OhDashboardLayout>
        {modal}
      </HydrationBoundary>
    </OhProviders>
  );
}
