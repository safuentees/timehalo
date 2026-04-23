# Prisma Scope

- `schema.prisma` is the source of truth for data shape.
- Ask before changing the schema.
- Do not hand-edit migrations unless you are reconciling a manual change intentionally.
- After schema changes, run `pnpm prisma generate` and restart `pnpm dev`.
- Keep callers on minimal `select` projections instead of broad model fetches.
