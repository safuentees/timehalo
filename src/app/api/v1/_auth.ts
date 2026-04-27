import "server-only";
import {
  verifyApiKey,
  tokenHasScope,
  type VerifiedApiKey,
} from "@/lib/api-keys";
import type { WorkspaceScope } from "@/lib/workspaces";

const WWW_AUTH_HEADER = 'Bearer realm="officehours", charset="UTF-8"';

function unauthorized(message: string): Response {
  return Response.json(
    { error: "unauthorized", message },
    {
      status: 401,
      headers: { "WWW-Authenticate": WWW_AUTH_HEADER },
    },
  );
}

function forbidden(scope: WorkspaceScope): Response {
  return Response.json(
    {
      error: "insufficient_scope",
      message: `Token missing scope: ${scope}`,
    },
    { status: 403 },
  );
}

export async function authenticateRequest(
  request: Request,
  requiredScope?: WorkspaceScope,
): Promise<VerifiedApiKey | Response> {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return unauthorized("Missing Bearer token");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return unauthorized("Empty Bearer token");

  const key = await verifyApiKey(token);
  if (!key) return unauthorized("Invalid or revoked token");

  if (requiredScope && !tokenHasScope(key, requiredScope)) {
    return forbidden(requiredScope);
  }

  return key;
}
