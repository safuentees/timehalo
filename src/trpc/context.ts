import { auth } from "@/auth";

type CreateContextOpts = {
  req?: Request;
  ipIdentifier?: string;
};

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

  return { user: session?.user ?? null, ipIdentifier };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
