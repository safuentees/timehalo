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

---

## Section 1 — Database (A2 prerequisites)

### `DATABASE_URL`

- Source: Turso CLI — `turso db show <db-name> --url`
- Format: `libsql://<db>-<org>.turso.io`
- Notes: production target is **iad1** per A1. Create the DB once
  via `turso db create officehours --location iad1` (or your DB name).
- [x] Set in Vercel.

### `TURSO_AUTH_TOKEN`

- Generate: `turso db tokens create <db-name>`
- Notes: scope-locked to the single DB. Mark **Sensitive** in Vercel.
- [x] Set in Vercel.

---

## Section 2 — Authentication (B1)

### `AUTH_SECRET`

- Generate: `openssl rand -base64 32`
- Notes: NEVER reuse the dev secret. Rotate annually or after any
  suspected leak. Mark **Sensitive**.
- [x] Set in Vercel.

## Section 3 — App URL (B2)

### `NEXT_PUBLIC_APP_URL`

- Value: `--https://officehours.app--` (no trailing slash) i will use dev.safuentes.dev or safuentes.dev either for now
- Notes: client-side var so it ships to the browser. Drives
  outbound email links, Stripe return URLs, OAuth redirect URIs,
  webhook signature payloads. NOT marked Sensitive (public).
- [~] Set in Vercel (Production).
- [~] Set in Vercel (Preview) — point at `https://*.vercel.app`
  preview pattern via Vercel's per-environment override (or leave
  unset and let the fallback to `localhost:3001` apply for dev /
  preview testing).

---

## Section 4 — Email (B3)

### `RESEND_API_KEY`

- Source: <https://resend.com/api-keys> → Create API Key →
  "Full access" (booking confirmations need to send + read status).
- Notes: free tier covers 3000/mo + 100/day — sufficient for
  portfolio-stage launch. Mark **Sensitive**.
- [x] Set in Vercel.

### `EMAIL_FROM`

- Value: `Officehours <hello@officehours.app>` (or chosen sender
  address on your verified domain).
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
- [x] Confirmed unset in Vercel Production env.

---

## Section 5 — Cron (B4)

### `CRON_SECRET`

- Generate: `openssl rand -base64 32`
- Notes: Bearer token Vercel Cron sends in the `Authorization`
  header. Vercel Cron auto-injects it when configured via
  `vercel.json` crons block + the env var matching name. Mark
  **Sensitive**.
- [x] Set in Vercel.
- [~] Vercel Cron schedule visible at Settings → Cron Jobs (the
  two jobs from `vercel.json`: `/api/cron/process-tasks` every 5m,
  `/api/cron/cleanup-bookings` daily at 3am).

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
  `https://officehours.app/api/auth/calendar/google/callback`
  (must match **exactly** including scheme + path).
- OAuth consent screen scopes:
  `https://www.googleapis.com/auth/calendar.readonly` (free-busy)
  - `https://www.googleapis.com/auth/calendar.events` (two-way
    write — B.PT2 dependency).
- Mark **Sensitive**.
- [x] Set in Vercel (both vars).
- [x] Redirect URI registered in Google Cloud Console.
- [x] OAuth consent screen published (if going beyond test users).

### `MICROSOFT_OAUTH_CLIENT_ID` + `MICROSOFT_OAUTH_CLIENT_SECRET`

- Source: <https://entra.microsoft.com/> → App Registrations →
  New registration. Tenant: `common` (works for personal +
  work accounts).
- Authorized redirect URI:
  `https://officehours.app/api/auth/calendar/microsoft/callback`
- API permissions: `Calendars.Read` + `Calendars.ReadWrite`
  (delegated, not application).
- Mark **Sensitive**.
- [x] Set in Vercel (both vars).
- [x] Redirect URI registered in Entra App Registration.
- [x] API permissions consented (admin consent not needed for
      delegated scopes against personal accounts; needed for tenant-
      wide work accounts).

---

## Section 7 — Stripe billing (B6)

### `STRIPE_SECRET_KEY`

- Source: <https://dashboard.stripe.com/apikeys> →
  **Reveal live key** (sk*live*...). Test-mode keys MUST NOT ship
  to production.
- Notes: Mark **Sensitive**.
- [x] Set in Vercel (live key, sk*live*\*).

### `STRIPE_PRICE_PRO` + `STRIPE_PRICE_TEAM`

- Source: Stripe dashboard → Products → create one product per
  plan tier (PRO + TEAM) → grab the price id (`price_...`).
- Notes: NOT secrets but values vary by environment. Could leave
  defaults that throw at runtime if you're truly free-tier-only.
- [x] PRO price created in Stripe.
- [x] TEAM price created in Stripe.
- [x] Both vars set in Vercel.

### `STRIPE_WEBHOOK_SECRET`

- Source: Stripe dashboard → Developers → Webhooks → add endpoint
  pointing at `https://officehours.app/api/billing/webhook` →
  reveal signing secret (`whsec_...`).
- Events to subscribe to: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`.
- Notes: Mark **Sensitive**.
- [x] Webhook endpoint created in Stripe.
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
  Token → "Project releases + source maps" scope.
- Notes: Build-time only — used by `withSentryConfig` in
  `next.config.ts` to upload source maps. Mark **Sensitive**.
- [x] Set in Vercel (Production + Preview).

### `SENTRY_ORG` + `SENTRY_PROJECT`

- Source: Sentry org slug + project slug from the project's URL
  (e.g. `https://yourorg.sentry.io/projects/officehours/` →
  org=`yourorg`, project=`officehours`).
- Notes: NOT secrets.
- [x] Both set in Vercel.

---

## Section 9 — GitHub OAuth (B8)

### `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET`

- Source: <https://github.com/settings/developers> → New OAuth App
  (or pick the existing prod app). Match production callback URL
  exactly.
- Homepage URL: `https://officehours.app`
- Authorization callback URL:
  `https://officehours.app/api/auth/callback/github`
- Mark **Sensitive**.
- [x] OAuth app registered.
- [x] Both vars set in Vercel.

---

## Section 10 — Admin surface (B10)

### `OFFICEHOURS_ADMIN_HANDLES`

- Value: `pangs` (current decision per A1 follow-up — extend with
  comma-separated handles later via Vercel env edit).
- Notes: NOT a secret; CSV of host handles allowed at `/admin/*`.
  Empty/unset → no admin access from any account.
- [x] Set in Vercel.

---

## Section 11 — Rate-limit fallback (B11)

### `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

- Source: <https://console.upstash.com/> → Create Database →
  Region: us-east-1 (matches iad1) → REST API tab → REST URL +
  REST Token.
- Notes: only needed for multi-region serverless. Mark
  `UPSTASH_REDIS_REST_TOKEN` **Sensitive**.
- [x] Database created in Upstash.
- [x] Both vars set in Vercel.

(Implementation gate: B11 also requires the Redis-backed limiter
swap from `BACKLOG.md` `B.PT14` — agent ships that as part of the
B11 row before flipping `[x]`.)

---

## Final verification

After every box above is ticked:

1. Trigger a fresh production deploy (`git push origin main` or
   Vercel dashboard → Redeploy).
2. Confirm `prisma migrate deploy` step succeeds in build logs.
3. Confirm `Environment Variables Validation` step succeeds (the
   `@t3-oss/env-nextjs` schema in `src/env.ts` fails the build
   loud if any required var is missing).
4. Hit `https://officehours.app/api/auth/session` → expect a
   `{"user":null}` JSON response (auth wiring alive).
5. Hit `https://officehours.app/api/cron/process-tasks` without
   the Bearer token → expect 401 (cron secret enforced).
6. Run `pnpm exec curl -H "Authorization: Bearer <CRON_SECRET>"
https://officehours.app/api/cron/process-tasks` → expect 200.

When all six pass, return to `PRODUCTION-READINESS.md` and flip
each `[ ]` → `[x]` for the items this checklist covers. Use the
single launch-prep commit message style: `chore(prod-launch):
B1–B11 — env vars set in Vercel, post-deploy verification passed`.

If any of the six post-deploy checks fail, capture the failure mode
in a B-section row's "Outcome" subsection so the next attempt has
the trail.
