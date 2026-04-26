import { auth } from "@/auth";

type CreateContextOpts = {
  req?: Request;
  ipIdentifier?: string;
  cookies?: ReadonlyMap<string, string>;
};

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
