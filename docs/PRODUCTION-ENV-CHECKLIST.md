# Production env checklist

Single artifact for the v1 launch deploy. Walk through top-to-bottom
once, paste each value into your Vercel project's **Environment
Variables** panel (Settings → Environment Variables → Production), then
return here and tick each box. Each ticked row corresponds to a row in
`PRODUCTION-READINESS.md` that flips `[ ]` → `[x]` in the same review
pass.

> **Order matters.** A few vars depend on others (calendar OAuth needs
> `NEXT_PUBLIC_APP_URL` set first to construct redirect URIs; Stripe
> webhook secret depends on the webhook endpoint already existing in
> the Stripe dashboard pointed at the production URL). Walk top-to-
> bottom and don't skip ahead.

> **Vercel paste targets.** All vars below go in **Settings →
> Environment Variables → Production** unless explicitly noted as
> Preview-only. Use the "Sensitive" toggle on every secret value
> (Vercel hides it from the dashboard after save and from build logs).

> **Live URL note.** Production domain is `https://safuentes.dev`
> (apex). Wherever this checklist mentions `officehours.app`, it's a
> placeholder — replace with `safuentes.dev` in actual values.

---

## Section 1 — Database (A2 prerequisites)

### `DATABASE_URL`
- Source: Turso CLI — `turso db show <db-name> --url`
- Format: `libsql://<db>-<org>.turso.io`
- Notes: production target is **iad1** per A1. Project DB:
  `officehours-prod`.
- [x] Set in Vercel (verified `vercel env ls production` 2026-05-11).

### `TURSO_AUTH_TOKEN`
- Generate: `turso db tokens create <db-name>`
- Notes: scope-locked to the single DB. Mark **Sensitive** in Vercel.
- [x] Set in Vercel (verified `vercel env ls production` 2026-05-11).

---

## Section 2 — Authentication (B1)

### `AUTH_SECRET`
- Generate: `openssl rand -base64 32`
- Notes: NEVER reuse the dev secret. Rotate annually or after any
  suspected leak. Mark **Sensitive**.
- [x] Set in Vercel (verified `vercel env ls production` 2026-05-11).

---

## Section 3 — App URL (B2)

### `NEXT_PUBLIC_APP_URL`
- Value: `https://safuentes.dev` (no trailing slash)
- Notes: client-side var so it ships to the browser. Drives
  outbound email links, Stripe return URLs, OAuth redirect URIs,
  webhook signature payloads. NOT marked Sensitive (public).
- [x] Set in Vercel (Production) → `https://safuentes.dev`.
- [x] Preview env UNSET (removed via `vercel env rm
  NEXT_PUBLIC_APP_URL preview` 2026-05-11). `src/env.ts` falls back
  to `http://localhost:3001` when unset, which is the right shape
  for branch previews + local dev.

---

## Section 4 — Email (B3)

### `RESEND_API_KEY`
- Source: <https://resend.com/api-keys> → Create API Key →
  "Full access" (booking confirmations need to send + read status).
- Notes: free tier covers 3000/mo + 100/day — sufficient for
  portfolio-stage launch. Mark **Sensitive**.
- [x] Set in Vercel.

### `EMAIL_FROM`
- Value: `Officehours <hello@safuentes.dev>` (sender on the verified
  domain).
- Notes: NOT a secret. Must be a verified domain in Resend (DKIM +
  SPF + DMARC at the DNS layer — see M4). Until DNS is verified,
  emails get spam-filtered.
- [x] Verified domain configured in Resend dashboard.
- [x] Set in Vercel.

### `EMAIL_DEV_REDIRECT`
- Notes: **leave UNSET in production**. Setting it routes outgoing
  emails to a dev inbox instead of real recipients (production
  ignores it via `VERCEL_ENV=production` check, but cleaner to
  not set it at all in production env).
- [x] Confirmed unset in Vercel Production env (`vercel env ls
  production` shows no row).

---

## Section 5 — Cron (B4)

### `CRON_SECRET`
- Generate: `openssl rand -base64 32`
- Notes: Bearer token both Vercel Cron (daily cleanup-bookings) AND
  the GitHub Actions workflow `.github/workflows/cron-process-tasks.yml`
  (5-min process-tasks) send in the `Authorization` header. Mark
  **Sensitive**.
- [x] Set in Vercel Production env.
- [x] Set in GitHub repo Secrets as `CRON_SECRET` (used by
  `.github/workflows/cron-process-tasks.yml`).
- [x] Cron schedules confirmed:
  - **Vercel Cron** (Settings → Cron Jobs): daily
    `/api/cron/cleanup-bookings` at 3am UTC.
  - **GitHub Actions** (.github/workflows/cron-process-tasks.yml):
    5-min `/api/cron/process-tasks`. Vercel Hobby tier rejects
    sub-daily Vercel Cron, so this lives on GHA per the memory
    `project_cron_github_actions.md`.

---

## Section 6 — Calendar OAuth (B5 + B9)

### `CALENDAR_TOKEN_KEY`
- Generate:
  `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`
- Format: 64-char hex string (32 bytes).
- Notes: AES-256-GCM key for encrypting `CalendarCredential`
  tokens at rest. Required when calendar OAuth is enabled.
  ROTATING this re-encrypts via `scripts/encrypt-calendar-tokens.ts`
  which exists for that purpose. Mark **Sensitive**.
- [x] Set in Vercel.

### `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`
- Source: <https://console.cloud.google.com/apis/credentials> →
  Create credentials → OAuth client ID → Web application.
- Authorized redirect URI:
  `https://safuentes.dev/api/auth/calendar/google/callback`
  (must match **exactly** including scheme + path).
- OAuth consent screen scopes:
  `https://www.googleapis.com/auth/calendar.readonly` (free-busy)
  + `https://www.googleapis.com/auth/calendar.events` (two-way
  write — B.PT2 dependency).
- Mark **Sensitive**.
- [x] Set in Vercel (both vars).
- [x] Redirect URI registered in Google Cloud Console
  (`https://safuentes.dev/...`).
- [x] OAuth consent screen published.

### `MICROSOFT_OAUTH_CLIENT_ID` + `MICROSOFT_OAUTH_CLIENT_SECRET`
- Source: <https://entra.microsoft.com/> → App Registrations →
  New registration. Tenant: `common` (works for personal +
  work accounts).
- Authorized redirect URI:
  `https://safuentes.dev/api/auth/calendar/microsoft/callback`
- API permissions: `Calendars.Read` + `Calendars.ReadWrite`
  (delegated, not application).
- Mark **Sensitive**.
- [x] Set in Vercel (both vars).
- [x] Redirect URI registered in Entra App Registration
  (`https://safuentes.dev/...`).
- [x] API permissions consented.

---

## Section 7 — Stripe billing (B6)

> **Status:** Sandbox / Test mode for v1 launch. Real-card live
> activation deferred until the public marketing page lands at `/`.
> Test-mode keys (`sk_test_*` + test price IDs + test webhook
> secret) are wired in Vercel; N8 in PRODUCTION-READINESS.md stays
> `[~]` deferred.

### `STRIPE_SECRET_KEY`
- Source: <https://dashboard.stripe.com/apikeys>.
- Notes: Mark **Sensitive**.
- [x] Set in Vercel (test mode `sk_test_*` for v1).

### `STRIPE_PRICE_PRO` + `STRIPE_PRICE_TEAM`
- Source: Stripe dashboard → Products → create one product per
  plan tier (PRO + TEAM) → grab the price id (`price_...`).
- Notes: NOT secrets but values vary by environment.
- [x] PRO price created in Stripe (test mode).
- [x] TEAM price created in Stripe (test mode).
- [x] Both vars set in Vercel.

### `STRIPE_WEBHOOK_SECRET`
- Source: Stripe dashboard → Developers → Webhooks → add endpoint
  pointing at `https://safuentes.dev/api/billing/webhook` →
  reveal signing secret (`whsec_...`).
- Events to subscribe to: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`.
- Notes: Mark **Sensitive**.
- [x] Webhook endpoint created in Stripe (test mode).
- [x] Signing secret set in Vercel.

---

## Section 8 — Sentry observability (B7)

### `NEXT_PUBLIC_SENTRY_DSN`
- Source: Sentry → Project Settings → Client Keys (DSN) → copy.
- Notes: NOT a secret — ships to the browser. Used by both server
  and client runtime to send events. Without this set, the
  `withSpan` observability falls back to console.log.
- [x] Set in Vercel.

### `SENTRY_AUTH_TOKEN`
- Source: Sentry → Settings → Account → Auth Tokens → Create
  Token → **`project:releases` + `project:write` scopes**.
- Notes: Build-time only — used by `withSentryConfig` in
  `next.config.ts` to upload source maps. Mark **Sensitive**.
- [x] Set in Vercel (Production + Preview).
- [/] **Source-map upload BLOCKED — Sentry CLI returns 401
  "Invalid token" on every build** (verified against deploy
  `oh-f6plbfzwf` at HEAD `abd68c5`, 2026-05-11T08:45:57Z). The
  build still completes (Sentry CLI 401 is non-fatal under
  `withSentryConfig`); runtime DSN reporting works. Stack frames
  in Sentry Issues will read minified until token rotation
  succeeds. Rotation: regenerate the token at sentry.io with the
  `project:releases` + `project:write` scopes, paste into Vercel
  Production + Preview, redeploy, confirm next build log shows
  no "Invalid token (http status: 401)". Tracked as **B.PT265** in
  BACKLOG.md.

### `SENTRY_ORG` + `SENTRY_PROJECT`
- Source: Sentry org slug + project slug from the project's URL.
- Notes: NOT secrets.
- [x] Both set in Vercel.

---

## Section 9 — GitHub OAuth (B8)

### `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET`
- Source: <https://github.com/settings/developers> → New OAuth App
  (or pick the existing prod app). Match production callback URL
  exactly.
- Homepage URL: `https://safuentes.dev`
- Authorization callback URL:
  `https://safuentes.dev/api/auth/callback/github`
- Mark **Sensitive**.
- [x] OAuth app registered (callback at `safuentes.dev`).
- [x] Both vars set in Vercel.

---

## Section 10 — Admin surface (B10)

### `OFFICEHOURS_ADMIN_HANDLES`
- Value: CSV of host handles allowed at `/admin/*`.
- Notes: NOT a secret. Empty/unset → no admin access from any
  account.
- [x] Set in Vercel.

---

## Section 11 — Rate-limit fallback (B11)

### `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- Source: <https://console.upstash.com/> → Create Database →
  Region: us-east-1 (matches iad1) → REST API tab → REST URL +
  REST Token.
- Notes: Mark `UPSTASH_REDIS_REST_TOKEN` **Sensitive**.
- [x] Database created in Upstash.
- [x] Both vars set in Vercel.

---

## Final verification

After every box above is ticked:

1. Trigger a fresh production deploy (`git push origin main` or
   Vercel dashboard → Redeploy).
2. **NO `prisma migrate deploy` in build command** — Turso libsql
   is incompatible with `migrate deploy` per
   `.claude/rules/database-runbook.md`. Build command is
   `pnpm prisma generate && pnpm build`. Migrations apply
   manually via `turso db shell officehours-prod < migration.sql`
   from operator's machine before deploying any schema-dependent
   code.
3. Confirm `Environment Variables Validation` succeeds (the
   `@t3-oss/env-nextjs` schema in `src/env.ts` fails the build
   loud if any required var is missing). ALSO confirm Sentry CLI
   did NOT return 401 — if it did, B7 token rotation hasn't
   landed yet (see Section 8 above).
4. `curl https://safuentes.dev/api/auth/session` → expect HTTP
   200 + body `null` (next-auth v5 no-session JSON).
5. `curl -X POST https://safuentes.dev/api/cron/process-tasks`
   without the Bearer token → expect 401.
6. `curl -X POST -H "Authorization: Bearer <CRON_SECRET>"
   https://safuentes.dev/api/cron/process-tasks` → expect 200 +
   sensible body. Proxy verification: latest run of
   `.github/workflows/cron-process-tasks.yml` returns 200 (uses
   the same bearer path).

When all six pass, return to `PRODUCTION-READINESS.md` and flip
each `[ ]` → `[x]` for the items this checklist covers.
