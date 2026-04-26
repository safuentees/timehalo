import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/trpc/router";
import { createContext } from "@/trpc/context";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    // Pass the request through so createContext can read proxy headers
    // (x-forwarded-for, x-real-ip) and bucket the rate limiter by IP.
    createContext: (opts) => createContext({ req: opts.req }),
  });

export { handler as GET, handler as POST };
