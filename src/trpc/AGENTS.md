# tRPC Scope

## Layout

- `router.ts` — merge file. Imports each subrouter from `./routers/`, calls `router({...})`, re-exports the public surface (`appRouter`, `createCaller`, `AppRouter`, `WEBHOOK_EVENTS`, `WebhookEvent`). Tests + lib/ + the API route handler all import from this module — keep the surface stable.
- `routers/` — one file per top-level domain (`bookings.ts`, `workspaces.ts`, `admin.ts`, etc.). Each exports a single `const <name> = router({...})`. Co-locate domain-only helpers + zod schemas inside the file; promote to `src/lib/` only when shared.
- `trpc.ts` — `t` instance + SSE config + builders (`publicProcedure`, `privateProcedure`, `adminProcedure`) + `createRateLimitMiddleware` factory + `createCaller`. Build new procedure variants here, not inside individual subrouters.
- `context.ts` — request context (user, ipIdentifier, cookies). Bus + hooks files unchanged.

## Conventions

- Use `publicProcedure` and `privateProcedure` consistently; keep auth narrowing in middleware.
- Use `TRPCError`, never raw `Error`.
- Use shared zod schemas from `src/lib/`.
- Use `select` instead of `include`.
- Catch `P2002` and map it to `CONFLICT`.
- Wrap `$transaction` writes in `try/catch` and rethrow friendly errors with `cause`.
- Remember that `src/trpc/hooks.ts` globally invalidates queries after mutations.

## Adding a new domain

1. Create `routers/<name>.ts`. Import builders from `@/trpc/trpc`.
2. Export `const <name> = router({...})`.
3. Wire into `router.ts` (import + add to the `router({...})` call).
4. Add a contract test under `__tests__/` if the domain ships state-changing procedures.

## Don't

- Don't put `t = initTRPC...` or builder factories inside `routers/<name>.ts` — they belong in `trpc.ts` so every subrouter shares the same `Context` type.
- Don't re-export from `routers/<name>.ts` to consumers; consumers go through `router.ts`.
