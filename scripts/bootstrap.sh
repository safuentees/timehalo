#!/usr/bin/env bash
# Idempotent setup for a fresh worktree (or fresh clone).
# Brings over ignored files git can't carry (.env, dev.db), installs deps,
# generates the Prisma client, applies pending migrations, and verifies
# the client loads. Safe to re-run — fast when state is fresh.
#
# Usage: ./scripts/bootstrap.sh [--force]
#   --force  ignore cached hashes and redo every step

set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
MAIN_WORKTREE=$(git worktree list --porcelain | awk '/^worktree / {print $2; exit}')
cd "$ROOT"

STATE_DIR=".bootstrap-state"
mkdir -p "$STATE_DIR"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log()  { printf '\033[36m[bootstrap]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }
skip() { printf '\033[90m[bootstrap]\033[0m %s\n' "$*" >&2; }

hash_of() { shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'; }
cached()  { [ -f "$STATE_DIR/$1" ] && cat "$STATE_DIR/$1"; }
cache()   { printf '%s' "$2" > "$STATE_DIR/$1"; }

node_version_ok() {
  node -p '
    const [maj, min] = process.versions.node.split(".").map(Number);
    ((maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj >= 24) ? "true" : "false"
  ' 2>/dev/null
}

# Prisma 7's preinstall blocks 23.x and pre-22.12. Only matters when an
# install is about to run. Try to auto-switch via nvm/fnm using .nvmrc.
# The PATH-based discovery (`command -v fnm`) sometimes misses fnm in
# stripped-down subagent shells (worktree-isolated agents) — fall back
# to absolute paths in common install locations as a last resort.
ensure_node_for_install() {
  [ "$(node_version_ok 2>/dev/null)" = "true" ] && return 0

  local FNM_BIN=""
  if command -v fnm >/dev/null 2>&1; then
    FNM_BIN="$(command -v fnm)"
  elif [ -x /opt/homebrew/bin/fnm ]; then
    FNM_BIN=/opt/homebrew/bin/fnm
  elif [ -x /usr/local/bin/fnm ]; then
    FNM_BIN=/usr/local/bin/fnm
  fi

  if [ -n "$FNM_BIN" ] && [ -f .nvmrc ]; then
    log "node $(node -v) unsupported — fnm use (from .nvmrc) via $FNM_BIN"
    eval "$("$FNM_BIN" env --shell bash)"
    "$FNM_BIN" use >/dev/null 2>&1 || ("$FNM_BIN" install && "$FNM_BIN" use) >/dev/null 2>&1 || true
  fi

  if [ "$(node_version_ok 2>/dev/null)" != "true" ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ] && [ -f .nvmrc ]; then
    log "node $(node -v) unsupported — nvm use (from .nvmrc)"
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use >/dev/null 2>&1 || (nvm install && nvm use) >/dev/null 2>&1 || true
  fi

  # Last resort — scan known fnm/nvm install dirs for the .nvmrc-pinned
  # major and prepend it to PATH directly. Useful when fnm/nvm are
  # installed but neither is reachable from the subagent shell.
  if [ "$(node_version_ok 2>/dev/null)" != "true" ] && [ -f .nvmrc ]; then
    local TARGET_MAJOR
    TARGET_MAJOR=$(tr -d '\n\r v' < .nvmrc | cut -d. -f1)
    local CANDIDATES=(
      "$HOME/.local/share/fnm/node-versions/v${TARGET_MAJOR}"*"/installation/bin"
      "$HOME/Library/Caches/fnm_multishells"/*"/bin"
      "$HOME/.nvm/versions/node/v${TARGET_MAJOR}"*"/bin"
    )
    for path_glob in "${CANDIDATES[@]}"; do
      for candidate in $path_glob; do
        if [ -x "$candidate/node" ]; then
          local CAND_MAJ
          CAND_MAJ=$("$candidate/node" -p 'process.versions.node.split(".").map(Number)[0]' 2>/dev/null || echo 0)
          if [ "$CAND_MAJ" = "$TARGET_MAJOR" ]; then
            log "node $(node -v) unsupported — prepending $candidate (absolute fallback)"
            export PATH="$candidate:$PATH"
            break 2
          fi
        fi
      done
    done
  fi

  [ "$(node_version_ok 2>/dev/null)" = "true" ] \
    || fail "node $(node -v 2>/dev/null) unsupported — prisma 7 needs 20.19+, 22.12+, or 24+. Auto-switch via nvm/fnm failed. Run \`nvm install\` (reads .nvmrc) and retry."
  log "switched to node $(node -v)"
}

command -v pnpm >/dev/null 2>&1 || fail "pnpm not found — corepack enable && corepack prepare pnpm@9.15.9 --activate"

# 1. .env — symlink from main worktree so secrets stay in one place
if [ ! -e .env ]; then
  if [ -f "$MAIN_WORKTREE/.env" ] && [ "$ROOT" != "$MAIN_WORKTREE" ]; then
    log "linking .env from $MAIN_WORKTREE"
    ln -s "$MAIN_WORKTREE/.env" .env
  elif [ -f .env.example ]; then
    fail ".env missing — copy .env.example to .env and fill in secrets"
  else
    fail ".env missing and no .env.example to seed from"
  fi
fi

# 2. dev.db — each worktree gets its own copy (SQLite is single-writer).
#    Prisma 7 resolves file:./dev.db relative to prisma.config.ts (repo root).
if [ ! -f dev.db ]; then
  if [ -f "$MAIN_WORKTREE/dev.db" ] && [ "$ROOT" != "$MAIN_WORKTREE" ]; then
    log "copying dev.db from $MAIN_WORKTREE"
    cp "$MAIN_WORKTREE/dev.db" dev.db
  else
    log "dev.db missing — will be created by migrate deploy"
  fi
fi

# 3. node_modules — gate on pnpm-lock.yaml hash
LOCK_HASH=$(hash_of pnpm-lock.yaml)
if [ "$FORCE" = 1 ] || [ "$(cached lock.sha)" != "$LOCK_HASH" ] || [ ! -d node_modules ]; then
  ensure_node_for_install
  log "pnpm install --prefer-offline"
  pnpm install --prefer-offline --silent
  cache lock.sha "$LOCK_HASH"
else
  skip "node_modules up-to-date (lockfile unchanged)"
fi

# 4. Prisma client — gate on schema hash. `prisma generate` is fast (~1s)
#    but we still skip the spawn cost when nothing changed.
SCHEMA_HASH=$(hash_of prisma/schema.prisma)
if [ "$FORCE" = 1 ] || [ "$(cached schema.sha)" != "$SCHEMA_HASH" ] || [ ! -d src/generated/prisma ]; then
  log "pnpm prisma generate"
  pnpm prisma generate --no-hints
  cache schema.sha "$SCHEMA_HASH"
else
  skip "prisma client up-to-date (schema unchanged)"
fi

# 5. Pending migrations — gate on combined migration-dir hash.
MIGRATION_HASH=$(find prisma/migrations -type f \( -name '*.sql' -o -name 'migration_lock.toml' \) -print0 \
  | sort -z | xargs -0 shasum -a 256 2>/dev/null | shasum -a 256 | awk '{print $1}')
if [ "$FORCE" = 1 ] || [ "$(cached migrations.sha)" != "$MIGRATION_HASH" ]; then
  log "pnpm prisma migrate deploy"
  pnpm prisma migrate deploy
  cache migrations.sha "$MIGRATION_HASH"
else
  skip "migrations up-to-date"
fi

# 6. Verify the generated client exists. Prisma 7 emits .ts under
#    src/generated/prisma — runtime import is via tsx/next, so we just
#    confirm the key entry files are present and non-empty.
[ -s src/generated/prisma/client.ts ] && [ -s src/generated/prisma/models.ts ] \
  || fail "generated prisma client missing files — try ./scripts/bootstrap.sh --force"

# 7. Wire .githooks as the hooks dir so the commit-msg backlog guard
#    fires for every contributor. Idempotent — `git config` overwrites
#    on every run; we set it unconditionally because the cost is one
#    syscall and the cost of getting it wrong is silent backlog drift.
git config core.hooksPath .githooks

log "ready — pnpm dev"
