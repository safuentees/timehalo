#!/usr/bin/env bash
# B.PT88 — wrap `stripe listen` so its output goes to both the
# terminal AND `logs/stripe.log`. Forwards webhook events to the
# project's local endpoint via the cloudflared tunnel
# (https://dev.safuentes.dev/api/stripe/webhook).
#
# Usage: ./scripts/stripe-logged.sh   OR   pnpm stripe:logged
#
# CLI signing-secret is printed on first connection; copy it into
# .env's STRIPE_WEBHOOK_SECRET so signature verification matches.
# (The Dashboard's webhook signing secret is a DIFFERENT value;
# use whichever path actually delivers events to the dev server.)
set -euo pipefail
mkdir -p logs
FORWARD_TO="${STRIPE_FORWARD_TO:-https://dev.safuentes.dev/api/stripe/webhook}"
echo "[stripe-logged] forwarding to $FORWARD_TO" | tee -a logs/stripe.log
exec stripe listen --forward-to "$FORWARD_TO" 2>&1 | tee -a logs/stripe.log
