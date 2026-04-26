
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getQueryParam(key: string): string | null {
  if (!isBrowser()) return null;
  return new URLSearchParams(window.location.search).get(key);
}

type UpdateOptions = {
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
