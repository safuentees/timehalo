# Officehours — Backlog (Source of Truth)

**This file is the single canonical source of truth for backlog status.** Every commit that closes a deferred item updates this file. Every agent reading this repo (Claude Code, Codex, Cursor, Copilot, Amp, Windsurf, Devin, Jules) reads `AGENTS.md` first; `AGENTS.md` points here for "what's next" and "what shipped."

If you find a backlog claim in any other markdown file (`OFFICEHOURS-*.md`, `CAL-LAB-ROADMAP.md`, etc.), this file overrides it. Those files are archived stubs.

---

## How to maintain this file (the contract)

Every commit that ships a deferred item or introduces a new deferral must touch `BACKLOG.md` in the same commit. Concretely:

1. **Closing an item.** Flip its row's status from `OPEN` → `SHIPPED`. Add the commit SHA in the *Closed by* column. The `commit-msg` git hook (`/.githooks/commit-msg`) blocks any commit message that names a backlog ID (e.g. `B7`, `A12`) when `BACKLOG.md` is unchanged in the staged diff.

2. **Introducing a new deferral.** Add a row to the relevant tier (A inward / B feature / C signal-gated). Use the next free ID in that tier (B14, B15, …). The commit body that introduces the deferral must include `Defers: <new-id>` so future audits trace back.

3. **Re-categorizing.** If an item moves tier (e.g. an OPEN B-item gets demoted to C because the signal hasn't arrived), edit the row inline. Note the move in the *Notes* column.

4. **Decision-first items.** Items marked `DECISION-FIRST` block on a product call, not engineering. Don't start work; surface the decision to the user.

5. **Don't delete rows.** Closed items stay in the table. The whole point is auditability.

---

## Project identity (one paragraph)

Officehours is a single-host scheduling app inspired by Cal.com. **Small visible surface, deep production-engineering stack.** The user-visible product is one host's `/h/<handle>` page where visitors book 15-minute slots. Underneath: idempotency, audit logs, rate limiting, webhooks, soft delete, SSE live queue, attribution cookies, feature flags, observability — every primitive a real SaaS ships invisibly. The backlog below is what's left to make the surface complete; the deep-stack work was finished in the §10.1 wave (commits `60c7e25` → `f6972cd`).

---

## Status legend

- `SHIPPED` — landed in the named commit, verified by tests.
- `OPEN` — engineering ready, blocking on no external dependency. Pick from these.
- `DECISION-FIRST` — engineering ready, blocked on a product call (charge users? require SSO?). Don't start without the call.
- `SIGNAL-GATED` — engineering real, but only worth maintaining when a measurable signal arrives (real prod traffic, p95 above threshold, user request). Don't speculatively start.
- `DEFERRED-BY-DESIGN` — explicitly fenced off in a doc with trigger conditions. See referenced doc.

---

## §10.1 — Production primitives (foundation)

Items 1–10 from the original priority list. All shipped, no open deferrals.

| # | Item | Status | Closed by |
|---|---|---|---|
| 10.1.1 | Idempotency on `bookings.create` | SHIPPED | `60c7e25` |
| 10.1.2 | `BookingAudit` on every state change | SHIPPED | `bcce9e7` |
| 10.1.3 | Rate limit on `bookings.create` per IP | SHIPPED | `6bf7e71` |
| 10.1.4 | ICS download from confirmation page | SHIPPED | `4778d86` |
| 10.1.5 | Selective `withSpan` observability + Sentry | SHIPPED | `b9f4301` + `091af84` |
| 10.1.6 | WebhookSubscription + delivery cron | SHIPPED | `59db28e` + `42e34f9` + `dc8f592` |
| 10.1.7 | Soft delete + cleanup cron | SHIPPED | `032e88b` + `8806b0d` |
| 10.1.8 | SSE live host queue | SHIPPED | `ed2510a` + `c4efce7` |
| 10.1.9 | Attribution `?ref=` cookie | SHIPPED | `1121db4` |
| 10.1.10 | Feature flags (`Feature` + `UserFeatures`) | SHIPPED | `f6972cd` |

---

## Tier A — Inward depth (≤ 1 day each)

| # | Item | Status | Closed by | Notes |
|---|---|---|---|---|
| A1 | Real email layer (Resend + React Email + dev sink) | SHIPPED | `dbde851` | A1 of original depth-ideas tier |
| A2 | Env validation via `@t3-oss/env-nextjs` | SHIPPED | `890fa64` | |
| A3 | IANA timezones + DST-aware slots | SHIPPED | `aeb7eb4` | |
| A4 | Account deletion typed-email confirm | SHIPPED | `731d980` | |
| A5 | i18n via `next-intl` | SHIPPED | `9f5073e` | en + es |
| A6 | Onboarding checklist | SHIPPED | `a629577` | |
| A7 | Visitor-driven reschedule (procedure) | SHIPPED | `040a33f` | UI followed in A9 below |
| A8 | Reminder email job | SHIPPED | `2ea6380` | Migrated to editable Workflow at `238771c` |
| A9 | Admin operator surface | SHIPPED | `7259763` | |
| A10 | Structured JSON logger | SHIPPED | `b89ac84` | |
| A11 | Cleanup-cron retention tests | SHIPPED | `19649d2` | |
| A12 | Composable test factories | SHIPPED | `59cefbd` | |
| A13 | Theme picker (light/dark/system) | SHIPPED | `980d9e1` | |
| A14 | Brutalist error pages (404/500) | SHIPPED | `b63c921` | |
| A15 | `/api/health` + `/api/ready` | SHIPPED | `5aa8d3c` | |

### Post-§10.1 / commit-flagged Tier A (each ≤ 1 day)

| # | Item | Status | Closed by |
|---|---|---|---|
| A.PT1 | `WORKSPACE_SLUG_MAX` module unification | SHIPPED | `75e9171` |
| A.PT2 | Scalar UI for `/api/openapi.json` | SHIPPED | `d18c156` |
| A.PT3 | Per-key rate limiting on `/api/v1/*` | SHIPPED | `83a3d40` |
| A.PT4 | Mocked-adapter calendar integration test | SHIPPED | `0d36527` |
| A.PT5 | Adjacent-booking prev/next nav | SHIPPED | `0ff29f1` |
| A.PT6 | Webhook delivery list on detail page | SHIPPED | `0ff29f1` |
| A.PT7 | Sheet drawer for `/bookings/[publicUid]` | SHIPPED | `0ff29f1` |
| A.PT8 | Resolve orphan `calendar-sync` plan gate | SHIPPED | `dfdaf46` |
| A.PT9 | Visitor-facing reschedule UI | SHIPPED | `7bcdcfa` |

---

## Tier B — Real systems (2–5 days each)

| # | Item | Status | Closed by | Notes |
|---|---|---|---|---|
| B1 | Workspaces foundation (schema + RBAC + invites) | SHIPPED | `2306114` | |
| B2 | Public API + OpenAPI + API keys | SHIPPED | `7df9072` | |
| B3 | Calendar busy-time sync (Google + Outlook) | SHIPPED | `ef65c97` | |
| B4 | Workflows engine | SHIPPED | `1dbab8b` | |
| B5 | Workspace UI pages (list / members / invite-accept) | SHIPPED | `e69f1ca` | |

### Post-§10.1 / commit-flagged Tier B

| # | Item | Status | Closed by | Notes |
|---|---|---|---|---|
| B.PT1 | Workspace-aware webhooks + audit | SHIPPED | `f3a1cf6` | |
| B.PT2 | Calendar two-way write | SHIPPED | `1a006f9` | |
| B.PT3 | Stripe checkout + portal procedures | SHIPPED | `e76402d` | |
| B.PT3-UI | Billing settings UI section + plan-gate inline prompts | SHIPPED | `63c4553` | |
| B.PT4 | `/workspaces/<slug>/event-types` page | SHIPPED | `1f5b93a` | |
| B.PT5 | Workspace lifecycle four-pack (rename / delete / leave / transfer) | SHIPPED | `304eb36` | |
| **B.PT6** | **Global workspace context switcher (cookie-stored)** | **OPEN** | — | Top-bar dropdown shipped at `c9df11a` but doesn't switch global state. Threads cookie through tRPC context. ~250 LOC, 2 days. |
| **B.PT7** | **`/workspaces/<slug>/settings` page** | **OPEN** | — | Natural home for B.PT5's lifecycle procedures. ~200 LOC, 1–2 days. **Highest leverage immediate item** — without it, B.PT5's procedures are tRPC-only, invisible to users. |
| **B.PT8** | **Resend + edit-pending-invite-role procedures + UI** | **OPEN** | — | ~80 LOC, half day each. |
| **B.PT9** | **Bulk invite (`workspaces.inviteMany`)** | **OPEN** | — | ~120 LOC, 1 day. |
| **B.PT10** | **Multi-step workflows (`WorkflowStep` chains)** | **OPEN** | — | ~350 LOC, 3 days. cal.com `/packages/features/ee/workflows/` is the reference. |
| **B.PT11** | **SMS / Slack / Discord workflow actions** | **OPEN** | — | ~150 LOC per provider, 1 day each. |
| **B.PT12** | **Calendar conflict → round-robin `excludeHostIds` integration** | **OPEN** | — | Joins B.PT2 (calendar busy times) + B.PT4 (event-type pools). No new schema. ~80 LOC, half day. |
| **B.PT13** | **Distribution fairness lookback decay (cron)** | **OPEN** | — | `EventTypeHost.recentAssignments` cron decay. ~60 LOC, half day. Wait for round-robin usage signal. |
| **B.PT14** | **Upstash Redis swap for `createRatelimit`** | **SIGNAL-GATED** | — | `src/lib/rate-limit.ts:108` carries a memory-only fallback today. When prod traffic justifies multi-instance limiting, branch on `UPSTASH_REDIS_REST_URL` and return a Redis-backed Limiter with the same return shape — caller code doesn't change. ~40 LOC, half day. Trigger: multi-instance serverless deploy where the in-memory map can't share state across processes. |

---

## Tier C — Portfolio stretch / signal-gated (don't speculatively start)

| # | Item | Status | Notes |
|---|---|---|---|
| C1 | Embed widget | SHIPPED `07bd093` | |
| C2 | Stripe billing infra | SHIPPED `6d37510` | |
| C3 | Round-robin algorithm | SHIPPED `6307d5b` | Schema landed at B.PT4 (`5b8914e`). |
| C4 | Magic-link auth | SHIPPED `8f9bde3` | UI at `88b8812`. |
| C5 | Cache-aside for `/h/[handle]` | DEFERRED-BY-DESIGN | `docs/C5-cache-aside-deferred.md` documents trigger conditions (p95 > 800ms, sustained > 5 reads/s, or Postgres migration). |
| C6 | Public status page | SHIPPED `29787cc` | |
| **C.PT1** | Calendar push notifications + circuit breaker | SIGNAL-GATED | Wait for prod traffic justifying channel ops. |
| **C.PT2** | Status page historical uptime charts | SIGNAL-GATED | Pick metric sink (BetterUptime / Vercel / UptimeRobot). |
| **C.PT3** | Status page per-check telemetry | SIGNAL-GATED | Same metric sink as C.PT2. |
| **C.PT4** | Status page public incidents feed | SIGNAL-GATED | Same dependency. |
| **C.PT5** | Embed prerender (invisible iframe ahead of click) | SIGNAL-GATED | Wait for user demand for hidden embeds. |
| **C.PT6** | Embed command queue (`parent.OH.send({...})`) | SIGNAL-GATED | Wait for parent-side command demand. |
| **C.PT7** | Embed booked event handlers (`onBooked` callback) | SIGNAL-GATED | Cross-route postMessage + parent-side hook. |
| **C.PT8** | Better-auth migration evaluation | DECISION-FIRST | Wait for 2FA / SSO / enterprise SSO requirement. Existing-session migration risk is real. |
| **C.PT9** | Postgres-mode CI workflow (`prisma migrate diff`) | SIGNAL-GATED | Gated on dev.db → Postgres move itself, which isn't planned. |

---

## What's next (auto-derived)

Pick from `OPEN` rows above, in this priority order:

1. **B.PT7** — `/workspaces/<slug>/settings` page. Highest leverage. Surfaces the brand-new lifecycle procedures (B.PT5) to users. 1–2 days.
2. **B.PT12** — calendar conflict → round-robin. Cheap. Joins two recently-landed surfaces. Half day.
3. **B.PT6** — workspace context switcher. Ties B.PT1 (workspace-aware webhooks/audit) + B.PT4 (event-types) into a coherent navigation. 2 days.
4. **B.PT8** — resend + edit-role invite. Half day each, tiny procedures.
5. **B.PT9** — bulk invite. 1 day.

Tier C items wait for their gating signal.

---

## Live `TODO` comments in source

Run `rg "TODO" src/` to surface. The codebase carries no live `TODO(...)` markers anymore — the previous rate-limit.ts marker was promoted to B.PT14 (above) and the comment rewritten to reference the BACKLOG row.

| File:line | Note | Tracked as |
|---|---|---|
| `src/lib/rate-limit.ts:108` | Now a forward-looking comment referencing `B.PT14`, no longer a `TODO()` | B.PT14 |
| `src/lib/event-types.ts:13` | v1 backfill note (singleton EventType per existing User) | Implicitly closed at `5b8914e`. Comment can be removed in any drive-by edit. |

---

## Why this file replaces the older docs

- `OFFICEHOURS-PROJECT-GUIDE.md` — project philosophy now lives in `AGENTS.md` + `.claude/rules/`. The §10.1 priority list is summarized in this file's first section.
- `OFFICEHOURS-DEPTH-IDEAS.md` — Tier A/B/C originals fold into this file's Tier A/B/C tables.
- `OFFICEHOURS-FOLLOWUPS.md` — same; rolled into the Post-§10.1 sub-tables.
- `OFFICEHOURS-OPEN-DEFERRALS.md` — replaced wholesale; this file IS the open-deferrals view.
- `OFFICEHOURS-CLI-IDEAS.md` — moved to `docs/cli-design.md`. Different concern (design exploration for a CLI surface).
- `OFFICEHOURS-IMPLEMENTATION-AGENT-PROMPT.md` — moved to `docs/implementer-agent-prompt.md`. Different concern (reusable system prompt for a managed agent).

The three stub redirect files (`OFFICEHOURS-DEPTH-IDEAS.md`, `OFFICEHOURS-FOLLOWUPS.md`, `OFFICEHOURS-OPEN-DEFERRALS.md`) were hard-deleted via `git rm` after the consolidation commit. To recover the original content of any of those, run:

```bash
git log --diff-filter=D -- OFFICEHOURS-<NAME>.md       # find the deletion commit
git show <commit>^:OFFICEHOURS-<NAME>.md > restored.md  # restore from one commit before
```

`OFFICEHOURS-PROJECT-GUIDE.md` is gitignored (private to user) and was preserved with a small note pointing here for status. Long-form mental model stays in that file.
