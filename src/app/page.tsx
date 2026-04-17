import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import Dashboard from "@/components/dashboard";

export default async function Page() {
  const trpc = await createPrivateSSRHelper();

  await trpc.posts.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <Dashboard />
    </HydrationBoundary>
  );
}
