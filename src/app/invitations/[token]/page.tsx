import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { createPublicSSRHelper } from "@/trpc/server-helpers";
import InvitationAccept from "./components/invitation-accept";

// Public-ish accept page for /invitations/<token>. Unauthenticated
// users can still reach it (proxy.ts treats /invitations/* as public)
// so they see workspace name + role before deciding sign-in vs
// sign-up. The accept button itself flips to "Sign in to accept" when
// no session exists.
//
// Server component fetches the preview server-side so the page lands
// with hydrated data — no flash, no spinner.
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

  // tRPC's createServerSideHelpers returns the raw procedure result on
  // the server (Date objects intact), but the type derives through the
  // proxy so TS infers strings. Coerce defensively — both Date and
  // string already-ISO are accepted; falsy → null.
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
