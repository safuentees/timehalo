# Dev tooling architecture (B.PT88+)

Goal: give Claude Code (and the human dev) one-call access to every
running console + DB + Stripe state in this project. Without it,
debugging anything that crosses service boundaries (Stripe webhook
arrival, cron processing, tunnel routing) requires context-switching
between 3-4 terminals + the Stripe Dashboard + dev.db SQL by hand.

## Layered design

| Phase | What ships | Cost | Status |
|---|---|---|---|
| **1** | Per-service log wrappers + `pnpm dev:full` orchestrator | ~15 min | **B.PT88** |
| **2** | `StripeEvent.data` payload + `/admin/debug/billing/[slug]` page + replay endpoint | ~1 hr | TODO |
| **3** | Custom local stdio MCP server (`scripts/dev-mcp/`) — `tail_log`, `recent_events`, `query_db`, `app_state`, `stripe_state`, `replay_stripe_event` tools | ~3-4 hrs | TODO |
| **4** | Pino → JSONL sink + cross-service correlation IDs (re-use `operationId`) | ~1 hr | TODO |

## Phase 1 — log file aggregation

Three wrapper scripts under `scripts/` pipe each service's stdout +
stderr through `script -q /dev/null` (preserves line buffering when
output is piped) into `logs/<service>.log` while still printing to
the operator's terminal. The `script` invocation is the macOS-flavor
form (`script -q FILE COMMAND`); contributors on Linux need the
`script -qfc COMMAND FILE` form per `script(1)`.

```text
scripts/dev-logged.sh     → logs/web.log     (Next dev server)
scripts/stripe-logged.sh  → logs/stripe.log  (Stripe CLI listen)
scripts/tunnel-logged.sh  → logs/tunnel.log  (cloudflared tunnel)
```

Run them individually in your existing terminal-per-service workflow,
or run all at once with `pnpm dev:full` (uses `concurrently`,
prefixed colored output, `--kill-others-on-fail` so a tunnel crash
takes down the dev server too — fail-loud > fail-silent for dev).

`pnpm logs:tail` follows all three in one window. `pnpm logs:clear`
resets everything between debugging sessions.

The agent reads logs via the `Read` tool — no MCP needed for Phase 1.

## Phase 2 — `StripeEvent.data` + admin debug surface (planned)

**Schema**: `StripeEvent` currently stores `id` + `type` only — the
full payload is dropped after dedup. That makes event replay
impossible (we can't reconstruct what Stripe sent). Adding `data Json`
unblocks: `replay_stripe_event(eventId)` re-runs the handler against
the stored body without re-doing checkout, and a `/admin/debug/...`
page can render the actual payload that webhook saw.

**Admin page**: `/admin/debug/billing/[slug]` mirrors the
`/admin/audit/[bookingUid]` pattern. Renders for the workspace:

- The `Subscription` row (raw fields)
- Computed `planForWorkspace()` — what the gates resolve
- Last 20 `StripeEvent` rows (id, type, processedAt, payload preview)
- Last 20 `Task` rows scoped to webhook deliveries for this workspace
- Live Stripe API state (customer + subscriptions + latest invoice)

**Replay endpoint**: `POST /api/dev/replay-stripe-event/[id]` —
env-gated (`NODE_ENV !== "production"`). Posts the stored payload
through the webhook handler. For iterating on handler logic without
the cost of re-doing checkout.

## Phase 3 — Custom local MCP (planned)

`scripts/dev-mcp/index.ts` — TypeScript stdio MCP via
`@modelcontextprotocol/sdk`, registered in `.mcp.json` at project
root so Claude Code auto-loads it.

**Tools**:

- `tail_log({ service: 'web' | 'stripe' | 'tunnel', lines?, since? })` — read N lines from a log file, optionally filtered by ISO timestamp range.
- `recent_events({ seconds })` — merged time-window across all log files. Output is `[{ ts, service, line }]` sorted ascending. The "what happened in the last 30s" view.
- `query_db({ sql, params? })` — readonly SQL on `prisma/dev.db`. Validated as `SELECT`-only (parses with `sqlite-parser` or rejects on non-SELECT keywords).
- `app_state({ workspaceSlug })` — shorthand for the most-asked debug query: workspace + sub + recent events + recent tasks + computed plan, all in one call.
- `stripe_state({ workspaceSlug })` — live Stripe API call: `customers.retrieve` + `subscriptions.list` + `invoices.list` for the customer associated with the workspace.
- `replay_stripe_event({ eventId })` — POSTs the stored event payload via `/api/dev/replay-stripe-event/[id]`.
- `restart_service({ name })` — kills the matching `*-logged.sh` process via `pkill -f` and emits a hint that the operator should re-run it (we don't auto-restart because `concurrently` would pick up the kill via `--kill-others-on-fail` — restarting in-place needs PM-of-PMs which is overkill).

**Resources**:

- `log://web/last-100` / `log://stripe/last-100` / `log://tunnel/last-100` — most recent log lines as a resource readable by the agent.

## Phase 4 — JSONL sink + correlation (planned)

The pino logger today writes human-readable lines to stdout. Adding a
parallel JSONL transport (`pino/file` to `logs/dev.jsonl`) means the
MCP's `recent_events` can filter by structured fields:

```ts
recent_events({ seconds: 60, level: 'warn', scope: 'stripe.webhook' })
```

The existing `operationId` (`crypto.randomUUID()` minted at the top of
state-changing procedures) becomes the correlation key — every log
line, every webhook delivery, every Task row carries it. One filter
shows everything that happened because of one click.

## What stays out (and why)

| Considered | Verdict |
|---|---|
| **Overmind / Foreman** | Solid Procfile-based orchestration but requires `brew install`. `concurrently` gives 90% of value with zero install. |
| **MCP filesystem server** | Re-exposes capabilities the agent already has via `Read`/`Bash`. No new leverage. |
| **MCP SQLite server** | Useful in isolation, but the custom MCP scopes SQL to `dev.db` only + readonly + paired with Stripe state queries in one call. Tighter contract. |
| **OpenTelemetry / Tempo** | Massive overkill for single-host dev. The JSONL sink + operationId correlation does 90% of what OTel does for this scale. |
| **Tmux session multiplexing** | I can't attach to tmux through my tool surface. Files-on-disk is what `Read` consumes. |
| **Sentry breadcrumbs to stdout** | Already wired via `instrumentation.ts`. Useful but doesn't aggregate cross-service. Worth flipping on later. |

## Operator workflow once Phase 1 lands

```bash
# Terminal 1 (or backgrounded):
pnpm dev:logged              # Next dev → logs/web.log

# Terminal 2:
pnpm stripe:logged           # Stripe CLI → logs/stripe.log

# Terminal 3:
pnpm tunnel:logged           # cloudflared → logs/tunnel.log

# OR, single terminal:
pnpm dev:full                # all three under concurrently
```

Then in any session:

```bash
pnpm logs:tail               # follow all three live
pnpm logs:clear              # reset between debug sessions
```

Claude Code can now `Read logs/web.log` (etc.) without any pasting.

## Future capabilities (low-effort, high-leverage)

Listed for future-self when Phase 4 lands:

- **Test-data factory MCP tool**: `seed_workspace({ slug, plan, members })` — sets up arbitrary state for repro.
- **Browser console mirror**: `/api/dev/client-log` endpoint + 3-line dev-only `console.log` shim that POSTs client-side errors to the dev server. Land in `logs/web.log` so the agent sees them without DevTools.
- **Time-travel mock**: `?dev_now=...` + a `dev-only` `Date.now()` shim. Reproduce reschedule / expiry / period-end scenarios without waiting real-time.
- **`/admin/debug/<surface>` family**: extend Phase 2's pattern to bookings, tasks, audit, workflows. Each gets a self-serving inspection page.
