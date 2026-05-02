import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { TRPCError } from "@trpc/server";
import { notFound, redirect } from "next/navigation";
import { createPrivateSSRHelper } from "@/trpc/server-helpers";
import { redirectIfAliasedSlug } from "@/lib/workspaces-server";
import SettingsPanel from "./components/settings-panel";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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
