import type { ReactNode } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { OhProviders } from "@/components/oh/providers";
import { OhDashboardLayout } from "@/components/oh/oh-dashboard-layout";
import { DevChecklistMount } from "@/components/oh/dev-checklist-mount";
import { DevNotesMount } from "@/components/oh/dev-notes-mount";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
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
        <DevChecklistMount />
        <DevNotesMount />
      </HydrationBoundary>
    </OhProviders>
  );
}
