---
paths:
  - "src/trpc/**/*.ts"
  - "src/lib/**/*.ts"
  - "prisma/**/*"
---

# tRPC And Prisma

- Use shared zod schemas from `src/lib/` for both form and procedure input.
- Use `TRPCError` in procedures and map Prisma `P2002` to `CONFLICT`.
- Wrap `prisma.$transaction(...)` in `try/catch` and rethrow a friendly `INTERNAL_SERVER_ERROR` with `cause`.
- Prefer `findUniqueOrThrow` when the caller assumes the row exists.
- Use `select` instead of `include`.
- After `pnpm prisma generate`, restart `pnpm dev` before trusting runtime behavior.
- New domains live as their own file under `src/trpc/routers/<name>.ts`. Import procedure builders from `@/trpc/trpc` (`router`, `publicProcedure`, `privateProcedure`, `adminProcedure`, `createRateLimitMiddleware`). Wire the export into `src/trpc/router.ts` so the merge picks it up.
- Open first: `src/trpc/router.ts` (merge surface), `src/trpc/routers/` (per-domain), `src/trpc/trpc.ts` (builders), `src/lib/schedule.ts`, `prisma/schema.prisma`.
