import "server-only";

// Admin gate. dub does this with workspace-membership against
// DUB_WORKSPACE_ID (apps/web/lib/auth/admin.ts:18-31). We don't have
// workspaces, so the equivalent is a CSV env var. The gate lives in
// one helper so /admin pages, the tRPC adminProcedure middleware, and
// future scripts all agree on who's an admin.
//
// Reads OFFICEHOURS_ADMIN_HANDLES off raw process.env (same pattern
// as CRON_SECRET — the schema in src/env.ts documents it, but the
// admin tests mutate the value post-import and t3-env snapshots at
// module load).
function adminHandleSet(): ReadonlySet<string> {
  const raw = process.env.OFFICEHOURS_ADMIN_HANDLES?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminHandle(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return adminHandleSet().has(handle.toLowerCase());
}
