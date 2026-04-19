import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import { BrutalistHome } from "@/components/brutalist/brutalist-home";

export default async function Page() {
  const trpc = await createPublicSSRHelper();

  await trpc.posts.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <BrutalistHome />
    </HydrationBoundary>
  );
}
