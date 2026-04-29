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
4. Add a contract test under `__tests__/` if the domain ships state-changing procedures. The canonical test shape (caller + `fakeContext` + `createTestHost` + `wipeTransientState`) lives in `.claude/rules/testing.md`.

## Tests under `__tests__/`

- One concern per file. Split when a file passes ~300 lines or ~20 cases — pattern: `<domain>-<concern>.test.ts` (e.g. `bookings-create.test.ts`, `workspaces-lifecycle.test.ts`). Each split file owns its OWN `SLUG` / `HANDLE` constant so cross-file teardown order is unambiguous.
- All env overrides go through `vi.stubEnv` (never `process.env.X = ...`). For t3-env caches, use hoisted `vi.mock("@/env", ...)` — see `calendar-integration.test.ts` and `calendar-cron.test.ts`.
- Outbound network: `vi.stubGlobal("fetch", ...)` + `vi.unstubAllGlobals()` afterEach. Three callers today; if a fourth lands with a different shape, revisit MSW (`OFFICEHOURS-TEST-AUDIT.md` §10 P2-12).
- Time-dependent assertions: `vi.useFakeTimers()` + `vi.setSystemTime(<known cusp>)`. Belt-and-braces even when the impl uses an explicit `from` arg.

## Don't

- Don't put `t = initTRPC...` or builder factories inside `routers/<name>.ts` — they belong in `trpc.ts` so every subrouter shares the same `Context` type.
- Don't re-export from `routers/<name>.ts` to consumers; consumers go through `router.ts`.
