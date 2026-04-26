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
};

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

  return { user: session?.user ?? null, ipIdentifier };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
