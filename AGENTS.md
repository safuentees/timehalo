<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Worktree / fresh-clone setup

One command spins up a worktree:

- `./scripts/new-worktree.sh <branch> [--from main]` — creates the worktree under `.claude/worktrees/<branch>/` and bootstraps it.
- `./scripts/bootstrap.sh` — idempotent setup; runs every step (env link, db copy, `pnpm install`, `prisma generate`, `prisma migrate deploy`) but skips fast when state hashes match. `--force` ignores the cache. SessionStart hook runs it automatically on every session.

Hashes live in `.bootstrap-state/` (gitignored). If anything looks stale, run `./scripts/bootstrap.sh --force`.

# trpc-lab Shared Agent Guide

This repo is `trpc-lab` (product name: **Officehours**), a single-host scheduling app inspired by Cal.com. Identity: **small visible surface, deep production-engineering stack** — see the gitignored `OFFICEHOURS-PROJECT-GUIDE.md` for the project's framing and the §10.1 priority list.

Authenticated host pages live under the `(host)` route group with noun-based routes (`/bookings`, `/availability`, `/profile`, `/settings`). `/bookings` is the canonical reference for new authenticated pages. Public visitor pages live under `/h/[handle]`.

Keep this root file small. Put file-local rules in nested `AGENTS.md` files. Put Claude-only persistent guidance in `.claude/rules/`. Put long procedures and examples in skills under `.agents/skills/` and `.claude/skills/`.

## Priorities

- Preserve type safety, security, and small focused diffs.
- Keep pages mobile-first and consistent with the repo's brutalist UI language.
- Prefer explicit server/client wiring over magic.
- The §10.1 production primitives (idempotency, audit, rate limit, webhooks, soft delete, SSE, attribution, feature flags, observability) are not optional decorations. They're contracts other tests + features depend on. See `.claude/rules/production-primitives.md`.
- Treat `tempCLAUDE.md` as legacy reference material, not active session context.

## Always do

- Use `select` instead of `include` in Prisma queries.
- Use `import type` for type-only imports.
- Use `TRPCError` in procedures, not raw `Error`.
- Keep shared zod schemas in `src/lib/` and infer types from them.
- Use custom mutation hooks in `src/lib/mutations/` for user-visible writes.
- Use SSR prefetch plus `HydrationBoundary` for authenticated host pages.
- Put auth and permission checks in `page.tsx`, not `layout.tsx`.
- Restart `pnpm dev` after `pnpm prisma generate`.
- Filter `deleted: false` on every Booking read (item 7 invariant).
- Run `pnpm test:run` before committing user-visible procedure changes.
- Use the styling tokens from `.claude/rules/brutalist-ui.md`: `rounded-sm` (6px) for structural surfaces, `rounded-full` for pills, Space Grotesk for body + titles, JetBrains Mono for accents.
- When a client tree branches on a browser-only signal (`useMediaQuery`, `useTheme`, `useMounted`, ICU data, `localStorage`), pick the SSR default that matches the hook's server snapshot, and resolve runtime-derived lists on the server. See `.claude/rules/dashboard-forms.md` *SSR-safe client branches*.

## Never do

- Use `as any`.
- Expose auth internals or sensitive user fields in tRPC responses.
- Import the Prisma client into client components.
- Re-implement shadcn primitive internals when a wrapper or `className` override will do.
- Put toast logic directly in components when a custom mutation hook should own it.
- Use `revalidatePath` for normal write flows in this repo.
- Commit `.env`, `prisma/dev.db`, or generated Prisma output.
- Use `rounded-md/lg/xl/2xl/3xl/4xl` — those tokens are dropped via `--radius-*: initial` and render at 0px. Use `rounded-sm` or `rounded-full`.
- Reach for a serif or "title" font — there is none. Bump weight + size on Space Grotesk.
- Use the `useState(false) + useEffect(() => setMounted(true), [])` pattern. Use `useMounted()` from `src/hooks/use-mounted.ts` instead — React 19's compiler ESLint rule (`react-hooks/set-state-in-effect`) fails CI on the legacy pattern.
- `if (!mounted) return null` from a client component when that subtree contains user-visible UI (buttons, inputs, links, dialog triggers). Render the SSR-safe default and let the effect upgrade in place — see `.claude/rules/dashboard-forms.md` *SSR-safe client branches*.

## Commands

- `pnpm dev` — local server
- `pnpm tsc --noEmit` — type check
- `pnpm lint` — ESLint (CI enforces, 0 errors)
- `pnpm test:run` — Vitest server-side contract tests (45 tests, ~3s)
- `pnpm exec playwright test` — browser hydration smoke + auth flow (~25s)
- `pnpm prisma generate` — regenerate the typed client
- `pnpm prisma migrate dev --name <name>` — interactive; runs locally only

## Open First

- `src/trpc/router.ts` — slim merge file. Re-exports `appRouter`, `createCaller`, `AppRouter`, `WEBHOOK_EVENTS`, `WebhookEvent`. Keep this public surface stable.
- `src/trpc/routers/` — per-domain subrouters (one file each: `bookings.ts`, `workspaces.ts`, etc.). Add new domains here, then wire into `router.ts`.
- `src/trpc/trpc.ts` — `t` instance, `router`/`middleware`, `publicProcedure`/`privateProcedure`/`adminProcedure`, `createRateLimitMiddleware`. All builders + the SSE config live here.
- `src/trpc/hooks.ts` — global query-invalidation hooks
- `src/app/(host)/bookings/components/bookings-list.tsx` — canonical authed page
- `src/lib/schedule.ts` — slot-generation logic shared between server + client
- `src/lib/mutations/use-schedule-save.ts` — canonical mutation hook
- `prisma/schema.prisma` — single source of truth for data model

## Scoped Guidance

- `src/trpc/AGENTS.md`
- `src/app/(host)/AGENTS.md`
- `src/components/ui/AGENTS.md`
- `src/components/brutalist/AGENTS.md`
- `src/lib/mutations/AGENTS.md`
- `prisma/AGENTS.md`

## Skills

Shared project skills live in `.agents/skills/` and are mirrored into `.claude/skills/`.

- `build-dashboard-page` for authenticated host routes and form shells.
- `create-mutation-hook` for repo-style custom mutation hooks.
- `compose-brutalist-ui` for brutalist shadcn composition and layout decisions.
