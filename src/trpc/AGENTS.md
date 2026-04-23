# tRPC Scope

- Use `publicProcedure` and `privateProcedure` consistently; keep auth narrowing in middleware.
- Use `TRPCError`, never raw `Error`.
- Use shared zod schemas from `src/lib/`.
- Use `select` instead of `include`.
- Catch `P2002` and map it to `CONFLICT`.
- Wrap `$transaction` writes in `try/catch` and rethrow friendly errors with `cause`.
- Remember that `src/trpc/hooks.ts` globally invalidates queries after mutations.
- Open first: `router.ts`, `hooks.ts`, `server-helpers.ts`, `../lib/schedule.ts`.
