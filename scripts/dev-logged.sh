#!/usr/bin/env bash
# B.PT88 — wrap `pnpm dev` so its output goes to BOTH the terminal
# (interactive use as before) AND `logs/web.log` (so Claude Code can
# Read it). Drop-in replacement for `pnpm dev` when you want the
# agent to see the dev server's stdout + stderr.
#
# Usage: ./scripts/dev-logged.sh   OR   pnpm dev:logged
#
# The log file is appended-to, not overwritten — `pnpm logs:clear`
# resets all log files at once. `script -q /dev/null` fakes a TTY so
# `pnpm dev` (and Next under it) keeps line-buffered output instead
# of switching to block-buffered when piped — without that, log
# tails can lag minutes behind reality during a quiet stretch.
set -euo pipefail
mkdir -p logs
# `script` invocation is macOS-flavored (`script -q FILE COMMAND`).
# On Linux flip the args (`script -qfc COMMAND FILE`) but the
# repo's primary dev environment is macOS so this is the supported
# path. If a Linux contributor lands, copy the snippet from the
# `script(1)` man page.
exec script -q /dev/null pnpm dev | tee -a logs/web.log
