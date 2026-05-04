# Incident reference — chrome-morph fidelity port

**Date.** 2026-05-03  
**Commits.** B.PT127 → B.PT131 (5 commits)  
**Time spent.** ~3 hours of back-and-forth  
**Initial goal.** Port Figma node 12:106 (dashboard chrome) into
`/playground/animations/chrome-morph` so the morph variants render
against a faithful chrome.  
**Outcome.** Eventually correct. The friction caught here is the
canonical regression test for the workflow in `SKILL.md`.

## Friction summary

### F1. Figma MCP rate limit (Starter plan)

Mid-port, the MCP server returned: *"You've reached the Figma MCP
tool call limit on the Starter plan."* Couldn't fetch fresh
`get_screenshot` or `get_design_context`. Worked off saved tool
outputs from earlier in the session and the user's exported `.fig`.

**Cost.** ~30 min of "is the Figma source paper-inner or Sisal-inner?"
that one MCP call would have resolved.

**Prevention (skill Phase 1).** Cache `get_design_context` output to
disk on first call. Fall back to REST API + PAT when MCP rate-limits.
Confirm user's plan up-front.

### F2. Color identity confusion

User believed the rounded inner panel was Sisal `#d3ccbd` (darker);
production CSS + Figma both have it as paper `#eee7d5` (lighter).
Three round-trips before settling on production-canonical.

**Cost.** Two commits (B.PT130 inverted, B.PT131 corrected).

**Prevention (skill Phase 0 + Phase 3).** Echo color identity back as
hex before implementing. Pixel-sample production AND Figma AND the
user's reference. Three-way agreement = ship; any disagreement = stop.

### F3. Tailwind v4 `var(--oh-bg)` falls through to transparent

Used `bg-[color:var(--oh-bg)]` thinking `--oh-bg` was on `:root`. It's
NOT — Tailwind v4's `@theme inline` only emits `--color-oh-bg` (the
form `bg-oh-bg` utility resolves to). The arbitrary `var(--oh-bg)`
fell through to transparent. Saved baseline showed no diff because
both surface AND panel had the same fall-through bg.

**Cost.** ~15 min debugging "why doesn't my color change render".

**Prevention.** Always-loaded cheatsheet at `.claude/rules/oh-css-vars.md`
documents which `--oh-*` vars are on `:root` and which are
Tailwind-only (`--color-oh-*`).

### F4. Stale Next.js dev server

A `next dev -p 3001` from 7:43 PM was still running when baseline
regen started at ~9:00 PM. Playwright's `reuseExistingServer: !CI`
honored it. Even after killing + nuking `.next`, the cycle of "compile
→ serve → screenshot" had subtle cache layers that produced wrong
colors despite source matching the live page.

**Cost.** ~45 min mystery debugging. Never fully root-caused.

**Prevention (skill Phase 4).** Pre-flight ritual: kill 3001, nuke
`.next`, then regen. Build a `pnpm baseline:regen` helper that does
this every time.

### F5. `expect.toHaveScreenshot --update-snapshots` mystery

`expect(page).toHaveScreenshot({fullPage: true, animations: "disabled"})`
with `--update-snapshots` consistently wrote PNGs with bg colors
INVERTED from what `page.screenshot({...})` produced on the same page
state. In-page canvas readback of `getComputedStyle` confirmed the
LIVE page rendered correctly. Workaround: direct `page.screenshot()`
+ `fs.writeFile()`.

**Cost.** ~20 min trying to understand it.

**Prevention (skill Phase 3).** Don't use `--update-snapshots` for
ground-truth capture. Use `page.screenshot()` direct write for the
initial baseline; let `expect.toHaveScreenshot()` handle compare on
subsequent runs.

### F6. Visual perception bias on low-contrast diff

Sisal `#d3ccbd` and paper `#eee7d5` differ by ~10% per channel. With
surrounding text + structural elements, my eyes consistently misread
which side was darker. Twice claimed "looks correct" while pixels
disagreed.

**Cost.** ~15 min of "trust pixels, not eyes" recalibration.

**Prevention (skill Phase 3).** Always sample pixels for low-contrast
color identity claims. Never say "looks like X" without backing RGB.

## Lessons that don't fit a single Friction code

- The user is the design arbiter. When they describe the design in a
  way that conflicts with the Figma source, ASK before implementing
  the inversion. B.PT130 implemented their inversion verbatim and had
  to be reverted; B.PT131 should have been B.PT130's content.
- "Match production" and "match Figma" can disagree if the Figma is
  out of date. Pin the source-of-truth before implementing.
- A `.fig` zip's `meta.json` `background_color` is the editor canvas,
  NOT the design's outer surface. Don't read it as a color spec.

## Diff to canonical workflow

After this incident, the workflow changes captured in `SKILL.md`:

| Before | After |
|---|---|
| Open MCP, ask for context, implement | Phase 0 (3-line spec lock) + Phase 1 (REST/kiwi) |
| Visual sanity-check | Phase 3 (pixel sample + odiff) |
| `--update-snapshots` for baselines | Direct `page.screenshot()` write |
| Reuse existing dev server | Kill 3001 + nuke `.next` pre-flight |
| Inline `bg-[color:var(--oh-bg)]` | Cheatsheet-driven token use |
