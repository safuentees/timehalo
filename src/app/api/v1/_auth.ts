import "server-only";
import {
  verifyApiKey,
  tokenHasScope,
  type VerifiedApiKey,
} from "@/lib/api-keys";
import { createRatelimit } from "@/lib/rate-limit";
import type { WorkspaceScope } from "@/lib/workspaces";

const apiKeyRatelimit = createRatelimit(60, "1 m");

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

function tooManyRequests(opts: {
  retryAfterSeconds: number;
  limit: number;
  remaining: number;
  resetEpoch: number;
}): Response {
  return Response.json(
    {
      error: "rate_limited",
      message: `Rate limit exceeded. Retry in ${opts.retryAfterSeconds}s.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(opts.retryAfterSeconds),
        "X-RateLimit-Limit": String(opts.limit),
        "X-RateLimit-Remaining": String(opts.remaining),
        "X-RateLimit-Reset": String(opts.resetEpoch),
      },
    },
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

  const limit = await apiKeyRatelimit.limit(`api-v1:${key.id}`);
  if (!limit.success) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((limit.resetAtMs - Date.now()) / 1000),
    );
    return tooManyRequests({
      retryAfterSeconds,
      limit: limit.limit,
      remaining: 0,
      resetEpoch: Math.ceil(limit.resetAtMs / 1000),
    });
  }

  if (requiredScope && !tokenHasScope(key, requiredScope)) {
    return forbidden(requiredScope);
  }

  return key;
}
