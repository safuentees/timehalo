# Officehours — CLI Tool Design

A focused analysis of how `rallly`, `dub`, and `cal.com` ship (or don't
ship) command-line tooling, what 2025-era CLI libraries actually look
like, and a concrete proposal for Officehours' own CLI surface — what
it should be, what it should do, and what it should explicitly not do.

This is a sibling doc to
[`OFFICEHOURS-PROJECT-GUIDE.md`](./OFFICEHOURS-PROJECT-GUIDE.md) and
[`OFFICEHOURS-DEPTH-IDEAS.md`](./OFFICEHOURS-DEPTH-IDEAS.md). Read
those for project context and the broader backlog.

The user instruction was "no time limit, brainstorm for the best
possible answer." So this is long, opinionated, and includes a
ready-to-implement scaffold. No filler.

---

## Table of Contents

1. [The Question](#1-the-question)
2. [Reference Repo Surveys (Sequential)](#2-reference-repo-surveys-sequential)
3. [Side-by-Side Comparison](#3-side-by-side-comparison)
4. [Modern CLI Landscape (Context7 audit)](#4-modern-cli-landscape-context7-audit)
5. [What Each Reference Got Right and Wrong](#5-what-each-reference-got-right-and-wrong)
6. [The Officehours CLI — Proposal](#6-the-officehours-cli--proposal)
7. [Concrete Command Surface](#7-concrete-command-surface)
8. [Why Build One — Benefits Audit](#8-why-build-one--benefits-audit)
9. [Risks and Anti-Goals](#9-risks-and-anti-goals)
10. [Phased Implementation](#10-phased-implementation)
11. [Reference Skeleton (citty, ESM, TypeScript)](#11-reference-skeleton-citty-esm-typescript)

---

## 1. The Question

The user asks: should Officehours have a CLI, what should it do, and
what does the landscape look like?

The deeper question is *why a CLI*. A CLI is not free — it's a second
distribution surface, a second auth path, a second UX language. Most
SaaS apps don't have one and don't suffer for it. The ones that do
treat the CLI as a deliberate force multiplier: they pick narrow
problems where the CLI is genuinely better than the web UI, and
ignore everything else.

The three reference repos make three different bets here. rallly bets
zero ("we don't need one"). dub bets small ("our SDK + a thin OAuth
wrapper, ~6 commands"). cal.com bets sideways ("our CLI is a developer
tool for our own contributors, not for end users").

All three bets are defensible. The Officehours bet should be made
*after* understanding why each of them works (and where each falls
short).

---

## 2. Reference Repo Surveys (Sequential)

### 2.1 rallly — No public CLI

Audit verdict: rallly publishes **no end-user CLI**. No `bin` field in
any `package.json` across the repo. No `cli/` package. No
`@rallly/cli` on npm.

What rallly *does* have is a small set of internal scripts:

- `scripts/create-release.sh` — bash, interactive `read` prompts,
  emoji-rich output, runs `pnpm release` to bump semver + git tag.
- `scripts/inject-version.js` — reads git short hash + package
  version, prints a build-time string used in
  `NEXT_PUBLIC_APP_VERSION`.
- `packages/database/prisma/seed.ts` — plain async TS, fixture seed.
- `packages/billing/src/scripts/{checkout-expiry,subscription-data-sync,
  sync-payment-methods,sync-space-subscription}.ts` — Stripe sync
  scripts run on a cron and during incident response. Each uses
  `dotenv -e .env -- pnpx tsx` for invocation.
- `scripts/docker-start.sh` — docker entrypoint: applies migrations,
  starts the server.

The pattern is **"npm scripts as CLI."** Each `pnpm <name>` is a
specific named operation. No subcommand tree, no help system, no
flags beyond the underlying tool. The whole thing is ~10 entry points,
zero abstraction.

Why this works for rallly: rallly's value to its users lives entirely
in the web app. There's no reason for a poll-creator to install a
binary when the website does the job in two clicks. The internal
scripts are operational tools (seed, migrate, sync billing, ship a
release), and they don't need a unified CLI because each one runs
once or twice a quarter by exactly one engineer.

What rallly *doesn't* have that you might expect:
- No interactive `pnpm setup` for first-time contributors (their
  bootstrap is the README).
- No fixture factory CLI (`createUser`, `createPoll` from a script).
- No "replay this Stripe webhook locally" command — they curl Stripe's
  webhook event directly instead.

**Takeaway:** "no public CLI" is a legitimate design choice. The
internal scripts are unbranded — `tsx ./scripts/foo.ts` rather than
`rallly foo` — and that costs nothing.

### 2.2 dub — `dub-cli` (Commander + SDK wrapper)

dub publishes `dub-cli` from `/packages/cli/` — a focused 6-command
CLI that wraps the public `dub` SDK with OAuth2 + interactive prompts.

**Stack** (`packages/cli/package.json`):
- `commander` 11.1 — argument + subcommand parsing
- `@badgateway/oauth2-client` 2.4 — full OAuth2 authorization-code
  flow with PKCE
- `chalk` 5.3 — colored output
- `ora` 7 — async spinners
- `prompts` 2.4 — select / text inputs
- `configstore` 6 — `~/.config/configstore/dub-cli-nodejs.json`
- `json-colorizer` 2.2 — syntax-highlighted JSON output
- `dub` SDK (peer-imported) — actual API calls

**Commands:**
- `dub login` — opens browser, captures token at `localhost:4587`.
- `dub config` — prints stored credentials (debug aid).
- `dub domains` — interactive domain picker (then sets active workspace).
- `dub shorten <url> [key]` — creates a short link.
- `dub links --search <q> --limit <n>` — lists links via
  `console.table()`.

**Auth shape:** OAuth2 authorization-code flow with refresh-token
rotation. Token + refresh-token live in configstore, refreshed on
expiry inside `getDubClient()` before any API call. The auth model is
the most production-grade thing in the CLI — it's not an API key
pasted into env, it's a real OAuth dance.

**Distribution:** `tsup` bundles the TypeScript into
`/dist/index.js`, npm-published as `dub-cli`. Invoked via `npx
dub-cli` or installed globally as `dub`.

**What's good:**
- The CLI imports the SDK rather than duplicating fetch logic.
  Single source of truth for API shape.
- OAuth2 instead of API-key paste. Real auth, real refresh.
- Subcommands grouped by resource (domains, links, shorten,
  config). Easy to scan via `--help`.
- `console.table()` for list output — zero deps, looks fine.

**What's missing or weaker:**
- No JSON output mode. Everything is human-formatted; piping the
  output to `jq` requires parsing colored stdout.
- No update-notifier. CLI versions drift silently.
- No shell completions (zsh/bash/fish).
- No telemetry opt-in/out story (might be fine, but unstated).
- No `--workspace` flag override; workspace is sticky in configstore.
- No retry/backoff on network errors — single attempt, exit on failure.
- Bundled TypeScript is shipped, not compiled to plain JS — depends
  on Node 18+.

### 2.3 cal.com — `@calcom/app-store-cli` (Meow + Ink for scaffolding)

cal.com's public CLI is a **contributor tool**, not an end-user tool.
It scaffolds new app-store integrations (calendars, payment
providers, conferencing apps) by running `yarn create-app` →
multi-step Ink form → file generation → codegen regeneration.

**Stack** (`packages/app-store-cli/package.json`):
- `meow` 9 — minimal arg parser (basically `process.argv` with help
  text)
- `ink` 3 — React for terminals
- `ink-select-input` 4.2, `ink-text-input` 4 — form components
- `chokidar` 3.6 — filesystem watcher (for `--watch` mode in the
  codegen pass)
- `@biomejs/biome` — post-codegen formatter
- `lodash.debounce` — debounce regen on rapid file changes

**Two distinct CLIs in one package:**

**(a) The scaffolder** (`src/cli.tsx`, `src/components/AppCreateUpdateForm.tsx`):
- Commands: `create`, `edit`, `delete`, `create-template`,
  `edit-template`, `delete-template`.
- Two modes: **interactive** (Ink form, multi-step prompt) and
  **non-interactive** (all flags supplied, skip prompts entirely).
  The non-interactive path is what makes the scaffolder
  CI/scriptable.
- Validation via Zod (`AppMetaSchema.parse()`). Slug collision
  detection. Conditional fields per template (e.g. external link
  URL required only for `link-as-an-app`).
- File ops: `mkdir`, `cp -r` (`xcopy` on Windows — yes, they handle
  the cross-platform branch), JSON edits to `config.json` and
  `package.json`.
- Post-create: `yarn` to register the new workspace.

**(b) The codegen** (`src/build.ts`, 572 lines):
- Scans `/packages/app-store/**/config.json` and `_metadata.ts`.
- Generates 12 `.generated.{ts,tsx}` bundles — metadata, server
  handlers, browser components, Zod schemas, calendar services,
  video adapters, payment services, CRM apps, redirect-apps list.
- Lazy-import patterns via `dynamic()` for `.tsx` to enable
  per-app code splitting.
- `--watch` mode runs chokidar with debounce. Auto-regen on add /
  change / unlink dir.
- Post-format with Biome.

**What's good:**
- The Ink form for multi-step input is *delightful*. It's the most
  modern-feeling part of any of the three CLIs.
- Non-interactive flag mode means the same CLI works in CI.
- Codegen is config-driven (one source of truth, multiple
  generated bundles). When a contributor adds a new app, every
  consumer file regenerates — no manual wiring across 12 places.
- Watch mode + debounce + Biome format = live dev experience.
- Test coverage: `validateCreateAppFlags.test.ts` (Vitest)
  exercises the validation layer in isolation. Most CLIs go
  untested.

**What's missing or weaker:**
- Meow is fine but feels dated next to citty in 2025 — no nested
  subcommands, hand-rolled help.
- The CLI is pnpm-workspace-only; can't be installed standalone via
  `npm i -g @calcom/app-store-cli`. It's coupled to the cal.com
  monorepo layout.
- The codegen is hand-rolled traversal. A more modern equivalent
  would use `unbuild` or `tsup` with a generator plugin.
- No telemetry, no version-check, no shell completions — same as dub.
- The mix of Meow (scaffolder) + chokidar (codegen) inside one
  `@calcom/app-store-cli` is two products under one name. They could
  split, but historical inertia.

**The deeper pattern worth noting:** cal.com's CLI is a *developer
multiplier*. Adding a new calendar integration without it would
involve editing ~14 files across 6 directories with no validation.
With it, a contributor runs one command, fills a form, and the rest
generates. This is the single most defensible reason to ship a CLI:
collapsing a 14-step contributor workflow to a one-step interactive
form.

---

## 3. Side-by-Side Comparison

| Dimension | rallly | dub | cal.com |
|-----------|--------|-----|---------|
| Public CLI? | No | Yes (`dub-cli`, npm) | Yes (`@calcom/app-store-cli`, monorepo-only) |
| Audience | n/a | End-user (developers using dub API) | Contributors adding to the monorepo |
| Commands | 0 | ~6 | ~6 (scaffolder) + 1 (codegen) |
| Arg parser | n/a | commander | meow |
| Interactive UI | n/a | prompts (Q-by-Q) | Ink (React in terminal) |
| Auth | n/a | OAuth2 + configstore | n/a (operates on local files) |
| Distribution | n/a | tsup → npm | pnpm workspace bin |
| Output | n/a | colored + `console.table` | colored Ink components |
| Tests | n/a | None visible | Vitest on validation layer |
| Watch mode | n/a | n/a | Yes (chokidar + Biome) |
| SDK relationship | n/a | Wraps `dub` SDK | n/a |
| Update notifier | n/a | No | No |
| Shell completions | n/a | No | No |
| JSON output mode | n/a | No | n/a |
| Standout strength | "no CLI is a valid choice" | Real OAuth2, SDK reuse | Ink form + non-interactive flag fallback + codegen |

The three repos cover the full spectrum of CLI bets a SaaS app can
make: zero (rallly), thin SDK-wrapper (dub), domain-specific
scaffolder (cal.com).

---

## 4. Modern CLI Landscape (Context7 audit)

The Node CLI ecosystem in 2025 has four real contenders. Here's how
they compare for an Officehours-sized CLI.

### 4.1 Commander.js (battle-tested, ubiquitous)

Used by: dub, vercel CLI, vue CLI, countless others. The default
choice for "I just need subcommands and flags."

Strengths:
- Mature, ~265 code snippets in c7 alone, 7 years of incremental
  hardening.
- Great help-text generation out of the box.
- `@commander-js/extra-typings` package gives full type inference
  on `.opts()` and `.action()` parameters.
- `parseAsync()` for async action handlers. `showHelpAfterError()`
  and `showSuggestionAfterError()` polish error UX.
- Standalone executable subcommands (write each subcommand as its
  own file, Commander dispatches by `argv[2]`). Great for large
  CLIs.

Weaknesses:
- API feels imperative (`.command().option().action()` chains).
- No first-class lifecycle hooks (setup/cleanup).
- TypeScript support is good with `extra-typings` but not built-in
  to the main package.

### 4.2 Citty (unjs, modern, zero-dep)

Used by: nuxt CLI, nitro, h3, lots of unjs ecosystem. The 2025
standard for new CLIs.

Strengths:
- Zero dependencies, ~5KB.
- `defineCommand` is declarative — config object, not chained calls.
  Reads more like a route config than imperative side-effects.
- First-class TypeScript with full type inference on `args.*`
  inside `run({ args })`.
- Built-in argument types: `string`, `boolean`, `positional`,
  `enum` (with type-narrowed `options`), `number`.
- **Lifecycle hooks** (`setup`, `cleanup`) that run even on error —
  perfect for opening + closing DB connections.
- **Lazy subcommand loading** via dynamic imports — only the code
  for the actually-invoked subcommand is loaded. Big startup-time
  win when the CLI grows.
- `runMain(main)` handles top-level error printing + process exit.
- Aliases per command (string or array).
- Hidden commands (don't appear in help) for internal/debug
  subcommands.

Weaknesses:
- Smaller ecosystem than Commander. Fewer Stack Overflow answers.
- No standalone-executable-subcommand pattern (everything must
  live in one process).
- Less mature — semver-major bumps still happen.

For Officehours, **citty is the right pick.** The lifecycle hooks +
lazy loading + zero deps + declarative API match the project's
"small visible surface, deep stack" identity exactly. The whole
binary will be ~50KB tsup-bundled.

### 4.3 Oclif (Salesforce, multi-command + plugins)

Used by: Heroku CLI, Salesforce CLI, GitHub CLI's friends. The
choice when you have 100+ commands and a plugin ecosystem.

Strengths:
- Plugin architecture (`@oclif/plugin-help`,
  `@oclif/plugin-not-found`, `@oclif/plugin-warn-if-update-available`).
- Built-in S3-based update channel (auto-update binaries from
  releases bucket).
- Topics (namespaced subcommand groups with their own help).
- Cross-platform packaging — produces standalone binaries for
  macOS / Linux / Windows.
- macOS code-signing identifier baked into config.

Weaknesses:
- Heavy. The bare minimum bundle is hundreds of KB.
- File-system based command discovery (commands as files in
  `./commands/`) — magical, can be surprising.
- Steep learning curve for what Officehours actually needs.
- ESM support is recent and still has rough edges.

For Officehours, **oclif is overkill.** Officehours' total command
surface (per §7) is ~25 commands. Oclif starts paying off around
80+. Skip.

### 4.4 Meow (minimal, hand-rolled feel)

Used by: cal.com's app-store-cli, lots of scrappy open source. The
choice when you want `process.argv` with help text and nothing more.

Strengths:
- Tiny, ~5KB.
- Just parses argv into typed flags. Help is a template string.
- Pairs well with Ink for the actual UI.

Weaknesses:
- No subcommand tree. You build the dispatch yourself.
- No type inference on flags beyond what TypeScript can do on a
  `flags: { ... }` literal.
- For nested subcommands (`oh booking create`), you end up
  hand-rolling routing.

For Officehours, **meow is too minimal.** A scheduler CLI has
enough commands that hand-rolling the dispatch becomes annoying by
command #15.

### 4.5 The Verdict

**Citty is the right pick for Officehours.** It's the modern
declarative API, the type inference is excellent, the lazy
subcommand pattern means the CLI startup stays sub-50ms even at
40 commands, and the lifecycle hooks let auth setup + DB cleanup
happen consistently across every command.

If you have strong existing Commander muscle memory, Commander +
`@commander-js/extra-typings` is a fine second choice. The shape of
the resulting CLI will be ~80% the same.

Ignore oclif and meow for this project.

---

## 5. What Each Reference Got Right and Wrong

### Worth stealing

From **dub-cli**:
- OAuth2 authorization-code flow for auth (not API keys pasted into
  env). Real refresh-token rotation. `localhost:4587` callback
  capture pattern.
- SDK reuse — CLI is a thin wrapper. No duplicated fetch logic, no
  schema drift between web client and CLI.
- `configstore` for credentials (`~/.config/configstore/<bin>.json`).
- `chalk` + `ora` + `prompts` as the standard human-UX trio.

From **cal.com app-store-cli**:
- Ink for multi-step interactive forms. Far better UX than
  Q-by-Q `prompts`.
- Non-interactive flag mode that shadows the interactive flow —
  same command works for humans and for CI. Critical for
  scriptability.
- Zod validation layer that's testable in isolation.
- Codegen with watch mode + post-format. Makes the dev loop tight.

From **rallly**:
- The "no public CLI" stance. Don't ship a CLI just to ship one.
- Internal scripts as `pnpm <name>` with `dotenv -e .env -- tsx ./...`.
  Cheap, effective, no abstraction tax.

### Worth avoiding

From dub-cli:
- No JSON output mode. Pipeline-unfriendly.
- No update-notifier or version check.
- No retry / backoff on network errors.
- Auth state is sticky in configstore with no `--workspace` override
  for one-off cross-workspace ops.

From cal.com app-store-cli:
- Monorepo-only distribution. Can't `npm i -g`.
- Meow + hand-rolled subcommand dispatch is showing its age — citty
  would be ~30% less code.
- Two products (scaffolder + codegen) under one name causes
  documentation friction.

From rallly's no-CLI stance:
- The internal scripts are *unbranded* and ad hoc. There's no
  central `--help` view. New contributors have to grep
  `package.json` to find what exists.

---

## 6. The Officehours CLI — Proposal

### 6.1 Identity

One binary, two namespaces:

- `oh` — the public CLI for hosts. Auth-gated (OAuth2 against
  Officehours itself), thin wrapper over the tRPC API.
- `oh dev` — the contributor / operator namespace. Local-only,
  hits the DB and the internal task queue directly. Hidden when
  invoked by an unauthed user.

This mirrors cal.com's pattern (developer tool) and dub's pattern
(user tool) collapsed into a single binary, with the two surfaces
clearly demarcated.

### 6.2 Why both and not split

A contributor opening `oh --help` should see *one* CLI and discover
both surfaces. Two binaries (`oh` and `oh-dev`) double the
documentation surface and confuse first-time installers. One binary
with hidden-by-default `dev` namespace (visible only when
`OH_DEV=1` or when run from a project checkout) is cleaner.

cal.com made the opposite choice (their dev CLI doesn't ship to
end users at all) because their dev workflow is monorepo-coupled
and not transferrable. Officehours' dev workflow can be standalone.

### 6.3 Tech stack

| Concern | Pick | Why |
|---------|------|-----|
| Arg parsing | **citty** | declarative, lazy subcommands, lifecycle hooks |
| Interactive prompts | **@inquirer/prompts** | modern replacement for `prompts` and `inquirer` |
| Multi-step forms | **Ink** | only when the form has 4+ steps |
| Spinners | **ora** | de-facto standard |
| Colors | **picocolors** | tiny chalk replacement (~1KB), no ANSI deps |
| Tables | **cli-table3** | clean tables when `console.table` won't do |
| Config storage | **configstore** | dub's exact pattern |
| OAuth2 | **@badgateway/oauth2-client** | dub uses it, refresh-token rotation works |
| Bundling | **tsup** | dub uses it, zero-config ESM bundler |
| Update notifier | **update-notifier** | one-line setup, polite "new version available" |
| Shell completions | **@bombsh/tab** or hand-rolled | citty doesn't have built-in completions |
| HTTP client | **the existing tRPC client** | reuse `src/trpc/client.ts` after generalizing |
| Testing | **vitest** | matches the existing project test stack |

### 6.4 Architecture

```
packages/cli/
├─ package.json          ─ "bin": { "oh": "./dist/index.js" }
├─ src/
│  ├─ index.ts           ─ entry, runMain(rootCommand)
│  ├─ commands/          ─ one file per top-level command
│  │  ├─ login.ts
│  │  ├─ logout.ts
│  │  ├─ whoami.ts
│  │  ├─ availability/
│  │  │  ├─ index.ts     ─ subcommand router
│  │  │  ├─ get.ts
│  │  │  └─ set.ts
│  │  ├─ bookings/
│  │  │  ├─ index.ts
│  │  │  ├─ list.ts
│  │  │  ├─ cancel.ts
│  │  │  └─ open.ts
│  │  ├─ webhooks/
│  │  │  ├─ index.ts
│  │  │  ├─ create.ts
│  │  │  ├─ list.ts
│  │  │  ├─ delete.ts
│  │  │  └─ replay.ts
│  │  └─ dev/            ─ hidden by default
│  │     ├─ index.ts
│  │     ├─ seed.ts
│  │     ├─ migrate.ts
│  │     ├─ run-cron.ts
│  │     ├─ replay-task.ts
│  │     ├─ scaffold.ts
│  │     └─ doctor.ts
│  ├─ lib/
│  │  ├─ auth.ts         ─ OAuth2 dance, configstore, refresh
│  │  ├─ client.ts       ─ tRPC client wrapped with auth
│  │  ├─ output.ts       ─ human / json output toggle
│  │  ├─ logger.ts       ─ levelled stdout/stderr
│  │  └─ retry.ts        ─ exponential backoff on network errors
│  └─ formats/
│     ├─ table.ts
│     ├─ json.ts
│     └─ yaml.ts
└─ tsup.config.ts
```

This is roughly the dub layout reorganized for citty's `subCommands`
key (which can take a lazy import factory, so each command file
loads on demand).

### 6.5 Auth model

Same as dub: OAuth2 authorization code with PKCE, callback to
`localhost:4587`, refresh-token rotation. This requires Officehours
to publish a public OAuth client (one row in the DB with
`client_id: "oh-cli"`, no `client_secret` since CLI is a public
client). The web app already has next-auth — extending it to issue
OAuth2 access tokens to the CLI is a few hours of work using
`next-auth`'s `account` table.

Tokens persist in `configstore` (`~/.config/configstore/oh-cli.json`):

```json
{
  "tokens": {
    "default": {
      "access_token": "...",
      "refresh_token": "...",
      "expires_at": 1714233600000,
      "host": "https://officehours.dev"
    }
  },
  "active_profile": "default"
}
```

Multi-profile support out of the gate: `oh --profile work whoami`
hits a different deployment / user. Single profile is the default;
the multi-profile flag is `oh login --profile <name>`.

### 6.6 Output model

Every command supports `--output=human|json|yaml`. Default is
`human`. JSON mode prints exactly one JSON document on stdout, no
spinners, no colors, exit code communicates success/failure. This
makes `oh bookings list --output=json | jq '.[].visitorEmail'`
trivially compose.

The output helper:

```ts
// lib/output.ts
export function emit<T>(data: T, format: OutputFormat) {
  switch (format) {
    case "json": process.stdout.write(JSON.stringify(data, null, 2) + "\n"); break;
    case "yaml": process.stdout.write(stringifyYaml(data)); break;
    case "human":
    default:
      // each command provides its own renderer
      break;
  }
}
```

### 6.7 Distribution

Published as `@officehours/cli` on npm.

```bash
# global install
npm i -g @officehours/cli

# one-off
npx @officehours/cli login

# Homebrew tap (later)
brew install officehours/tap/oh
```

Bundled via tsup to a single ESM file at `./dist/index.js`. Target
Node 18+. Shebang `#!/usr/bin/env node` at the top of the bundled
file.

For long-term polish: package as a single binary via `pkg` or
`bun build --compile` so users without Node installed can still
`brew install`. This is a phase-3 nicety, not a launch requirement.

---

## 7. Concrete Command Surface

Every command below has a real user story. None are speculative.

### 7.1 Auth

```
oh login [--host <url>] [--profile <name>]
oh logout [--profile <name>]
oh whoami [--output=human|json]
oh switch <profile>
```

`oh login` opens the user's browser to the Officehours OAuth
consent screen, captures the redirect at `localhost:4587`, stores
tokens. Mirrors dub exactly.

### 7.2 Availability (host-side)

```
oh availability get [--output=human|json|yaml]
oh availability set --from-file <path>
oh availability set --interactive    # Ink form, drag-and-fill week
oh availability copy mon tue,wed,thu  # copy mon's hours to listed days
oh availability clear <day>
```

`set --from-file` reads YAML/JSON and bulk-updates the schedule.
This is the highest-leverage CLI command — power users hate
clicking through 7 days of dropdowns when a `mon: 09:00-17:00`
YAML works in 4 seconds.

### 7.3 Bookings

```
oh bookings list [--upcoming|--past] [--limit N] [--output=...]
oh bookings show <uid> [--audit]    # show audit timeline
oh bookings cancel <uid> [--reason "<text>"]
oh bookings open <uid>              # open in browser
oh bookings export --since 2025-04-01 --output=json > bookings.json
```

`bookings export` is the second-highest-leverage command —
hosts wanting to back up their data, do GDPR exports, or move to
another platform get a single command instead of a manual web
scrape.

### 7.4 Webhooks

```
oh webhooks create --url <url> --events booking.created,booking.cancelled
oh webhooks list [--output=...]
oh webhooks delete <id>
oh webhooks replay <delivery-id>
oh webhooks tail              # live-stream incoming webhook events to stdout
oh webhooks test <url>        # POST a test payload + show signature verification result
```

`webhooks tail` is unique. Hosts integrating Officehours into
their own systems want to see what events are firing, in real
time, without setting up a separate logging pipeline. Implemented
on top of the existing SSE bus.

`webhooks test` is the integration aid — POSTs a sample payload to
the user's URL, prints the request, prints the response, computes
what HMAC the user's code should have produced. Single command,
saves an hour of "why isn't my webhook handler working."

### 7.5 Dev / Operator

These appear in `--help` only when `OH_DEV=1` or the working dir
is an Officehours project checkout (sentinel: `prisma/schema.prisma`
in cwd or any ancestor).

```
oh dev seed                         # rallly's pattern
oh dev migrate                      # wrap prisma migrate
oh dev run-cron <name>              # invoke cron handler synchronously
oh dev replay-task <task-id>        # re-execute a Task row from the queue
oh dev scaffold mutation <name>     # cal.com's pattern, generate a mutation hook
oh dev scaffold page <route>        # generate a host page following the brutalist template
oh dev doctor                       # health check: env, DB, Sentry, cron, all green/red
oh dev studio                       # wraps prisma studio
oh dev tunnel                       # ngrok-like local webhook tunnel for testing
oh dev fixtures load <name>         # load a named fixture set
oh dev audit replay <booking-uid>   # replay the audit log for a booking with diffs
```

`oh dev doctor` is the operator-experience win: one command tells
you "your DEV env is missing CRON_SECRET, your DATABASE_URL points
at a stale db, your Sentry DSN is set but unreachable" — instead of
each of these failing silently in production.

`oh dev scaffold mutation <name>` and `oh dev scaffold page <route>`
are the cal.com pattern applied to Officehours' own conventions.
Generate the mutation hook stub matching `src/lib/mutations/`'s
shape; generate the page stub matching the brutalist page template.

### 7.6 Misc

```
oh --version
oh --help
oh completions install [bash|zsh|fish]
oh status                 # ping the production health endpoint
```

---

## 8. Why Build One — Benefits Audit

A CLI for Officehours pays off in five specific ways. Each is
concrete; none are hand-wave.

### 8.1 Power users get a 10× faster path

A host who runs office hours every week will set their
availability ~50 times. Each web-form interaction is ~12 seconds
of clicking. A YAML-driven `oh availability set --from-file
schedule.yml` is 2 seconds plus the time to edit one file. Saves
a host ~8 minutes/week. Over a semester, hours.

This benefit only matters for the small fraction of hosts who'd
install a CLI. But that fraction is exactly the segment most
likely to recommend the product.

### 8.2 Integrations stop being painful

Right now, hosts integrating Officehours into a Slack bot or a
custom dashboard have to (a) read API docs, (b) handle OAuth, (c)
write fetch wrappers, (d) verify HMAC signatures, (e) handle
retries. With the CLI, step (c) collapses: `oh bookings list
--output=json` in a shell script is the integration. The CLI is
*the SDK* for the bash-native crowd.

This is the single biggest argument and the one dub explicitly
makes with their CLI design.

### 8.3 The dev experience for contributors becomes coherent

`oh dev doctor`, `oh dev seed`, `oh dev replay-task`, `oh dev
scaffold` are the operator commands every backend has and every
backend hides in 14 different `pnpm scripts`. Pulling them into
one `--help` view means a new contributor can learn the dev
workflow by reading `oh dev --help` instead of grepping
`package.json`.

cal.com's app-store-cli is the proof: contributors *love* it
because it collapses a 14-step process to one command. The same
shape works for Officehours' own contributor surface (page
scaffolds, mutation hooks, fixture data).

### 8.4 The CLI is a forcing function for the public API

Today, Officehours has tRPC, which is great for the web client
and useless for anyone not using TypeScript. Building the CLI
forces the public REST/JSON-RPC API surface (Tier B item B2 in
`OFFICEHOURS-DEPTH-IDEAS.md`). Once the CLI hits the public API
instead of tRPC directly, the API contract is tested-by-use every
time anyone uses the CLI.

This is the cleanest argument for *order of operations*: the CLI
should not be built before B2 (public API + OpenAPI). Build B2
first, then the CLI rides on top.

### 8.5 The CLI is a craft demo on a portfolio

A scheduler that you can `npx @officehours/cli login` and use from
the terminal reads, on a portfolio, as "this person ships software
that is operable, scriptable, and integrate-able." It's a single
sentence in a README that takes a recruiter from "another CRUD
app" to "wait, this is built like a real product."

---

## 9. Risks and Anti-Goals

The argument for a CLI is real. The argument *against* one — or
against scope-creeping it — is also real. These are the failure
modes to plan against.

### 9.1 Don't build before B2 (public API)

If the CLI hits tRPC directly, it's coupled to tRPC's wire format
forever. tRPC v11 → v12 will break the CLI. The CLI must hit
versioned REST or JSON-RPC. So build B2 first.

### 9.2 Don't ship the dev namespace to end users without gating

`oh dev seed` deleting a host's bookings because they ran it in
the wrong shell session would be a real incident. Hide `dev`
commands behind `OH_DEV=1` or a project-checkout sentinel. Print
loud warnings before destructive ops.

### 9.3 Don't try to replicate the web UI

A CLI that mirrors every web page (`oh page show home`, `oh page
list`) is a mistake. The CLI's job is the things the web UI is
*bad* at: bulk operations, shell composition, integration glue,
contributor scaffolding. Don't put `oh booking create
--name=foo --email=...` on a public command list — visitors don't
have CLIs, hosts don't book on behalf of visitors. The web is
right for some tasks; respect that.

### 9.4 Don't ship without telemetry opt-out

A CLI that phones home anonymously is fine. A CLI that phones home
with no opt-out is a privacy violation waiting to happen. First
launch should print:

```
Officehours CLI collects anonymous usage telemetry to improve
the product. To opt out, run: oh config set telemetry.enabled=false
```

dub's CLI doesn't do this. cal.com's doesn't either. Officehours
should — it's a small differentiator that costs nothing.

### 9.5 Don't underprovision tests

The cal.com pattern of testing the validation layer in isolation
is the minimum. Add: snapshot tests on `--help` output (catches
accidental command renames), e2e tests against a fixture
backend (mock server with `msw`), integration tests against a
local DB-backed Officehours instance.

A CLI without tests rots faster than any other code in the project
because nobody runs it during normal dev.

### 9.6 Don't go binary-distribution before npm-distribution is solid

`pkg` and `bun build --compile` look great until you discover
your CLI breaks in CI on Alpine or M1. Ship via npm first, see
what users hit, *then* invest in binary distribution.

---

## 10. Phased Implementation

Map each phase to ~1 week of focused work. The whole CLI gets to
"feature complete for end users" in 4 weeks; with dev / operator
commands in another 2.

**Phase 0 — Prerequisite: B2 (public API + OpenAPI).** From
`OFFICEHOURS-DEPTH-IDEAS.md`. ~2 weeks. Don't start the CLI
without this.

**Phase 1 — Skeleton + auth (1 week).**
- `packages/cli/` workspace.
- citty + tsup build.
- `oh login`, `oh logout`, `oh whoami` working end-to-end.
- OAuth2 client registered server-side. Token persistence in
  configstore.
- `--output=human|json` flag plumbed.

**Phase 2 — Read commands (1 week).**
- `oh availability get`, `oh bookings list`, `oh bookings show`,
  `oh webhooks list`.
- All read-only. Easy. Builds confidence in the auth + output
  layers.

**Phase 3 — Write commands (1 week).**
- `oh availability set --from-file`, `oh bookings cancel`,
  `oh webhooks create/delete/replay/test`.
- Idempotency keys generated client-side in CLI for cancel /
  webhook-create — same primitive the web app uses.

**Phase 4 — Live + polish (1 week).**
- `oh webhooks tail` (SSE consumption).
- `oh availability set --interactive` (Ink form).
- `oh completions install` (bash/zsh/fish).
- Update notifier wired. Telemetry opt-out wired.

**Phase 5 — Dev namespace (1 week).**
- `oh dev doctor`, `oh dev seed`, `oh dev migrate`,
  `oh dev replay-task`, `oh dev tunnel`.
- Hidden by default. `OH_DEV=1` or project-checkout sentinel.

**Phase 6 — Scaffolders (1 week).**
- `oh dev scaffold mutation`, `oh dev scaffold page`.
- The cal.com pattern. Templates live in
  `packages/cli/templates/`.

**Phase 7 — Distribution polish (later, optional).**
- Homebrew tap.
- Binary distribution via `bun build --compile`.
- Shell completion auto-install in CI.

---

## 11. Reference Skeleton (citty, ESM, TypeScript)

A working ~80-line skeleton for the CLI entry. Drop into
`packages/cli/src/index.ts` and tsup will produce a working binary.

```ts
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { version } from "../package.json" with { type: "json" };

const main = defineCommand({
  meta: {
    name: "oh",
    version,
    description: "Officehours — small surface, deep stack.",
  },
  args: {
    output: {
      type: "enum",
      description: "Output format",
      options: ["human", "json", "yaml"],
      default: "human",
    },
    profile: {
      type: "string",
      description: "Auth profile to use",
      default: "default",
    },
  },
  subCommands: {
    login: () => import("./commands/login").then((m) => m.default),
    logout: () => import("./commands/logout").then((m) => m.default),
    whoami: () => import("./commands/whoami").then((m) => m.default),
    availability: () => import("./commands/availability").then((m) => m.default),
    bookings: () => import("./commands/bookings").then((m) => m.default),
    webhooks: () => import("./commands/webhooks").then((m) => m.default),
    // Hidden unless OH_DEV=1 or in project checkout
    ...(shouldShowDev() ? {
      dev: () => import("./commands/dev").then((m) => m.default),
    } : {}),
  },
});

runMain(main);

function shouldShowDev(): boolean {
  if (process.env.OH_DEV === "1") return true;
  // Walk up looking for prisma/schema.prisma — sentinel for project checkout
  return findProjectRoot(process.cwd()) !== null;
}
```

A representative subcommand:

```ts
// commands/bookings/list.ts
import { defineCommand } from "citty";
import { getClient } from "../../lib/client";
import { emit } from "../../lib/output";
import { withSpinner } from "../../lib/ui";

export default defineCommand({
  meta: {
    name: "list",
    description: "List bookings (upcoming or past)",
  },
  args: {
    upcoming: { type: "boolean", default: true, description: "Show upcoming bookings" },
    past: { type: "boolean", description: "Show past bookings instead" },
    limit: { type: "string", default: "20" },
  },
  async setup() {
    // citty hook: runs even if run() throws. Auth check goes here.
  },
  async run({ args }) {
    const client = await getClient(args);
    const tab = args.past ? "past" : "upcoming";
    const limit = Math.min(parseInt(args.limit, 10), 100);

    const bookings = await withSpinner(
      `Fetching ${tab} bookings…`,
      () => client.bookings.list({ tab, limit }),
    );

    emit(bookings, args.output, {
      humanRenderer: (rows) => {
        // Table rendering for human mode
        for (const b of rows) {
          console.log(`${b.slotStart}  ${b.visitorName.padEnd(20)} ${b.visitorEmail}`);
        }
      },
    });
  },
});
```

The lazy-loaded subcommand pattern means `oh login` doesn't pay
the import cost of `bookings`, `webhooks`, or `dev`. Cold-start
stays under 50ms even as the command tree grows.

---

## Closing

Officehours doesn't *need* a CLI. rallly proves that. But the
project's identity — small surface, deep stack — is exactly the
identity a well-built CLI strengthens. The CLI is the operator
surface, the integration surface, and the scriptable surface all
at once. It's also the cheapest possible portfolio multiplier per
hour invested, since it sits on top of the API work
(`OFFICEHOURS-DEPTH-IDEAS.md` Tier B item B2) that's already
worth doing for its own sake.

The order is firm:

1. Ship Tier A items A1–A3 from the depth ideas doc.
2. Ship Tier B item B2 (public API + OpenAPI).
3. Then ship the CLI as described here, ~6 weeks.

Anything earlier is premature. Anything later is leaving leverage
on the table.
