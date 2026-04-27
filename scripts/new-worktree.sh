#!/usr/bin/env bash
# Create a new git worktree under .claude/worktrees/<branch> and bootstrap it.
# One-command setup for an agent: branch + checked-out code + .env + db +
# deps + prisma client + migrations + verification.
#
# Usage:
#   ./scripts/new-worktree.sh <branch-name> [--from <base-branch>]
#
# Examples:
#   ./scripts/new-worktree.sh feat/email-layer
#   ./scripts/new-worktree.sh fix/race --from main

set -euo pipefail

BRANCH="${1:-}"
[ -n "$BRANCH" ] || { echo "usage: $0 <branch-name> [--from <base-branch>]" >&2; exit 1; }
shift

BASE="main"
if [ "${1:-}" = "--from" ]; then
  BASE="${2:?--from needs a base branch}"
  shift 2
fi

ROOT=$(git rev-parse --show-toplevel)
SAFE_BRANCH=$(echo "$BRANCH" | tr '/' '-')
WT_PATH="$ROOT/.claude/worktrees/$SAFE_BRANCH"

log() { printf '\033[36m[new-worktree]\033[0m %s\n' "$*" >&2; }

if [ -d "$WT_PATH" ]; then
  log "$WT_PATH already exists — bootstrapping in place"
else
  log "git fetch origin $BASE"
  git fetch --quiet origin "$BASE" || true
  log "creating worktree at $WT_PATH from $BASE"
  if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git worktree add "$WT_PATH" "$BRANCH"
  else
    git worktree add -b "$BRANCH" "$WT_PATH" "$BASE"
  fi
fi

log "running bootstrap"
( cd "$WT_PATH" && ./scripts/bootstrap.sh )

log "done — cd $WT_PATH"
