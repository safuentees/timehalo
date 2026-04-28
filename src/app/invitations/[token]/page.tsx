import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import InvitationAccept from "./components/invitation-accept";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const trpc = await createPublicSSRHelper();

  let preview;
  try {
    preview = await trpc.invitations.preview.fetch({ token });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  const session = await auth();
  const isAuthed = !!session?.user;

  const toIso = (value: unknown): string | null => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    return typeof value === "string" ? value : null;
  };

  return (
    <InvitationAccept
      token={token}
      workspaceSlug={preview.workspace.slug}
      workspaceName={preview.workspace.name}
      email={preview.email}
      role={preview.role}
      expiresAtIso={toIso(preview.expiresAt) ?? new Date(0).toISOString()}
      acceptedAtIso={toIso(preview.acceptedAt)}
      expired={preview.expired}
      isAuthed={isAuthed}
    />
  );
}
