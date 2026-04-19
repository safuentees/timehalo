#!/usr/bin/env bash
# Idempotent setup for a fresh worktree (or fresh clone).
# Brings over ignored files that git can't carry: .env, dev.db, node_modules, prisma client.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
COMMON_DIR=$(git rev-parse --path-format=absolute --git-common-dir)
MAIN_WORKTREE=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')
cd "$ROOT"

log() { printf '\033[36m[bootstrap]\033[0m %s\n' "$*"; }

# 1. .env — symlink from main worktree so secrets stay in one place
if [ ! -e .env ] && [ -f "$MAIN_WORKTREE/.env" ] && [ "$ROOT" != "$MAIN_WORKTREE" ]; then
  log "linking .env from $MAIN_WORKTREE"
  ln -s "$MAIN_WORKTREE/.env" .env
elif [ ! -e .env ] && [ -f .env.example ]; then
  log ".env missing — copy .env.example to .env and fill in secrets"
fi

# 2. dev.db — each worktree gets its own copy (SQLite is single-writer)
if [ ! -f dev.db ] && [ -f "$MAIN_WORKTREE/dev.db" ] && [ "$ROOT" != "$MAIN_WORKTREE" ]; then
  log "copying dev.db from $MAIN_WORKTREE"
  cp "$MAIN_WORKTREE/dev.db" dev.db
fi

# 3. node_modules — pnpm hardlinks from global store, fast
if [ ! -d node_modules ] || [ ! -f node_modules/.modules.yaml ]; then
  if command -v pnpm >/dev/null 2>&1; then
    log "pnpm install --prefer-offline"
    pnpm install --prefer-offline
  else
    log "pnpm not found — install via corepack: corepack enable && corepack prepare pnpm@9.15.9 --activate"
    exit 1
  fi
fi

# 4. Prisma client — gitignored, must regenerate per worktree
if [ ! -d src/generated/prisma ]; then
  log "pnpm prisma generate"
  pnpm prisma generate
fi

log "ready — run: pnpm dev"
