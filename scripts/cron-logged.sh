#!/usr/bin/env bash
# B.PT88 follow-up — wrap `pnpm dev:cron` so its output goes to both
# the terminal AND `logs/cron.log`. The cron poller drains the Task
# queue every 10s (default) — without it, scheduled emails (workspace
# invites, booking reminders) and calendar writes pile up forever.
#
# Usage: ./scripts/cron-logged.sh   OR   pnpm cron:logged
#
# Production drains via Vercel Cron. Locally this script polls the
# same `/api/cron/process-tasks` endpoint with the CRON_SECRET header.
# Skips logging when processed=0 (no spam on idle ticks).
set -euo pipefail
mkdir -p logs
exec pnpm dev:cron 2>&1 | tee -a logs/cron.log
