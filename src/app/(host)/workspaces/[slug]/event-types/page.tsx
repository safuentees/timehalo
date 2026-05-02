import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { redirectIfAliasedSlug } from "@/lib/workspaces-server";
import EventTypesPanel from "./components/event-types-panel";

export default async function WorkspaceEventTypesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
