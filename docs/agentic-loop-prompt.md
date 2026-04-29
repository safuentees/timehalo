# The Officehours agentic loop prompt (verbatim)

This is the **project-specific** version of the agentic loop — the
exact prompt that produced the BACKLOG.md / commit-msg-hook / SoT
discipline shipping pattern across the late-stage Officehours sessions.

The **generalized cross-project** version lives in two places:

- `~/.claude/skills/agentic-loop/SKILL.md` — Claude Code skill
  (auto-invokes when matching keywords appear in the user message)
- `~/.codex/AGENTS.md` — user-level cross-tool default (Codex /
  Cursor / Copilot / Windsurf / Amp / Devin / Jules per the LF spec)

Use this Officehours version when:

1. You want to copy-paste the verbatim prompt into a fresh Claude /
   ChatGPT / Codex session that doesn't yet have access to the
   user-level skill.
2. You're transplanting the pattern to another tRPC + Prisma + Next
   project and want a starting point that already has the gate
   commands / commit-hook reference / SoT file name baked in.
3. You're studying the prompt to understand which parts are
   project-specific vs. universal — comparing this file against the
   user-level skill makes the line clearly visible.

If the prompt and `BACKLOG.md` ever disagree, `BACKLOG.md` wins. The
prompt is the *runtime choreography*; the BACKLOG is the *state*.

---

## The prompt

```
Read BACKLOG.md — the single source of truth — and pick up at the top of its
"What's next" priority list. Work through every OPEN row sequentially. No
skipping, no parallel work, no subagents. Continue until the OPEN list is
empty or you hit something that genuinely needs my input.

For each item, run this loop:

  1. Research. Read the patterns the item cites — `~/Desktop/cal.com`,
     `~/Desktop/dub`, `~/Desktop/rallly` — sequentially without skipping
     so you have a real reference before designing. Use Context7
     nested `AGENTS.md` and every relevant rule under `.claude/rules/`
     before writing code.

  2. Plan. In your reply, write a short plan: files created / edited,
     migrations, new tests, the commit subject. That's the contract.

  3. Implement. Follow `.claude/rules/` (brutalist UI, tRPC+Prisma,
     dashboard forms, mutation hooks, testing). One-domain commits —
     don't bundle unrelated work.

  4. Verify. `pnpm tsc --noEmit && pnpm lint && pnpm test:run` clean.
     For UI work, smoke-test via `pnpm dev` before declaring done.
     Don't move on with red gates.

  5. Update BACKLOG.md. Flip the row's status OPEN → SHIPPED, fill in
     the commit SHA in "Closed by". `.githooks/commit-msg` will reject
     the commit if BACKLOG.md isn't in the staged diff. If you discover
     a new deferral while implementing, add it as a new row (next free
     ID) in the same commit and put `Defers: <new-id>` in the body.

  6. Commit. Conventional Commits style. Body explains the why and
     references the BACKLOG row. Ends with the standard Co-Authored-By
     trailer. One commit per item — never `git add -A` or `git add .`,
     stage exactly the files your plan named.

  7. Report. Three bullets: item ID + title, commit SHA, one-line
     summary. Then immediately start phase 1 of the next OPEN row.
     Don't ask "should I continue?" — auto-mode means continue.

Stop and ask only when:
  - The action is destructive or irreversible (force push, drop a Prisma
    model with data, delete a tracked file, modify shared infra,
    `rm -rf` anything outside the repo's build dirs).
  - You need an external resource only I can produce (API key, OAuth
    client registration, Stripe product, third-party signup, env var
    I haven't set).
  - The item's design has a real branch and BACKLOG.md doesn't pick
    one — propose A/B, recommend one, await the call.
  - A gate has failed three times after independent fix attempts.

Never:
  - Spawn subagents (Agent tool, Task tool, parallel sessions). Stay
    focused — one item at a time, sequential within and across.
  - Skip an OPEN row. If it's blocked by another OPEN row, surface the
    dependency and move to the next unblocked row — don't speculate
    around the block.
  - Bypass the commit-msg hook with `--no-verify` for a state change
    (only acceptable for genuine back-references that don't move
    BACKLOG.md state).
  - Use `as any`, `revalidatePath` for normal writes, the
    `useState(false) + useEffect(() => setMounted(true))` pattern, or
    anything the "Never do" list in AGENTS.md forbids.

No time limit. No effort cap. Perfect the craft — read the existing
section before writing the next one, lift the right shape from cal.com
/ dub / rallly when it applies, write the test before declaring done.
The point is that every commit defends itself in a senior code review,
not that we land items quickly.

Begin with the first OPEN row in BACKLOG.md's "What's next" list.
```

---

## What's project-specific in this prompt (and where the generalized version lives)

| Project-specific bit | Generalized to |
|---|---|
| `BACKLOG.md` | "the project's SoT tracking file" |
| `~/Desktop/cal.com`, `~/Desktop/dub`, `~/Desktop/rallly` | "every reference codebase named in the project's AGENTS.md" |
| `.claude/rules/` (brutalist UI, tRPC+Prisma, dashboard forms, mutation hooks, testing) | "every relevant rule under the project's rules directory" + nested AGENTS.md |
| `pnpm tsc --noEmit && pnpm lint && pnpm test:run` | "the project's pre-commit gates from AGENTS.md Commands section" |
| `pnpm dev` smoke test | "boot the project's dev server and hit the route as the actual user would" |
| `.githooks/commit-msg` | "the project's commit hooks (`.githooks/`, `.husky/`, `lefthook.yml`, `pre-commit-config.yaml`)" |
| Stripe-specific external resource | "API key, OAuth client registration, third-party signup, paid service activation, env var the agent can't generate, DNS record" |

The 7-phase shape, the 4 stop conditions, and the never-list are all
universal. The generalized versions at `~/.claude/skills/agentic-loop/`
and `~/.codex/AGENTS.md` extract those and parameterize the rest.

---

## How to use across projects

### Claude Code (any project)

The skill at `~/.claude/skills/agentic-loop/SKILL.md` auto-invokes when
the user types phrases like "loop through every OPEN row" or "ship the
backlog." No setup needed per project — Claude Code reads
`~/.claude/skills/` globally. The skill defers to the active project's
`AGENTS.md` for project-specific gates and reference codebases.

### Codex / Cursor / Copilot / Windsurf / Amp / Devin / Jules

The user-level `~/.codex/AGENTS.md` provides global defaults per the
LF Agentic AI Foundation spec. Each tool reads it natively. Project-
level `AGENTS.md` overrides the global defaults when conflicts arise.

### One-shot copy-paste

If you're in a fresh chat session that doesn't have access to either
of the above, the prompt at the top of this file is the verbatim
project-specific version. Copy-paste it into the first message after
priming the session with "you have access to my Officehours repo at
`~/Desktop/trpc-lab`."

For a new project, copy the prompt and replace the project-specific
bits per the table above.
