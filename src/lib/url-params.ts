// Tiny URL-bar mutation helpers — ported from cal.com's
// packages/features/bookings/Booker/utils/query-param.ts (~30 lines).
// Why bypass the Next router?
//   - We don't want a re-render or scroll on slot/date pick.
//   - The /h/[handle] page already has all the data it needs in client
//     React state; the URL is a *mirror*, not the source of truth.
//   - Next's `router.replace()` triggers RSC roundtrips even with
//     `{ scroll: false }`. Raw history.replaceState() is silent.
//
// Caveat (and why this is fine here): `useSearchParams()` does NOT
// re-fire on history.replaceState(). If a downstream consumer
// subscribes to the URL via that hook, they won't see updates. On
// /h/[handle] no one does, so the raw API is the right call. If you
// add a consumer later, switch to `router.replace(href, { scroll: false })`.

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getQueryParam(key: string): string | null {
  if (!isBrowser()) return null;
  return new URLSearchParams(window.location.search).get(key);
}

type UpdateOptions = {
  /** push a new history entry (default = replace, no entry). */
  pushEntry?: boolean;
};

export function updateQueryParam(
  key: string,
  value: string | null | undefined,
  { pushEntry = false }: UpdateOptions = {},
): void {
  if (!isBrowser()) return;
  const url = new URL(window.location.href);
  if (value === null || value === undefined || value === "") {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  const next = url.toString();
  if (next === window.location.href) return;
  if (pushEntry) {
    window.history.pushState(null, "", next);
  } else {
    window.history.replaceState(null, "", next);
  }
}

export function updateQueryParams(
  patch: Record<string, string | null | undefined>,
  { pushEntry = false }: UpdateOptions = {},
): void {
  if (!isBrowser()) return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value);
    }
  }
  const next = url.toString();
  if (next === window.location.href) return;
  if (pushEntry) {
    window.history.pushState(null, "", next);
  } else {
    window.history.replaceState(null, "", next);
  }
}
