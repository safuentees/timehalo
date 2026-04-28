import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import MembersPanel from "./components/members-panel";

// /workspaces/<slug>/members — member management surface. Server
// component prefetches three queries in parallel + checks the caller
// has read access to the workspace before letting the client render
// (otherwise an outsider gets a router error toast on first paint).
//
// On forbidden / not-found, redirect to the workspaces index so the
// user lands on a meaningful page rather than a generic error.
export default async function WorkspaceMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await createPrivateSSRHelper();

  // Authorization check happens server-side so the page either
  // 200s with hydrated data or redirects before the client mounts.
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
    trpc.workspaces.listMembers.prefetch({ slug }),
    trpc.workspaces.listInvitations.prefetch({ slug }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <MembersPanel slug={slug} />
    </HydrationBoundary>
  );
}
