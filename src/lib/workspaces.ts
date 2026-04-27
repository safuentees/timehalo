import "server-only";
import type { MembershipRole } from "@/generated/prisma/enums";

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

export function scopesFor(role: MembershipRole): ReadonlyArray<WorkspaceScope> {
  return Array.from(ROLE_SCOPES[role]);
}

export const WORKSPACE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;
export const WORKSPACE_SLUG_MAX = 30;

const PERSONAL_PREFIX = "personal-";
const PERSONAL_SUFFIX_LEN = WORKSPACE_SLUG_MAX - PERSONAL_PREFIX.length;

export function personalWorkspaceSlugFor(userId: string): string {
  return `${PERSONAL_PREFIX}${userId.slice(0, PERSONAL_SUFFIX_LEN)}`;
}

export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export async function generateInvitationToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("hex");
}
