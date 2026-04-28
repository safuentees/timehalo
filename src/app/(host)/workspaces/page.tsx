import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import WorkspacesList from "./components/workspaces-list";

// Workspaces index — list of workspaces the signed-in user is a member
// of, plus a CTA to create a new one. Mirrors the /settings server-
// component pattern: SSR-prefetch the data the client component needs,
// dehydrate into <HydrationBoundary>. Client renders from cache; no
// "Loading…" flash on first paint.
export default async function WorkspacesPage() {
  const trpc = await createPrivateSSRHelper();
  await trpc.workspaces.list.prefetch();

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <WorkspacesList />
    </HydrationBoundary>
  );
}
