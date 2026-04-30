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
| B.PT6 | Global workspace context switcher (cookie-stored) | SHIPPED | _to be filled by commit_ | `oh_active_workspace` cookie + Next 15 server action + `ctx.activeWorkspaceSlug` + `workspaces.list` returns `isActive` per row. Top-bar dropdown clicks set the cookie via the action then `router.refresh()` + navigate. Settings + billing + api-keys + workflows defaults now respect the active row. Falls back to first-by-membership when cookie unset or stale. |
| B.PT7 | `/workspaces/<slug>/settings` page | SHIPPED | _to be filled by commit_ | Surfaced B.PT5's lifecycle four-pack via four sections (general / transfer / leave / danger). Typed-confirm dialog on delete mirrors `delete-account-dialog.tsx`. |
| B.PT8 | Resend + edit-pending-invite-role procedures + UI | SHIPPED | _to be filled by commit_ | New `workspaces.resendInvitation` (rotates token + refreshes expiry + re-enqueues email with `:resend:<ts>` referenceUid) and `workspaces.updateInvitationRole` (same role rules as invite). Members-panel InvitationRow gains an inline role select + Resend button alongside the existing Revoke. 5 new vitest cases. |
| B.PT9 | Bulk invite (`workspaces.inviteMany`) | SHIPPED | _to be filled by commit_ | New `workspaces.inviteMany({ slug, invites: [{email, role}, ...] })` — all-or-nothing batch with one cap-check + per-row role-rule pre-pass + one transaction for all rows. Members-panel invite dialog refactored from single-row to `useFieldArray`. 5 new vitest cases. |
| B.PT10 | Multi-step workflows (`WorkflowStep` chains) | SIGNAL-GATED | — | ~350 LOC, 3 days. cal.com `/packages/features/ee/workflows/` is the reference. The schema branch (linear chain vs. fan-out vs. conditional steps) doesn't have a load-bearing use case yet — single-action rules already cover 90% of the value. Promote when a real "schedule X then Y" need surfaces. |
| B.PT11 | SMS / Slack / Discord workflow actions | SIGNAL-GATED | — | ~150 LOC per provider, 1 day each. Provider choice IS the design call (Twilio vs. SignalWire for SMS; webhook URL vs. OAuth app for Slack/Discord). Webhook actions are the existing escape hatch. Promote when a customer names the provider they want native. |
| B.PT12 | Calendar conflict → round-robin `excludeHostIds` integration | SHIPPED | _to be filled by commit_ | New `findBusyHostIds` helper in `src/lib/calendar/index.ts`; bookings.create's multi-host branch merges its result into excludeHostIds before selectHost. ISO-string overlap (no Date allocation), Promise.allSettled soft-fail per host. 2 new test cases extend round-robin-integration.test.ts. |
| B.PT13 | Distribution fairness lookback decay (cron) | SIGNAL-GATED | — | `EventTypeHost.recentAssignments` cron decay. ~60 LOC, half day. Window length (7d? 30d?) and decay shape (fixed window vs. exponential) need real round-robin usage data — single-host-per-event-type backfilled accounts don't generate the signal. Promote when multi-host event types accumulate enough bookings that distribution skew is measurable. |
| **B.PT14** | **Upstash Redis swap for `createRatelimit`** | **SIGNAL-GATED** | — | `src/lib/rate-limit.ts:108` carries a memory-only fallback today. When prod traffic justifies multi-instance limiting, branch on `UPSTASH_REDIS_REST_URL` and return a Redis-backed Limiter with the same return shape — caller code doesn't change. ~40 LOC, half day. Trigger: multi-instance serverless deploy where the in-memory map can't share state across processes. |
| **B.PT15** | **Chrome rename refactor (`bru-*`/`Brutalist*` → `oh-*`/`Oh*`)** | **SHIPPED** | (this commit) | The visual identity walked away from the brutalist aesthetic; file/class/component names now follow. **Stages**: ✅ stage 1 (CSS vars) `91b48a6`; ✅ stage 2 (CSS classes) `0df78e2`; ✅ stage 3 (components + dir move) `371c25d`; ✅ stage 4 (button variants + `ease-bru`) `c9b410c`; ✅ stage 5 (file renames via `git mv`) `9ba791b`; ✅ stage 6 (doc-text body cleanup `Brutalist`/`bru-` → `Oh`/`oh-` across active reference docs + variant references in `dashboard-forms.md` + `globals.css` `BrutalistEmpty` comment + flip SHIPPED). All gates green after every stage. Residual prose mentions of "brutalist" describe the historical aesthetic — kept intentionally. |
| **B.PT16** | **Workspace-scoped booking reads + SSE channel** | **SHIPPED** | _to be filled by commit_ | `bookings.listForHost` filters by the host's active workspace via the new `resolveActiveWorkspaceId(userId, slug)` helper (falls back to oldest membership when the cookie is unset/stale, mirroring `workspaces.list`'s `effectiveSlug` invariant). Adjacent prev/next nav inside `getDetail` filters by the booking's *own* `workspaceId` so bookmarks stay coherent regardless of which workspace happens to be active. SSE channel format becomes `host:<userId>:ws:<workspaceId>` (B.PT16) — a multi-workspace host only sees events for the workspace they're viewing. Subscribers reconnect on workspace switch (B.PT17 broadens the cache invalidation). 6 new vitest cases in `bookings-list-for-host.test.ts` + new cross-workspace channel-isolation case in `bus.test.ts`. All gates green. |
| **B.PT17** | **Smart switcher route + broad invalidation** | **SHIPPED** | _to be filled by commit_ | `OhDashboardBar.handlePick` no longer force-navigates to `/workspaces/<slug>/members` after every click. New pure helper `nextHrefAfterWorkspaceSwitch(path, oldSlug, newSlug)` (in `src/lib/active-workspace.ts`) decides: if the current path is bound to the old workspace's slug under `/workspaces/<oldSlug>/...`, rewrite the slug segment in place; otherwise stay. Cache invalidation broadened from `utils.workspaces.list.invalidate()` to `utils.invalidate()` (no filter) so every client-cached query — `bookings.listForHost`, `apiKeys.list`, `billing.currentPlan`, `eventTypes.list`, the SSE subscription itself — re-reads with the new ctx. `ApiKeysFields` + `BillingFields` reset their local `pickedSlug` override when the active slug changes, via React 19's setState-during-render pattern (no useEffect, no lint-rule violation). 11 unit-test cases cover the route helper. All gates green incl. authed-page hydration smoke. |
| **B.PT18** | **Workflow scope — keep personal, fix UI gate (option A)** | **SHIPPED** | _to be filled by commit_ | Decision: **option A** — workflows stay user-scoped; the inconsistency was a UI bug. Server gate already used `planForUser` (`workflows.ts:66`), which keys off the user's primary workspace. UI was using `billing.currentPlan({ slug: activeWorkspaceSlug })`, which keyed off the topbar's active workspace and flipped the lock icon on a list whose contents never changed. Replaced with new `users.plan` query that mirrors the server-side `planForUser` resolution. Switching workspace via the topbar no longer changes the workflow lock state. 3 new vitest cases in `plan-gating.test.ts`. ~40 LOC. The future migration path (workspace-scoped workflows, optionally cal.com-style dual-FK) is tracked as **B.PT19**. |
| **B.PT19** | **Workspace-scoped workflows (option B / cal.com dual-FK)** | **SIGNAL-GATED** | — | Future expansion of B.PT18. Two shapes worth considering when the signal arrives: **(B-only)** add `Workflow.workspaceId` non-null + data migration backfilling from `User.ownedWorkspaces[0]` + procedure rewrite + UI list scope. ~250 LOC + migration. **(B2 — cal.com pattern)** add `Workflow.workspaceId String?` *and* keep `userId String?`, both nullable, with a check constraint that exactly one is set (`packages/prisma/schema.prisma` `@@check([userId IS NULL] != [teamId IS NULL])` shape). Lets a host keep "personal automations across all my workspaces" alongside "automations only for workspace X". ~350 LOC, more migration ceremony, real upside if multi-workspace hosts ever ask for "different reminders per workspace." Promote when a multi-workspace host says "I want a different SMS workflow on my client workspace than on my internal one" — the signal is "the user notices the absence of per-workspace scope." Until then, `Workflow.userId` only is the right shape. |
| B.PT20 | Top-bar user-profile menu (avatar dropdown) | SHIPPED | _to be filled by commit_ | New `OhUserMenu` mounts opposite the workspace switcher in the dashboard bar (`justify-between`). Identity header (avatar + name + email + handle pill linking to `/h/<handle>`), grouped account links (`/profile`, `/settings`), preferences submenus (theme via `next-themes`, language via `setLocaleAction`), `/status` + admin-gated `/admin` (reuses A9's `isAdminHandle`), destructive Sign out via `next-auth/react`. `users.me` extended with `name`, `image`, `isAdmin`. Same Base UI Menu primitive + popup styling as the workspace switcher so the bar reads as one chrome surface. (Originally landed as `BrutalistUserMenu`/`B.PT15` on `feat/ui-expose`; renumbered to B.PT20 + identifier-renamed during rebase onto the B.PT15 chrome rename.) |
| B.PT21 | Contextual sidebar (route-driven sub-nav) + `/settings` split + InlineFormSave | SHIPPED | _to be filled by commit_ | Sidebar nav set is now a function of `usePathname()` via `navGroupsForPath()` in `src/lib/brutalist.ts` — `/settings/*` swaps in a `Back to app` + ACCOUNT/WORKSPACE/DANGER group set; everything else renders the main app nav. `/settings` is now a hub of six sub-routes (`general`, `workflows`, `calendars`, `developer`, `billing`, `danger`); each carries its own SSR prefetch + HydrationBoundary, mirroring cal.com's `settings/*` topology. Settings entry point moved out of the sidebar into a gear icon (paired with a Bookings home shortcut) next to the user menu in `OhDashboardBar`. OAuth callbacks (Google + Microsoft calendar) and Stripe checkout/portal redirect URLs updated to land on the matching sub-page so toast/state flows survive the split. Sticky `OhSaveBar` deleted in favor of a new `<InlineFormSave>` rendered inline at the form column footer (cal.com `SectionBottomActions` + dub.co `Form` pattern); `/profile` and `/availability` now commit through it. Hydration spec covers `/settings/general` (default landing) + `/settings/billing` (workspace-scoped eager-nested prefetch — most likely to drift). |
| B.PT22 | Auth re-skin (`/login` + `/register`) + password reveal | SHIPPED | _to be filled by commit_ | Pre-auth surface walked away from the stock-shadcn aesthetic that contradicted the rest of the app on first touch. Both `/login` + `/register` now sit in a paper-on-ink shell (`--oh-frame` bg + `--oh-paper` ink-bordered card), use `oh-input` for native inputs, `oh-legend` for labels, `oh` / `ohGhost` button variants. Password fields wrap shadcn `<InputGroup>` + `<InputGroupButton>` with `Eye`/`EyeOff` toggle (cal.com `login-view.tsx:274-291` pattern, mirrored on both pages). Register page gets parity GitHub button + RHF `setFocus("email"/"handle")` on CONFLICT so the user lands directly on the rejected field. Magic-link form gains a "Use a different email" reset on success state — the prior dead-end was an audit finding. Credentials redirect changed from `router.push("/")` (double-redirect through index) to `router.push("/bookings")`. Playwright `e2e/auth.setup.ts` selectors stay stable: `name="email"` / `name="password"` + button text `"Sign in"` are load-bearing for cached auth. i18n deferred to **B.PT25** (full auth-surface i18n sweep). |
| B.PT23 | Mobile-reachable sidebar via top-bar `SidebarTrigger` | SHIPPED | _to be filled by commit_ | Audit `§2.1 / §4.1` finding: shadcn's `Sidebar` primitive renders a Sheet at `<md` and toggles via `useSidebar().toggleSidebar()`, but no opener was wired into the chrome — the mobile sheet was unreachable. `OhDashboardLayout` restructured so `SidebarProvider` is now the outer wrapper (was `<div className="oh-app-shell">` outside provider, now `<SidebarProvider className="oh-app-shell">`). The provider's wrapper div composes `flex min-h-svh w-full` (shadcn) with `display:flex; flex-direction:column; height:100svh; background:var(--oh-frame)` (`.oh-app-shell`), giving the column shell + sidebar context in one. Inner row container `<div className="oh-app flex min-h-0 flex-1">` carries the sidebar+inset row. `OhDashboardBar` now renders a `<SidebarTrigger>` as its first child at `md:hidden`, sized to match the gear/bookings icon-link rhythm (28×28, `--oh-r-xs`, muted-ink → ink hover). Orphan `src/components/oh/topbar.tsx` deleted (was never rendered after the chrome consolidation). `e2e/hydration-authed.spec.ts` 5/5 routes hydrate clean against the new layout. |
| B.PT24 | Per-route `loading.tsx` skeletons across host pages | SHIPPED | _to be filled by commit_ | Audit `§4.3` finding: the project shipped zero `loading.tsx` segments, so every page-to-page navigation held the previous frame for the full SSR round-trip. cal.com (`apps/web/app/(use-page-wrapper)/(main-nav)/availability/loading.tsx` etc.) and dub.co (`apps/web/app/app.dub.co/(dashboard)/loading.tsx`) both stream skeletons here. Five new loading.tsx files: `bookings/`, `availability/`, `workspaces/`, `profile/`, and `settings/` (the settings one covers all six sub-routes via App Router segment inheritance). Each renders the live page's `<OhPageShell>` + `<OhPageHeader title="…">` frame with route-shaped `<Skeleton>` blocks underneath (3 booking rows, 2 day-blocks + Save row, 3 workspace rows, 2 field blocks, handle field + Save row) so the layout doesn't jump when the real content hydrates. Skeleton primitive at `src/components/ui/skeleton.tsx` already existed. Title strings hardcoded English here — cleaned up in **B.PT26** i18n sweep. All 5 routes still hydrate clean in `e2e/hydration-authed.spec.ts`. |
| B.PT25 | i18n sweep — Bookings landing + HostProfile public surface | SHIPPED | _to be filled by commit_ | Audit `§4.8` finding: half the surface was already i18n'd (members, invitations, settings, user-menu) but the highest-traffic landing page (`/bookings`) and the public-facing visitor surface (`/h/[handle]`) shipped hardcoded English. New `Bookings` namespace (14 keys: title, tabs, tablist aria, 4 empty-state strings, 3 LiveDot aria states, 2 toast messages with `{name}` interpolation) and `HostProfile` namespace (13 keys: openNow / closedToday status, RESCHEDULING banner + cancel link, default bio, ICU-pluralized `daysWithSlots` count, 4 empty-state strings with `{name}` interpolation, NEXT AVAILABLE eyebrow, pickADate aria, brand label). Both `messages/en.json` + `messages/es.json` updated. Spanish translations follow the project's existing register (informal `tú` form, sentence case for noun headings). The 3 hot-path strings the audit explicitly named (bio, empties, NEXT AVAILABLE) on `/h/[handle]` are now in the catalog. `Defers: B.PT26`. |
| B.PT26 | i18n sweep — availability + auth + loading titles + ICU date sweep | OPEN | — | Remaining surfaces flagged by audit `§4.8` that didn't fit B.PT25's scope. **availability-fields.tsx** (~15 chip/range/error/modal strings — the largest single i18n surface, 703-line file with deeply nested copy semantics that need careful per-string review). **/login + /register** auth pages (currently English from B.PT22 which deferred i18n by design). **`loading.tsx` titles** (5 page titles hardcoded by B.PT24 — straightforward useTranslations swap once availability lands). **WEEKDAY_SHORT / MONTH_SHORT hand-rolled arrays** in `bookings-list.tsx`, `booking-detail.tsx`, `host-profile.tsx` — replace with `useFormatter().dateTime(d, { weekday: "short", month: "short" })` so the locale-aware month/day names come from ICU instead of an inline English array. ~30 strings + 6 ICU-formatter swaps total. ~1.5 days. |
| B.PT27 | Kill mid-dot separators + Vitest guard | SHIPPED | _to be filled by commit_ | Audit `§5` finding: 10 `· ` mid-dot separators across `admin/webhooks` (4), `admin/feature-flags` (2), `admin/audit/[bookingUid]` (2), `host-pool-dialog` (1), `onboarding-checklist` (1) — direct violation of the no-mid-dot hard rule (memory entry `feedback_no_dot_separator.md`, Apple HIG). Each instance restructured per the rule's "audit each half" directive, not blindly substituted: count-suffix rows (`Subscriptions · 5`) → parenthetical (`Subscriptions (5)`); identity-pair rows (`@handle · email`) → stacked eyebrow + muted secondary; multi-piece audit log rows (`actor · action · time`) → flex-wrap header with a thin `/` separator + `time` anchored end via `ml-auto`; dialog title-with-subtitle (`Hosts · {eventTypeName}`) → title + dedicated subtitle eyebrow row. New `src/lib/__tests__/no-mid-dot.test.ts` walks every `*.tsx` under `src/` for the literal `' · '` pattern and surfaces violations as `path:line: …` in the failure message. Runs on `pnpm test:run` (already CI-gated). 366 tests pass (45 files, was 44 + the new guard). |
| B.PT28 | Enforce `oh-legend` / `oh-eyebrow` utility classes (canonical conversions) | SHIPPED | _to be filled by commit_ | Audit `§4.6` + `oh-ui.md` *Typography utilities* — three semantic CSS classes are the source of truth for chrome roles (`oh-legend` 11px/2.5px, `oh-description` 13px, `oh-eyebrow` 10px/2px); inline mono-caps strings duplicate the spec and silently drift. This commit converts the 3 inline strings that EXACTLY match the canonical specs: `profile-form.tsx:74` + `availability-form.tsx:77` + `workflow-create-dialog.tsx:331` — all three were `font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[2.5px] uppercase` (with optional `opacity-65`), now `oh-legend opacity-100` (or `opacity-65`) per the rule's compose pattern. **Bespoke variants left unchanged**: 11px/2px (admin pills + tab buttons + status text — 4-5 callsites), 11px/1.5px (invitation-accept), 10px/2.5px (availability-fields dialog title), 10px/1.5px (theme-fields), 9.5px/2.5px (handle-fields). These are real spec divergences that need a design call: pick a single canonical metadata-track or extend `oh-ui.md` with a second-tier utility class (`oh-pill-label`?). Tracked under **B.PT26** (i18n + design sweep). The Vitest guard from B.PT27 stays focused on mid-dots; widening to mono-caps drift waits for the design call. |

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

**No OPEN rows.** B.PT16 (booking reads + SSE workspace scope),
B.PT17 (smart switcher + broad invalidation), and B.PT18 (workflow
scope — option A: keep personal, fix UI gate) all shipped in this
loop. B.PT19 (workspace-scoped workflows / cal.com dual-FK) is
SIGNAL-GATED — promote when a multi-workspace host actually asks
for per-workspace automation scope.

What remains beyond those is Tier B's three SIGNAL-GATED rows (B.PT10
/ B.PT11 / B.PT13) plus the entire Tier C surface — none of which
should be started without the matching signal:

| Signal | Promotes |
|---|---|
| "I want to schedule something X minutes after this other thing" | B.PT10 multi-step workflows |
| "Our customer asked for native Slack / SMS / Discord on booking" | B.PT11 with the named provider in scope |
| "We measured uneven host distribution under round-robin" | B.PT13 lookback decay cron |
| Real prod traffic justifying push channels | C.PT1 calendar push notifications |
| Pick a metric / incident sink (BetterUptime / Vercel / UptimeRobot) | C.PT2 / C.PT3 / C.PT4 status-page extensions |
| User demands hidden / parent-driven embeds | C.PT5 / C.PT6 / C.PT7 embed extensions |
| 2FA / SSO / enterprise SSO requirement | C.PT8 better-auth migration |
| Multi-instance serverless deploy | B.PT14 Upstash Redis swap for `createRatelimit` |
| Postgres migration itself | C.PT9 Postgres-mode CI workflow |
| Measured `/h/<handle>` p95 > 800ms or sustained > 5 reads/s | C5 cache-aside (deferred-by-design — see `docs/C5-cache-aside-deferred.md`) |
| Multi-workspace host asks for per-workspace automation scope | B.PT19 workspace-scoped workflows (option B or cal.com dual-FK) |

The right next move is a product call (which signal flips an item
from gated to actionable), not engineering.

---

## Live `TODO` comments in source

`rg "TODO|FIXME|XXX" src/` returns zero matches as of HEAD. Every deferral lives as a row in the tables above; new code that wants to defer something should add a row here, not drop a `TODO(…)` marker. If a future audit finds new markers, promote them to backlog rows in the same commit they appear.

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
