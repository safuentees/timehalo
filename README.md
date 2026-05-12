<!-- TODO #1 — banner image. Generate a wide hero banner
     (~1280×320) of the dashboard + a visitor booking page side by
     side, export as PNG, upload to GitHub via drag-and-drop in any
     issue/PR (it gets a user-attachments URL), and paste the URL
     in place of <BANNER_URL> below. -->
<!--
<a href="https://timehalo.app">
  <img alt="TimeHalo — open-source scheduling software for one-on-one
  meetings, built with a production-oriented TypeScript stack." src="<BANNER_URL>">
</a>
-->

<h3 align="center">TimeHalo</h3>

<p align="center">
  Open-source scheduling software for one-on-one meetings, built with a production-oriented TypeScript stack.
  <br />
  <a href="https://timehalo.app"><strong>Try the hosted app »</strong></a>
  <br />
  <br />
  <a href="#about"><strong>About</strong></a> ·
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#tech-stack"><strong>Tech stack</strong></a> ·
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#self-hosting"><strong>Self-hosting</strong></a> ·
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://github.com/safuentees/timehalo/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-BSL%201.1-10b981" alt="License" />
  </a>
  <a href="https://github.com/safuentees/timehalo/stargazers">
    <img src="https://img.shields.io/github/stars/safuentees/timehalo?style=flat&logo=github&color=10b981" alt="GitHub stars" />
  </a>
  <a href="https://github.com/safuentees/timehalo/pulse">
    <img src="https://img.shields.io/github/commit-activity/m/safuentees/timehalo?color=10b981" alt="Commits per month" />
  </a>
</p>

<br/>

## About

TimeHalo is a single-host scheduling app inspired by Cal.com. Users
choose a handle, configure availability, share a booking link, and
receive confirmed meetings on their calendar.

A typical flow looks like:

```txt
timehalo.app/<handle> → choose a date → choose a time → confirm booking
```

The product focuses on a streamlined scheduling workflow while
implementing the backend systems expected in a modern SaaS
application, including authentication, billing, calendar sync, audit
logging, webhook delivery, observability, background processing, and
end-to-end test coverage.

> **Hosted plan** lives at [timehalo.app](https://timehalo.app). The
> code in this repository is what runs it. Self-host the whole thing
> on Vercel + Turso at little to no monthly cost, or use the hosted
> plan and skip the ops.

<!-- TODO #2 — booking-flow screenshot (a single PNG, ~1200×750
     wide). Recommended subject: a real /h/<handle> visitor page
     mid-booking with the slot picker visible. -->
<!--
<img width="100%" alt="booking page" src="<SCREENSHOT_URL>">
-->

## Features

### Scheduling and booking

- Public booking pages at `/h/[handle]`
- Availability management for hosts
- One-on-one booking flow with confirmation and rescheduling
- Google Calendar two-way sync
- Automated workflow emails
- Embeddable booking widget
- Custom branding options
- Dark mode
- English and Spanish internationalization

### SaaS and backend systems

- **Idempotent booking mutations** — repeated booking requests with the
  same key produce a single booking record.
- **Race-safe slot collision prevention** — booking conflicts are
  prevented during concurrent requests.
- **Audit logging on writes** — mutations record actor, IP address,
  user agent, and before/after state.
- **HMAC-signed webhooks** — booking lifecycle events support retries,
  exponential backoff, and delivery logs.
- **Rate limiting** — per-IP and per-user sliding-window rate limits
  powered by Upstash Redis.
- **Workspaces and round-robin assignment** — event types can include
  multiple hosts with weighted distribution and double-booking
  protection.
- **Soft deletion** — bookings retain an audit trail while remaining
  excluded from standard reads.
- **Server-sent events** — live booking-arrival queue without polling.
- **Attribution capture** — booking links support source tracking
  through UTM-style cookies.
- **Feature flags** — gradual rollouts and per-user overrides.
- **Observability** — structured logging, Sentry tracing, and Vercel
  Analytics.

<!-- TODO #3 — short demo GIF (~3-5 sec, ~600×400). Record the
     booking flow: open /h/handle → pick a day → pick a slot →
     confirm. Compress with `gifski` or upload as MP4. -->
<!--
<img width="100%" alt="booking demo" src="<DEMO_URL>">
-->

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| UI | [React 19](https://react.dev/) + [Tailwind CSS v4](https://tailwindcss.com/) + [Base UI](https://base-ui.com/) |
| Motion | [Motion](https://motion.dev/) (formerly Framer Motion) |
| API | [tRPC v11](https://trpc.io/) + [TanStack Query v5](https://tanstack.com/query) |
| ORM | [Prisma 7](https://www.prisma.io/) |
| Database | [Turso](https://turso.tech/) (libSQL) |
| Auth | [Auth.js v5](https://authjs.dev/) |
| Email | [Resend](https://resend.com/) + [React Email](https://react.email/) |
| Payments | [Stripe](https://stripe.com/) |
| Rate limiting | [Upstash Redis](https://upstash.com/) |
| Observability | [Sentry](https://sentry.io/) |
| Hosting | [Vercel](https://vercel.com/) |
| Language | [TypeScript](https://www.typescriptlang.org/) (strict mode) |

## Quick start

### Requirements

- Node.js `>= 22`
- pnpm `>= 9`
- A Turso database or another libSQL-compatible database URL
- A configured `.env.local` file

### Install and run

```bash
# 1. Clone the repository
git clone https://github.com/safuentees/timehalo.git
cd timehalo

# 2. Install dependencies
pnpm install

# 3. Configure environment variables
cp .env.example .env.local
# Fill in the required values in .env.local

# 4. Generate Prisma client and apply migrations
pnpm prisma generate
pnpm prisma migrate deploy

# 5. Seed local fixtures (optional)
pnpm setup

# 6. Start the development server
pnpm dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

For the full local environment, including the cron worker and Stripe
webhook tunnel, use:

```bash
pnpm dev:full
```

### Common scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start the Next.js development server |
| `pnpm dev:cron` | Run the local cron worker |
| `pnpm dev:full` | Run dev server, cron worker, and Stripe tunnel together |
| `pnpm test` | Run Vitest in watch mode |
| `pnpm test:run` | Run the Vitest suite once |
| `pnpm exec playwright test` | Run Playwright end-to-end tests |
| `pnpm lint` | Run ESLint |
| `pnpm tsc --noEmit` | Run TypeScript type checking |
| `pnpm email:preview` | Start the React Email preview server |
| `pnpm build` | Create a production build |

## Environment

Minimum environment variables required to boot the app:

```env
# Database
DATABASE_URL=libsql://<your-db>.turso.io
TURSO_AUTH_TOKEN=<token>

# Auth
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000
```

Optional services for full feature parity:

```env
# Email
RESEND_API_KEY=<key>

# Observability
SENTRY_DSN=<dsn>

# Rate limiting and idempotency
UPSTASH_REDIS_REST_URL=<url>
UPSTASH_REDIS_REST_TOKEN=<token>

# Payments
STRIPE_SECRET_KEY=<key>

# GitHub OAuth
GITHUB_ID=<oauth-client-id>
GITHUB_SECRET=<oauth-secret>
```

See `.env.example` for the full environment variable list.

## Self-hosting

The hosted and self-hosted versions use the same codebase.

### Deployment outline

1. Fork this repository
2. Create a Turso database — `turso db create timehalo-prod`
3. Create a database token — `turso db tokens create timehalo-prod`
4. Deploy the fork to Vercel
5. Add the required environment variables
6. Apply the database migrations manually:

```bash
turso db shell timehalo-prod < prisma/migrations/<latest>/migration.sql
```

The Vercel build command is:

```bash
pnpm prisma generate && pnpm build
```

`prisma migrate deploy` is not used against Turso remote URLs in this
deployment flow. Migrations are applied through the Turso CLI from a
local machine.

### Cron jobs

Sub-daily cron processing for `/api/cron/process-tasks` runs through
GitHub Actions because Vercel Hobby limits scheduled crons to once
per day. The workflow lives at
`.github/workflows/cron-process-tasks.yml`.

### Backup and restore

A full database runbook is available at
`.claude/rules/database-runbook.md` — it documents Turso point-in-time
recovery and weekly logical dump procedures.

## Project structure

```
src/
  app/
    (host)/         — authenticated application routes
    h/[handle]/     — public booking pages
    api/            — cron, webhook, and OAuth routes
  trpc/             — domain-specific tRPC routers
  components/
    oh/             — project chrome (OhPageShell, OhCard, OhPillSwitcher, …)
    ui/             — shared UI primitives
  lib/
    mutations/      — TanStack Query mutation hooks
    schedule.ts     — shared slot-generation logic
prisma/
  schema.prisma
  migrations/
e2e/                — Playwright specs
test/               — Vitest fixtures and contract tests
.claude/rules/      — engineering conventions and runbooks
```

See `AGENTS.md` in the repository root for project-wide engineering
rules. Some directories also contain scoped `AGENTS.md` files with
conventions specific to that part of the codebase.

## Testing

TimeHalo includes both server-side contract coverage and
browser-level end-to-end coverage.

### Vitest

- Around 300 server-side contract tests
- Coverage across tRPC routers, booking logic, and shared libraries
- Run with `pnpm test:run`

### Playwright

End-to-end browser coverage for:

- Authentication flows
- Public booking flow
- Core smoke tests

Run with `pnpm exec playwright test`.

### Continuous integration

Pull requests run lint + tsc + Vitest + Playwright before merge. The
project gates all four; merging is blocked on any failure.

Test conventions live in `.claude/rules/testing.md` — fixture
inventory, auth caching, environment stubbing.

## Roadmap

Active work tracked in [`BACKLOG.md`](./BACKLOG.md) at the repo root.
The file is the single source of truth — shipped items keep their row
with the commit SHA in the *Closed by* column; deferrals get a new ID
in the same diff that introduces them. A pre-commit hook enforces
this.

## Contributing

PRs welcome. Before opening one:

1. Read `AGENTS.md` (root) — the design rules every contributor follows
2. Run `pnpm test:run && pnpm lint && pnpm tsc --noEmit` locally
3. Add or update entries in `BACKLOG.md` if you're shipping or
   deferring a tracked item (the `commit-msg` hook will reject the
   commit otherwise)

For local development setup see [Quick start](#quick-start) above. The
worktree workflow (per-branch sandbox in `.claude/worktrees/`) is
documented in `AGENTS.md`.

### Recommended versions

| Package | Version |
|---|---|
| node | ≥ 22 |
| pnpm | ≥ 9 |
| turso | latest |

## License

[Business Source License 1.1](./LICENSE) — source-available with a
non-commercial use grant. You may self-host and run TimeHalo for
personal, internal evaluation, development, and testing purposes.
Commercial use, including providing TimeHalo as a hosted or managed
service to third parties, requires a separate commercial license
from the Licensor.

The license auto-converts to the Apache License 2.0 on 2030-05-12
(four years from initial release).

The hosted plan at [timehalo.app](https://timehalo.app) is the same
code, with managed infra + email + payments wired up.

## Acknowledgments

Heavily inspired by [Cal.com](https://github.com/calcom/cal.com)'s
product surface and [dub.co](https://github.com/dubinc/dub)'s
engineering style. The dashboard chrome borrows pacing from ChatGPT's
settings panel.
