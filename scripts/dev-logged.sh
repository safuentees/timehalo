#!/usr/bin/env bash
# B.PT88 — wrap `pnpm dev` so its output goes to BOTH the terminal
# (interactive use as before) AND `logs/web.log` (so Claude Code can
# Read it). Drop-in replacement for `pnpm dev` when you want the
# agent to see the dev server's stdout + stderr.
#
# Usage: ./scripts/dev-logged.sh   OR   pnpm dev:logged
#
# The log file is appended-to, not overwritten — `pnpm logs:clear`
# resets all log files at once. `concurrently` (used by `pnpm
# dev:full`) already line-buffers each child's output (it has to,
# to prefix lines with [web]/[stripe]/[tunnel]) so explicit
# unbuffering is unnecessary in that mode. Standalone use through
# `tee` block-buffers at 4KB which is fine for log inspection;
# Next.js emits enough output that the buffer flushes within
# seconds. If you need the interactive Next spinner, run plain
# `pnpm dev` instead — `dev:logged` is specifically for when you
# want the agent-readable log file.
set -euo pipefail
mkdir -p logs
exec pnpm dev 2>&1 | tee -a logs/web.log
