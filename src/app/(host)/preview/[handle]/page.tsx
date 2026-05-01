import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import PreviewShell from "./preview-shell";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const trpc = await createPublicSSRHelper();
  const renderedAt = new Date().toISOString();
  let user;
  let slots;

  try {
    [user, slots] = await Promise.all([
      trpc.users.getByHandle.fetch({ handle }),
      trpc.schedule.getUpcomingSlots.fetch({ handle }),
    ]);
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <PreviewShell
        handle={handle}
        initialUser={user}
        initialSlots={slots}
        renderedAt={renderedAt}
      />
    </HydrationBoundary>
  );
}
