import { workspaceSlugSchema } from "@/lib/workspaces";

export const ACTIVE_WORKSPACE_COOKIE = "oh_active_workspace";
export const ACTIVE_WORKSPACE_COOKIE_MAX_AGE_SECONDS =
  60 * 60 * 24 * 30; // 30 days

export function parseActiveWorkspaceSlug(
  cookieValue: string | undefined,
): string | null {
  if (!cookieValue) return null;
  const result = workspaceSlugSchema.safeParse(cookieValue);
  return result.success ? result.data : null;
}
