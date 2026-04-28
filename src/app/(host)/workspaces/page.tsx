import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import WorkspacesList from "./components/workspaces-list";

export default async function WorkspacesPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.workspaces.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <WorkspacesList />
    </HydrationBoundary>
  );
}
