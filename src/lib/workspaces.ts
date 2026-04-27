import "server-only";
import type { MembershipRole } from "@/generated/prisma/enums";

// Scope-permission-role matrix (B1). One source of truth for "what
// can a member with role X do inside a workspace?" Pattern reference:
// dub /apps/web/lib/api/rbac/permissions.ts:1-163 — flat scope list,
// per-scope role grant, single hasScope check at the procedure
// boundary.
//
// Eight scopes covering the surface a workspace owns (workspace
// settings, members, bookings, webhooks). Read scopes are routinely
// granted to all roles; write scopes thin out as the role descends.

export const WORKSPACE_SCOPES = [
  "workspace.read",
  "workspace.write",
  "members.read",
  "members.write",
  "bookings.read",
  "bookings.write",
  "webhooks.read",
  "webhooks.write",
] as const;

export type WorkspaceScope = (typeof WORKSPACE_SCOPES)[number];

const ROLE_SCOPES: Record<MembershipRole, ReadonlySet<WorkspaceScope>> = {
  OWNER: new Set(WORKSPACE_SCOPES),
  ADMIN: new Set([
    "workspace.read",
    "members.read",
    "members.write",
    "bookings.read",
    "bookings.write",
    "webhooks.read",
    "webhooks.write",
  ]),
  MEMBER: new Set([
    "workspace.read",
    "members.read",
    "bookings.read",
    "bookings.write",
  ]),
  VIEWER: new Set([
    "workspace.read",
    "members.read",
    "bookings.read",
    "webhooks.read",
  ]),
};

export function hasScope(
  role: MembershipRole,
  scope: WorkspaceScope,
): boolean {
  return ROLE_SCOPES[role].has(scope);
}

/** All scopes a role grants. Useful for surfaced UI gating. */
export function scopesFor(role: MembershipRole): ReadonlyArray<WorkspaceScope> {
  return Array.from(ROLE_SCOPES[role]);
}

// Slug rules — same shape as User.handle: lowercase letters, digits,
// hyphens, length 3–30. Reuses the handle alphabet so the URL is
// immediately readable. The schema's @unique constraint catches
// duplicates; this regex catches malformed input before the DB call.
export const WORKSPACE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
export const WORKSPACE_SLUG_MAX = 30;

// Default slug for the auto-created "Personal" workspace minted at
// signup (auth.register) and at next-auth's events.createUser. The
// naive shape was `personal-${userId}` — at 9 chars + a 25-char cuid
// the result is 34 chars, which overflows WORKSPACE_SLUG_MAX. Any
// subsequent slug-keyed procedure call (e.g. workspaces.apiKeys.list
// ({ slug })) then fails the zod schema with "Too big: expected
// string to have <=30 characters" and the API keys section can't
// load.
//
// Truncating the cuid suffix to 21 chars yields exactly 30 — cuid v2
// is all lowercase alnum so the trailing char is always alphanumeric
// (not hyphen), matching WORKSPACE_SLUG_REGEX's last-char anchor.
// Globally unique because cuid prefixes carry the timestamp + counter
// already; collision probability across 21 chars of cuid is
// astronomically low.
const PERSONAL_PREFIX = "personal-";
const PERSONAL_SUFFIX_LEN = WORKSPACE_SLUG_MAX - PERSONAL_PREFIX.length;

export function personalWorkspaceSlugFor(userId: string): string {
  return `${PERSONAL_PREFIX}${userId.slice(0, PERSONAL_SUFFIX_LEN)}`;
}

export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Generate a hex-encoded 32-byte token for invitation links. 64
// chars; cryptographically suitable for a public-but-unguessable
// accept URL. Same shape as WebhookSubscription.secret (and same
// reasoning — opaque single-use capabilities should be wide).
export async function generateInvitationToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}
