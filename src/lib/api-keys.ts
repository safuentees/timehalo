import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  WORKSPACE_SCOPES,
  type WorkspaceScope,
} from "@/lib/workspaces";

// API key generation + verification. Pattern reference:
// dub /apps/web/lib/auth/hash-token.ts (sha256 hash + opaque prefix
// token format) and rallly /apps/web/src/app/api/private/utils/api-
// key.ts:7-77 (timing-safe compare via crypto.timingSafeEqual).
//
// Token shape: `oh_<24 chars base64url>`. Total length 27.
//   • The "oh_" prefix is the project marker — log scrubbers + secret
//     scanners can grep for it. Same idea as `sk_test_…` in Stripe.
//   • The 24-char body is 18 random bytes base64url-encoded — 144
//     bits of entropy, enough to drop the brute-force concern entirely.
//   • The first 12 chars (`oh_xxxxxxxxx`) are the public-facing
//     "prefix" we surface in admin UI for identification. Persisted on
//     the row so we don't have to recover it from the hash.

const TOKEN_PREFIX = "oh_";
const TOKEN_RANDOM_BYTES = 18;
const PUBLIC_PREFIX_LEN = 12;

export type GeneratedApiKey = {
  /** The full token, returned to the user EXACTLY ONCE. */
  token: string;
  /** Visible identifier (first 12 chars). Persisted on the row. */
  prefix: string;
  /** SHA-256 hex of the full token. Persisted; never returned. */
  hash: string;
};

export function generateApiKey(): GeneratedApiKey {
  const body = randomBytes(TOKEN_RANDOM_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${body}`;
  const prefix = token.slice(0, PUBLIC_PREFIX_LEN);
  const hash = sha256Hex(token);
  return { token, prefix, hash };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type VerifiedApiKey = {
  id: string;
  workspaceId: string;
  scopes: ReadonlySet<WorkspaceScope>;
};

/**
 * Look up + verify a bearer token. Steps:
 *   1. Quick reject — wrong prefix marker → null.
 *   2. Filter DB rows by `prefix` (indexed) — fast.
 *   3. Timing-safe compare each candidate's tokenHash against the
 *      sha256 of the supplied token. Multiple candidates with the
 *      same 12-char prefix is astronomically unlikely with 9 random
 *      chars but the loop is correct under collision.
 *   4. On match: skip if revoked / expired; otherwise update
 *      lastUsedAt (best-effort — failure to write doesn't reject).
 *
 * Returns the matched key + parsed scope set, or null.
 */
export async function verifyApiKey(
  token: string,
): Promise<VerifiedApiKey | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const prefix = token.slice(0, PUBLIC_PREFIX_LEN);
  const expected = Buffer.from(sha256Hex(token), "hex");

  const candidates = await prisma.apiKey.findMany({
    where: { prefix, revokedAt: null },
    select: {
      id: true,
      workspaceId: true,
      scopes: true,
      tokenHash: true,
      expiresAt: true,
    },
  });

  for (const c of candidates) {
    const stored = Buffer.from(c.tokenHash, "hex");
    if (stored.length !== expected.length) continue;
    if (!timingSafeEqual(stored, expected)) continue;

    if (c.expiresAt && c.expiresAt.getTime() < Date.now()) {
      return null;
    }

    // Best-effort lastUsedAt — don't await; the auth path doesn't
    // care if it lands. A failure here shouldn't 401 a valid token.
    void prisma.apiKey
      .update({
        where: { id: c.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return {
      id: c.id,
      workspaceId: c.workspaceId,
      scopes: parseScopes(c.scopes),
    };
  }

  return null;
}

/** Validate + parse a CSV scope string into a typed set. */
export function parseScopes(csv: string): ReadonlySet<WorkspaceScope> {
  const known = new Set<string>(WORKSPACE_SCOPES);
  const out = new Set<WorkspaceScope>();
  for (const piece of csv.split(",")) {
    const trimmed = piece.trim();
    if (known.has(trimmed)) out.add(trimmed as WorkspaceScope);
  }
  return out;
}

export function tokenHasScope(
  key: VerifiedApiKey,
  scope: WorkspaceScope,
): boolean {
  return key.scopes.has(scope);
}
