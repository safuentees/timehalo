import "server-only";
import {
  verifyApiKey,
  tokenHasScope,
  type VerifiedApiKey,
} from "@/lib/api-keys";
import { createRatelimit } from "@/lib/rate-limit";
import type { WorkspaceScope } from "@/lib/workspaces";

// Shared bearer-auth helper for /api/v1/* routes. Reads the
// Authorization header, verifies via verifyApiKey (timing-safe sha256
// compare against the DB hash), checks the per-key rate budget,
// returns the matched key or an error Response. Optional scope guard
// returns 403 when the key lacks the required scope.
//
// Usage:
//   export async function GET(request: Request) {
//     const auth = await authenticateRequest(request, "bookings.read");
//     if (auth instanceof Response) return auth;
//     // auth is the VerifiedApiKey row
//     ...
//   }

// Per-key budget. Closes the deferral from 7df9072 verbatim:
//   "Per-key rate limiting — for now the existing IP-based limiter
//   covers /api/v1 paths. Future: a per-keyId bucket on top."
//
// Budget chosen to comfortably cover human-paced exploration via
// Scalar's docs page (a click hits whoami once) plus modest CI
// integration use. Dial up via env / per-key override if a real
// integration outgrows it. dub's published budget for paid plans is
// 600/min; FREE-tier API keys here get 60/min.
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

// 429 with the standard RateLimit headers (RFC 6585 + de-facto
// X-RateLimit-* used by GitHub, Stripe, dub). Retry-After is in
// seconds-from-now; the X- headers report budget + remaining +
// absolute reset epoch so SDKs can pace themselves intelligently.
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

  // Per-key rate-limit gate. Bucketed by the key's row id (not the
  // raw token) so logs / metrics carry an opaque identifier and the
  // budget survives token rotation if we ever add it.
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
      // Epoch seconds — what GitHub / Stripe report.
      resetEpoch: Math.ceil(limit.resetAtMs / 1000),
    });
  }

  if (requiredScope && !tokenHasScope(key, requiredScope)) {
    return forbidden(requiredScope);
  }

  return key;
}
