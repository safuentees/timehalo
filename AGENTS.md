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
- Use `vi.stubEnv("X", value)` + `vi.unstubAllEnvs()` in tests, NEVER `process.env.X = ...`. To unset: `vi.stubEnv("X", undefined as unknown as string)`. The full canon is in `.claude/rules/testing.md` *Env stubbing*.
- Use `fakeContext()` from `test/fixtures.ts` for synthetic tRPC contexts; never roll your own. The fixture inventory (`createTestHost`, `createTestUser`, `createTestEventTypeHostPool`, `safeTearDownByHandle`, `purgeTestWorkspaces`, `upgradeWorkspaceToPro`, etc.) is documented in `.claude/rules/testing.md` *Fixtures inventory*.
- Reference `e2e/test-constants.ts` (`TEST_EMAIL`, `TEST_PASSWORD`, `TEST_HANDLE`) from Playwright specs and the seed script — never hardcode the test handle in spec files.
- For Playwright auth: rely on the cached `storageState` from `e2e/auth.setup.ts`. Don't inline the credentials form login per spec; the `authed` project already loads `playwright/.auth/user.json`. See `.claude/rules/testing.md` *Auth caching*.
- Use the styling tokens from `.claude/rules/brutalist-ui.md`: `rounded-sm` (6px) for structural surfaces, `rounded-full` for pills, Space Grotesk for body + titles, JetBrains Mono for accents.
- When a client tree branches on a browser-only signal (`useMediaQuery`, `useTheme`, `useMounted`, ICU data, `localStorage`), pick the SSR default that matches the hook's server snapshot, and resolve runtime-derived lists on the server. See `.claude/rules/dashboard-forms.md` *SSR-safe client branches*.
- For section / field chrome inside a hub page, use the `bru-legend` / `bru-description` / `bru-eyebrow` CSS classes (defined in `globals.css`) and the `<SectionHeader>` component. Never inline the eight-class `font-[family-name:var(--bru-mono)] text-[Npx] font-extrabold tracking-[Npx] uppercase opacity-...` strings. See `.claude/rules/brutalist-ui.md` *Typography utilities*.
- For destructive actions, use `<ConfirmDialog>` from `@/components/brutalist/confirm-dialog`. Never `window.confirm()`, never fire a destructive mutation on a single click without a confirm. Account-level / irreversible deletions use the typed-confirm pattern instead (`delete-account-dialog.tsx` reference). See `.claude/rules/brutalist-ui.md` *Destructive actions*.
- Compose dialogs from `<ResponsiveModalHeader/Title/Body/Footer>` primitives in `src/components/ui/responsive-modal.tsx`. For `<form>` bodies, apply the exported `RESPONSIVE_MODAL_BODY_CLASS` constant. See `.claude/rules/dashboard-forms.md` *Dialog composition*.
- For hub pages with multiple independent sub-sections (e.g. `/settings`), use per-section save (inline Save button, autosave, or dialog flow) — NOT the global `<BrutalistSaveBar>`. The SaveBar lies about its scope on multi-section pages and is reserved for pages that ARE one form. See `.claude/rules/dashboard-forms.md` (the SaveBar rule).

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
- Inline the legend/description/eyebrow class strings (`font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase opacity-55` and friends). Use `bru-legend` / `bru-description` / `bru-eyebrow` from `globals.css`. Audit on 2026-04-27 found 6+ verbatim duplications of the legend string and 7+ of the eyebrow with five competing tracking values — single source of truth lives in the utility class.
- Use `window.confirm()` for destructive actions. Use `<ConfirmDialog>` from `@/components/brutalist/confirm-dialog`. Never fire a destructive mutation on a single click with no confirmation.
- Hand-roll dialog padding/footer strings (`px-5 pb-6 flex flex-col gap-5 sm:px-6`, `flex flex-col gap-2 sm:flex-row sm:justify-end`). Compose `<ResponsiveModalBody>` + `<ResponsiveModalFooter>` from the primitive instead.
- Put `<BrutalistSaveBar>` on a hub page with multiple independent sub-sections — it claims to commit the whole page but only mutates one section's data. Per-section save instead.
- Mutate `process.env.X = ...` directly inside Vitest tests — leaks across tests if a test crashes mid-run. Use `vi.stubEnv` + `vi.unstubAllEnvs()` (Vitest 4 canon).
- Roll your own context object inside a tRPC test — use `fakeContext()`. Bypassing it skips the unique-IP rate-limit isolation and breaks the `Context` type chain.
- Re-login per route in Playwright authed specs — the `authed` project loads cached `storageState`. Inline login adds ~5s per test and re-litigates the credentials form selector.
- Use `networkidle` in Playwright — the live-queue SSE subscription holds a persistent connection forever and `networkidle` never fires. Use `waitUntil: "load"` + a 1.5s buffer.
- Hardcode the test user's handle / email / password in a spec — import from `e2e/test-constants.ts`.
- Skip the seed script's Workspace + OWNER Membership creation. `bookings.create` requires `host.ownedWorkspaces[0]` (B1 invariant); without it the call fails with `"Host has no workspace"`.
- Enable `fileParallelism: true` in `vitest.config.ts` or raise `workers` above 1 in `playwright.config.ts` — both gate against concrete races (DB wipes / dev-server compilation). The cost (~2s slower runs) buys flake-resistance the project's identity depends on.

## Backlog source of truth

`BACKLOG.md` at the repo root is the single canonical source of truth for what's shipped, what's open, and what's next. Treat it as authoritative — if any other markdown (`OFFICEHOURS-*.md`, `CAL-LAB-ROADMAP.md`, etc.) disagrees, `BACKLOG.md` wins.

When you ship a deferred item or introduce a new deferral, you must update `BACKLOG.md` in the same commit:

- **Closing an item.** Flip its row's status to `SHIPPED` and write the commit SHA in the *Closed by* column. Don't delete rows — closed items stay for auditability.
- **Introducing a new deferral.** Add a row under the relevant tier with the next free ID (e.g. `B.PT14`). The commit body should include `Defers: <new-id>` so future audits can trace it.
- **Re-categorizing.** Edit the row inline; note the move in the *Notes* column.

The `commit-msg` git hook at `.githooks/commit-msg` enforces this: any commit message that names a backlog ID (e.g. `B7`, `B.PT12`, `A12`) must touch `BACKLOG.md` in its staged diff, or the commit aborts. Activate the hooks dir once with `git config core.hooksPath .githooks` (the bootstrap script does this automatically).

The four legacy docs (`OFFICEHOURS-PROJECT-GUIDE.md`, `OFFICEHOURS-DEPTH-IDEAS.md`, `OFFICEHOURS-FOLLOWUPS.md`, `OFFICEHOURS-OPEN-DEFERRALS.md`) are 1-line redirect stubs to `BACKLOG.md`. Don't add new content to them. If you need to write a long-form note, put it in `.claude/rules/` (Claude-only), `.agents/notes/` (cross-agent), or extend `BACKLOG.md` itself.

## Commands

- `pnpm dev` — local server
- `pnpm tsc --noEmit` — type check
- `pnpm lint` — ESLint (CI enforces, 0 errors)
- `pnpm test:run` — Vitest server-side contract tests (~300 tests across 40 files, ~6s tests / ~27s wall)
- `pnpm exec playwright test` — browser hydration smoke + auth flow + booking flow (~15s, workers=1, storageState-cached auth)
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
