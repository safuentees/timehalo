import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import TeamProfile from "./components/team-profile";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await createPublicSSRHelper();
  let workspace;

  try {
    workspace = await trpc.workspaces.publicGetBySlug.fetch({ slug });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  return <TeamProfile slug={slug} initialWorkspace={workspace} />;
}
