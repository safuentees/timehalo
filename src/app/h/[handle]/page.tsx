import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import HostProfile from "./components/host-profile";

export default async function HostPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();

  // Prefetch both queries the client component reads. If the user doesn't
  // exist, `getByHandle` throws NOT_FOUND — map it to Next's 404 so we don't
  // render an empty profile with a hanging loader.
  try {
    await Promise.all([
      trpc.users.getByHandle.prefetch({ handle }),
      trpc.schedule.getUpcomingSlots.prefetch({ handle }),
    ]);
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <HostProfile handle={handle} />
    </HydrationBoundary>
  );
}
