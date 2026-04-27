import { authenticateRequest } from "../_auth";
import { prisma } from "@/lib/prisma";

// Demonstration endpoint — exercises the full auth chain end-to-end
// without depending on a workspace-scoped resource (bookings et al.
// are deferred to the workspace-aware refactor). External consumers
// can use this to verify their token is plumbed correctly.
//
// Requires `workspace.read` — the smallest scope every token has.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "workspace.read");
  if (auth instanceof Response) return auth;

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { slug: true, name: true },
  });
  if (!workspace) {
    // Workspace got deleted between key issuance and this call —
    // treat as if the token is no longer valid.
    return Response.json({ error: "workspace_gone" }, { status: 401 });
  }

  return Response.json({
    workspace,
    scopes: Array.from(auth.scopes),
    keyId: auth.id,
  });
}
