<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Worktree / fresh-clone setup

If `node_modules`, `.env`, or `src/generated/prisma` are missing, run `./scripts/bootstrap.sh` before anything else. It is idempotent: symlinks `.env` from the main worktree, copies `dev.db`, runs `pnpm install --prefer-offline`, and `pnpm prisma generate`. A Claude `SessionStart` hook in `.claude/settings.json` runs this automatically — do not re-run it if it already executed this session.
