import { auth } from "@/auth";

// `ipIdentifier` is the per-request key the rate limiter buckets by.
// For HTTP requests we read the proxy headers (Vercel sets
// `x-forwarded-for`; localhost dev tends to be empty). SSR / direct
// caller paths supply a literal "ssr" so rate-limited procedures
// short-circuit cleanly when invoked from a server component.
type CreateContextOpts = {
  req?: Request;
  /** Override for SSR helpers that don't have a real request. */
  ipIdentifier?: string;
  /** Override for SSR helpers — empty Map by default. */
  cookies?: ReadonlyMap<string, string>;
};

// Minimal RFC 6265 Cookie header parser. Splits on ";", trims, splits
// each pair on the first "=". Doesn't handle Set-Cookie attributes —
// that's a different format. Cal.com / dub use similar tiny parsers
// inline; no need to pull a dependency for ~10 lines.
function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    try {
      map.set(key, decodeURIComponent(value));
    } catch {
      map.set(key, value);
    }
  }
  return map;
}

export async function createContext(opts: CreateContextOpts = {}) {
  const session = await auth();

  const headers = opts.req?.headers;
  // x-forwarded-for is a comma-separated list — first entry is the
  // origin client. Fall back through x-real-ip and a stable "local"
  // bucket so dev never breaks the rate limiter.
  const forwardedFor = headers
    ?.get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const realIp = headers?.get("x-real-ip")?.trim();
  const ipIdentifier =
    opts.ipIdentifier ?? forwardedFor ?? realIp ?? "local";

  const cookies =
    opts.cookies ?? parseCookieHeader(headers?.get("cookie"));

  return { user: session?.user ?? null, ipIdentifier, cookies };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
