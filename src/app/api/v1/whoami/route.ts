import { authenticateRequest } from "../_auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, "workspace.read");
  if (auth instanceof Response) return auth;

  const workspace = await prisma.workspace.findUnique({
    where: { id: auth.workspaceId },
    select: { slug: true, name: true },
  });
  if (!workspace) {
    return Response.json({ error: "workspace_gone" }, { status: 401 });
  }

  return Response.json({
    workspace,
    scopes: Array.from(auth.scopes),
    keyId: auth.id,
  });
}
