// Helpers for the visitor-page display label and placeholder-handle
// detection. Lives in /lib so both the server router (`users.getByHandle`)
// and any future client-side use can pull from one source of truth.

/** Matches the auto-generated placeholder handle minted at signup
 *  by `derivePlaceholderHandle()` — `u-<5char>` of lowercase
 *  alphanumerics. A user who later picks a custom slug via
 *  `auth.claimHandle` / `users.setHandle` no longer matches this
 *  regex, which is the trigger for the display rule below to fall
 *  through to the handle itself.
 */
const PLACEHOLDER_HANDLE_RE = /^u-[a-z0-9]{5}$/;

export function isPlaceholderHandle(handle: string): boolean {
  return PLACEHOLDER_HANDLE_RE.test(handle);
}

/**
 * Public display label for `/h/<handle>` (B.PT-host-display).
 *
 * Two rules, by handle state:
 *
 * 1. **Placeholder handle** (auto-generated `u-<5char>`): the user
 *    hasn't picked a public slug yet. Use the same fallback chain
 *    the authenticated user-menu uses for its trigger label
 *    (`oh-user-menu.tsx`'s `labelName`):
 *
 *        name (if set) → email's local-part → handle
 *
 *    So a fresh account with email "john.smith@gmail.com" reads as
 *    "john.smith" on the public page instead of the cryptic
 *    `u-abc12`. Once they set a name in `/profile`, that wins.
 *
 * 2. **Custom handle** (user claimed a real slug): the handle is
 *    the public identity they picked, so the displayed name
 *    always matches the URL — `/h/john-doe` shows "john-doe" as
 *    the page title regardless of what's in `User.name`. This
 *    keeps the displayed identity and the URL in lockstep.
 *
 * Email is intentionally accepted as an argument here — the caller
 * (the public `getByHandle` procedure) reads it server-side, calls
 * this helper, and returns ONLY the derived label in the response.
 * The email itself never leaves the server.
 */
export function deriveHostDisplayLabel(user: {
  name: string | null;
  email: string | null;
  // Prisma's `User.handle` is nullable schema-wide, but every call
  // site here resolves a row by handle (so it must be set). Accept
  // the null case for type safety and degrade to a generic "Host"
  // label — should never fire in practice.
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
