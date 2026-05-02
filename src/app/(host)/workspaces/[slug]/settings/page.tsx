import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { redirectIfAliasedSlug } from "@/lib/workspaces-server";
import SettingsPanel from "./components/settings-panel";

// /workspaces/<slug>/settings — workspace-level settings hub. Mirrors
// the /workspaces/<slug>/members page shape: server component
// prefetches the queries the panel needs in parallel + checks the
// caller can read the workspace before letting the client mount.
//
// FORBIDDEN → /workspaces (the user lands somewhere meaningful).
// NOT_FOUND → notFound() so the next-not-found UI takes over.
//
// listMembers is prefetched because the transfer-ownership picker
// needs it; not all sections render for every role, but prefetching
// is cheap and the panel renders the section conditionally.

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // B.PT82 — back-stack alias redirect (see `redirectIfAliasedSlug`).
  await redirectIfAliasedSlug(slug, "settings");
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
    trpc.workspaces.listMembers.prefetch({ slug }),
    trpc.workspaces.list.prefetch(),
  ]);

  return (
    <HydrationBoundary state={dehydrate(trpc.queryClient)}>
      <SettingsPanel slug={slug} />
    </HydrationBoundary>
  );
}
