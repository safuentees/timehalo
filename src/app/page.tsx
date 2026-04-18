import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { BrutalistShell } from "@/components/brutalist/brutalist-shell";

export default async function Page() {
  const trpc = await createPublicSSRHelper();

  await trpc.posts.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <BrutalistShell />
    </HydrationBoundary>
  );
}
