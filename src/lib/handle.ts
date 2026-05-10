
const PLACEHOLDER_HANDLE_RE = /^u-[a-z0-9]{5}$/;

export function isPlaceholderHandle(handle: string): boolean {
  return PLACEHOLDER_HANDLE_RE.test(handle);
}

export function deriveHostDisplayLabel(user: {
  name: string | null;
  email: string | null;
  handle: string | null;
}): string {
  const handle = user.handle ?? "";
  if (!handle) return "Host";
  if (isPlaceholderHandle(handle)) {
    const trimmedName = user.name?.trim();
    if (trimmedName) return trimmedName;
    if (user.email) {
      const localPart = user.email.split("@")[0];
      if (localPart) return localPart;
    }
    return handle;
  }
  return handle;
}
