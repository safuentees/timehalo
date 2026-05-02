import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { redirectIfAliasedSlug } from "@/lib/workspaces-server";
import EventTypesPanel from "./components/event-types-panel";

// B4 — /workspaces/<slug>/event-types. Closes 5b8914e's deferral:
// "workspace OWNERs can populate EventTypeHost rows directly via
// Prisma Studio for now. The /workspaces/<slug>/event-types
// surface is a future commit; ships its own scope."
//
// Server prefetches the workspace + event-types list in parallel
// + checks the caller has read access before letting the client
// render. NOT_FOUND → 404, FORBIDDEN → bounce to /workspaces.
export default async function WorkspaceEventTypesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // B.PT82 — back-stack alias redirect (see `redirectIfAliasedSlug`).
  await redirectIfAliasedSlug(slug, "event-types");
  const trpc = await createPrivateSSRHelper();

  try {
    await trpc.workspaces.get.fetch({ slug });
  } catch (error) {
    if (error instanceof TRPCError) {
      if (error.code === "FORBIDDEN") redirect("/workspaces");
      if (error.code === "NOT_FOUND") notFound();
    }
    throw error;
  }

  await Promise.all([
    trpc.workspaces.get.prefetch({ slug }),
    trpc.eventTypes.list.prefetch({ slug }),
    trpc.workspaces.listMembers.prefetch({ slug }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <EventTypesPanel slug={slug} />
    </HydrationBoundary>
  );
}
