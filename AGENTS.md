<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Worktree / fresh-clone setup

If `node_modules`, `.env`, or `src/generated/prisma` are missing, run `./scripts/bootstrap.sh` before anything else. It is idempotent: symlinks `.env` from the main worktree, copies `dev.db`, runs `pnpm install --prefer-offline`, and `pnpm prisma generate`. A Claude `SessionStart` hook in `.claude/settings.json` runs this automatically — do not re-run it if it already executed this session.

# trpc-lab Shared Agent Guide

This repo is `trpc-lab`, an educational scheduling app inspired by Cal.com. Current story: a visitor lands on `/h/[handle]` and sees a host profile plus upcoming 15-minute slots. Treat `/dashboard` as the canonical example for new authenticated pages.

Keep this root file small. Put file-local rules in nested `AGENTS.md` files. Put Claude-only persistent guidance in `.claude/rules/`. Put long procedures and examples in skills under `.agents/skills/` and `.claude/skills/`.

## Priorities

- Preserve type safety, security, and small focused diffs.
- Keep pages mobile-first and consistent with the repo's brutalist UI language.
- Prefer explicit server/client wiring over magic.
- Treat `tempCLAUDE.md` as legacy reference material, not active session context.

## Always do

- Use `select` instead of `include` in Prisma queries.
- Use `import type` for type-only imports.
- Use `TRPCError` in procedures, not raw `Error`.
- Keep shared zod schemas in `src/lib/` and infer types from them.
- Use custom mutation hooks in `src/lib/mutations/` for user-visible writes.
- Use SSR prefetch plus `HydrationBoundary` for authenticated dashboard pages.
- Put auth and permission checks in `page.tsx`, not `layout.tsx`.
- Restart `pnpm dev` after `pnpm prisma generate`.

## Never do

- Use `as any`.
- Expose auth internals or sensitive user fields in tRPC responses.
- Import the Prisma client into client components.
- Re-implement shadcn primitive internals when a wrapper or `className` override will do.
- Put toast logic directly in components when a custom mutation hook should own it.
- Use `revalidatePath` for normal write flows in this repo.
- Commit `.env`, `prisma/dev.db`, or generated Prisma output.

## Commands

- `pnpm dev`
- `pnpm tsc --noEmit`
- `pnpm build`
- `pnpm prisma generate`

## Open First

- `src/trpc/router.ts`
- `src/trpc/hooks.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/components/settings-form.tsx`
- `src/lib/schedule.ts`
- `src/lib/mutations/use-schedule-save.ts`

## Scoped Guidance

- `src/trpc/AGENTS.md`
- `src/app/(dashboard)/AGENTS.md`
- `src/components/ui/AGENTS.md`
- `src/components/brutalist/AGENTS.md`
- `src/lib/mutations/AGENTS.md`
- `prisma/AGENTS.md`

## Skills

Shared project skills live in `.agents/skills/` and are mirrored into `.claude/skills/`.

- `build-dashboard-page` for authenticated dashboard routes and form shells.
- `create-mutation-hook` for repo-style custom mutation hooks.
- `compose-brutalist-ui` for brutalist shadcn composition and layout decisions.
