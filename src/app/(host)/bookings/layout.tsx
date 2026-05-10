import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";

export default async function BookingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const trpc = await createPrivateSSRHelper();
  await Promise.all([
    trpc.bookings.listForHost.prefetch(),
    trpc.users.featureFlags.prefetch(),
    trpc.users.me.prefetch(),
    trpc.schedule.get.prefetch(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      {children}
    </HydrationBoundary>
  );
}
