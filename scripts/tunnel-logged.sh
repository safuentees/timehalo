#!/usr/bin/env bash
# B.PT88 — wrap `cloudflared tunnel run` so its output goes to both
# the terminal AND `logs/tunnel.log`. The tunnel name is read from
# CLOUDFLARED_TUNNEL_NAME (default `safuentes-dev`) so future deploys
# with a different tunnel can swap via env without script edits.
#
# Usage: ./scripts/tunnel-logged.sh   OR   pnpm tunnel:logged
set -euo pipefail
mkdir -p logs
TUNNEL_NAME="${CLOUDFLARED_TUNNEL_NAME:-safuentes-dev}"
echo "[tunnel-logged] running tunnel: $TUNNEL_NAME" | tee -a logs/tunnel.log
exec cloudflared tunnel run "$TUNNEL_NAME" 2>&1 | tee -a logs/tunnel.log
