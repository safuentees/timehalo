# Self-hosting TimeHalo

[Back to the README](../README.md)

This guide covers the repository's Vercel + Turso deployment path and the external services used by the hosted app. Start with the [local setup](../README.md#run-locally) before connecting production services. Review the [license](../LICENSE) for your intended use.

## Database and deployment

1. Create a Turso database and a database-scoped token using the [Turso CLI](https://docs.turso.tech/cli/introduction).
2. Initialize its schema using the migration history as described below.
3. Import your repository into Vercel and set `DATABASE_URL` to the `libsql://` URL and `TURSO_AUTH_TOKEN` to the token.
4. Generate a new production `AUTH_SECRET`. Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your HTTPS origin, without a trailing slash.
5. Add the credentials for the services you want to enable. Use [`.env.example`](../.env.example) as the configuration reference.
6. Deploy with the build command already set in [`vercel.json`](../vercel.json):

```bash
pnpm prisma generate && pnpm build
```

A local SQLite file is useful for development. Vercel deployments need the remote database; the local development database is not a persistent production store there.

### Apply database migrations

This project uses **Prisma 7** with SQLite/libSQL. Prisma's remote Turso workflow uses local SQLite to develop migrations and the Turso CLI to apply SQL to the remote database. See [Prisma's SQLite/Turso documentation](https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite#turso-libsql).

For a **new, empty remote database**, apply each committed `migration.sql` in chronological order from [`prisma/migrations`](../prisma/migrations). Applying only the latest file does not create the complete schema.

For an **existing remote database**, apply only migrations you have not already deployed, in order. Record each applied migration in your deployment log; these manual Turso CLI commands do not maintain Prisma's local migration ledger for you. Review the SQL and make a backup before an update.

Example for a single pending migration, replacing both placeholders:

```bash
turso db shell <database-name> < prisma/migrations/<migration-directory>/migration.sql
```

Use `pnpm prisma migrate deploy` for the **local SQLite database**, as in the README. Do not point that local setup command at a remote Turso URL and expect the same migration behavior.

## Authentication and email

### Email delivery

Set `RESEND_API_KEY` and `EMAIL_FROM`, using a sender configured in your Resend account. Email delivery is needed for verification codes and magic-link sign-in. Booking confirmations and reminders also depend on a working task processor.

`EMAIL_DEV_REDIRECT` can route development messages to your own inbox. Its redirect is ignored when `VERCEL_ENV=production`. See the comments in [`.env.example`](../.env.example) for the development sink behavior.

### GitHub sign-in

Set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`. Register the OAuth callback URL as:

```text
https://your-domain/api/auth/callback/github
```

### Calendar connections

Google and Microsoft credentials are optional and can be enabled independently. Without a connection, slots are generated from TimeHalo availability without checking that provider's busy times.

| Provider | Variables | Callback path |
| --- | --- | --- |
| Google | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `/api/auth/calendar/google/callback` |
| Microsoft | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` | `/api/auth/calendar/microsoft/callback` |

Prefix each callback path with your public HTTPS origin. Microsoft uses the `common` tenant for personal and work accounts.

When either calendar provider is enabled, set `CALENDAR_TOKEN_KEY` to a 32-byte key encoded as 64 hexadecimal characters. This encrypts calendar access and refresh tokens at rest. Generate a value with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Background tasks and cron

The task processor is **`POST /api/cron/process-tasks`**. It requires `Authorization: Bearer <CRON_SECRET>`; without the secret it returns 401. It processes queued work such as emails, reminders, and webhook retries. Without `RESEND_API_KEY`, email tasks are logged and marked as skipped.

The repository contains two scheduled mechanisms:

| Mechanism | What to configure |
| --- | --- |
| [GitHub Actions task processor](../.github/workflows/cron-process-tasks.yml) | Change the hardcoded endpoint from `https://safuentes.dev` to your own origin and set the repository's `CRON_SECRET` Actions secret to match the app. The workflow requests a run every five minutes. |
| [Vercel cron configuration](../vercel.json) | Lists `/api/cron/cleanup-bookings` at 03:00 UTC. The current route accepts POST, while [Vercel cron sends GET](https://vercel.com/docs/cron-jobs#how-cron-jobs-work); use an authenticated POST scheduler for cleanup until those methods are aligned. |

A scheduler must call the task endpoint for queued work to run. Confirm the processor succeeds after deployment, rather than relying on email configuration alone.

Locally, start the app and run `pnpm dev:cron` in a second terminal. It loads `CRON_SECRET` from `.env` and polls port 3001 by default. Set `PORT` if your local app uses another port.

## Billing, rate limiting, and monitoring

- **Stripe:** set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, and `STRIPE_WEBHOOK_SECRET`. Point the Stripe webhook at `/api/stripe/webhook`. The billing router handles plan and checkout flows.
- **Upstash:** set both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for shared rate limiting. Without them, the fallback limiter is held in memory per app instance.
- **Sentry:** set `NEXT_PUBLIC_SENTRY_DSN` for runtime reporting. Source-map uploads additionally use the build-time `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` values.
- **Admin routes:** `OFFICEHOURS_ADMIN_HANDLES` is a comma-separated allowlist of handles permitted to access `/admin/*`. An empty value grants no admin access.
- **Private alpha gate:** `PRIVATE_GATE_PASSWORD` gates visible non-API pages when set. Leave it empty for a public deployment. See `.env.example` for its cookie and query parameter behavior.

Keep production secrets in the deployment platform's environment settings. Do not commit `.env`, database files, or database dumps.

## Local integration tools

`pnpm dev:full` combines the logged web server, Stripe listener, Cloudflare tunnel, and cron worker. It requires the Stripe CLI and `cloudflared`, along with their account and tunnel configuration.

The checked-in defaults target the maintainer's infrastructure. Before using the script for your own deployment:

- Set `STRIPE_FORWARD_TO` to your webhook endpoint. For local testing, use `http://localhost:3001/api/stripe/webhook`.
- Set `CLOUDFLARED_TUNNEL_NAME` to your configured tunnel name.
- Set the local `CRON_SECRET`, and use the signing secret emitted by your own Stripe listener as `STRIPE_WEBHOOK_SECRET`.

For a basic demo, `pnpm dev` is sufficient. `pnpm dev:cron` can be run independently when testing background work.

### Local HTTPS

The current Content Security Policy includes `upgrade-insecure-requests`, which can make browser links or prefetches attempt HTTPS against an HTTP development server. If you see `ERR_SSL_PROTOCOL_ERROR`, set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to `https://localhost:3001`, then run:

```bash
pnpm exec next dev -p 3001 --experimental-https
```

Next.js generates a local self-signed certificate. Use it only for development, and follow the browser's local certificate prompt if needed. The `dev:lan` script instead expects existing key and certificate files under `.certs/`.

## Backups and recovery

The [database runbook](../.claude/rules/database-runbook.md) describes logical dumps and Turso point-in-time recovery, including repointing the app to a recovered database. Check the current retention window for your Turso plan before relying on recovery coverage. Store dumps privately outside Git; they can contain booking and visitor data.

## Common setup problems

| Symptom | Check |
| --- | --- |
| Prisma cannot load environment values | Copy `.env.example` to `.env`, not only `.env.local`; Prisma loads `.env` through `dotenv/config`. |
| Fresh SQLite migration gives a blank schema-engine error | Create the root `dev.db` file with the Node command in the README, then rerun `pnpm prisma migrate deploy`. |
| Browser cannot connect on port 3000 | `pnpm dev` listens on **3001**. |
| Local sign-in uses a wrong origin | Match `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the local origin and restart the server. For `ERR_SSL_PROTOCOL_ERROR`, see [Local HTTPS](#local-https). |
| Verification code or magic link does not arrive | Configure Resend and a valid sender; check the provider response. |
| Booking emails or reminders do not arrive | Check the task scheduler, matching `CRON_SECRET`, and Resend credentials. |
| Calendar connection reports that it is not configured | Set that provider's OAuth credentials and `CALENDAR_TOKEN_KEY`, then verify its callback URL. |

The root [`AGENTS.md`](../AGENTS.md) documents engineering conventions, worktree bootstrap behavior, and testing rules. [`BACKLOG.md`](../BACKLOG.md) tracks product status.
