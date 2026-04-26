import "server-only";

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
