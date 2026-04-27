import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  WORKSPACE_SCOPES,
  type WorkspaceScope,
} from "@/lib/workspaces";

const TOKEN_PREFIX = "oh_";
const TOKEN_RANDOM_BYTES = 18;
const PUBLIC_PREFIX_LEN = 12;

export type GeneratedApiKey = {
  token: string;
  prefix: string;
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
