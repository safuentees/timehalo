import { workspaceSlugSchema } from "@/lib/workspaces";

// B.PT6 — active-workspace cookie. Threads "which workspace is the
// user currently focused on" across the host shell so settings,
// billing, api-keys, workflow plan-gates, and the top-bar dropdown
// all read from one source.
//
// Pure shared module — safe for server + client. The server action
// that ACTUALLY writes the cookie lives next door in
// `active-workspace-actions.ts` (uses `next/headers`); the helper
// here is just the constant + a defensive parser.
//
// Cookie shape:
//   name: oh_active_workspace
//   value: <workspace slug, validated against workspaceSlugSchema>
//   path: /
//   maxAge: 30 days
//   sameSite: lax
//   httpOnly: false   (read by server, set by server, but harmless
//                      to expose to JS — the value is the user's
//                      OWN workspace slug, not a secret.)
//
// We deliberately don't expose a "set the cookie from anywhere"
// helper. All writes go through the server action so the
// membership check is enforced — otherwise a client could write
// the cookie to a workspace they don't belong to and confuse the
// rendered shell (the server-side scope checks would still gate
// any actual writes, but the UI would lie about the user's
// context).

export const ACTIVE_WORKSPACE_COOKIE = "oh_active_workspace";
export const ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 30; // 30 days

/**
 * Read + validate a slug from the cookie value. Returns null when
 * the cookie is unset or carries an invalid slug — defensive against
 * a stale cookie whose workspace was renamed or deleted; callers
 * must always treat null as "fall back to default" (usually
 * workspaces[0]).
 */
export function parseActiveWorkspaceSlug(
  cookieValue: string | undefined,
): string | null {
  if (!cookieValue) return null;
  const result = workspaceSlugSchema.safeParse(cookieValue);
  return result.success ? result.data : null;
}
