---
name: figma-to-code
description: Port a Figma design (URL, .fig export, or live editor) into this repo's stack with deterministic spec extraction and pixel-level verification. Use when a user shares a Figma node, attaches a .fig file, or asks to match a screenshot/figma frame. Avoids the May 3 2026 chrome-morph workflow's six friction points (rate limits, color confusion, CSS-var fall-through, stale dev server, screenshot mystery, perception bias).
---

# Figma → code

Single-pass workflow for going from a Figma design to a faithful
implementation. Built from the **B.PT127→B.PT131 incident** where a
single dashboard frame took 5 commits and ~3 hours of back-and-forth.
Apply this skill any time the user says "port this Figma" or attaches
a `.fig` file.

## Phase 0 — Confirm what you're matching against

Before opening any tool, lock down THREE things in plain English with
the user. Skipping this is what cost B.PT130.

1. **Source of truth.** "Match Figma exactly" or "match production
   `/bookings`"? Production canonical can differ from Figma if the
   Figma file is out of date — pick one before implementing.
2. **Color identity by hex.** When the user names a color ("Sisal",
   "the darker one", "the rounded panel's bg"), echo it back as a
   hex value: `--oh-frame ≈ #d3ccbd, the darker outer cream`. Mismatch
   here causes F2-class failures.
3. **The 80% spec.** What 3-5 things define this design? Bar height,
   sidebar width, panel inset, panel radius, type tokens. If you can
   list them in 3 lines, you can verify them in 3 pixel samples later.

## Phase 1 — Extract the spec

Pick ONE of these per task. Don't combine.

### Path A — REST API + PAT (default, most reliable)

Stable JSON. Free-tier rate limit is 10 req/min for Dev seats, 6/month
for View/Collab seats — generous enough for spec-time work.

```bash
# user pastes their Personal Access Token into .env once:
# FIGMA_PAT=figd_xxx (scope: file_content:read)

# fetch one frame's subtree (cheaper than the whole file):
curl -H "X-Figma-Token: $FIGMA_PAT" \
  "https://api.figma.com/v1/files/<file_key>/nodes?ids=12:106" \
  > docs/figma/spec-<feature>.json
```

Commit the JSON spec under `docs/figma/`. Implementation reads from
the spec, not from Figma. The git diff makes drift visible.

### Path B — `pnpm figma:spec` (unlimited via WebSocket tap)

The 2026 ace card. Taps the same Kiwi-encoded WebSocket frames Figma's
editor uses, via Chrome DevTools Protocol. **No rate limit.** Project
ships with the audited read-path subset of `allan-simon/figma-kiwi-protocol`
vendored under `vendor/figma-kiwi/` (B.PT132). The unsafe upstream
`bin/decode.mjs` (runtime `git clone evanw/kiwi` + `npm install fzstd`
+ `npx tsx`) was replaced with `scripts/figma-decode.mjs` using
npm-published `kiwi-schema@0.5.0` (Evan Wallace's own lib) +
`fzstd@0.1.1` as normal devDeps. See `vendor/figma-kiwi/AUDIT.md` for
the file-by-file verdicts.

Use when:
- You need the full live scenegraph (variables, instances,
  auto-layout state mid-edit).
- The Figma file has Variables and you're on a non-Enterprise plan
  (the REST `variables/local` endpoint requires Enterprise).
- You're doing a heavy iteration session where REST `?ids=` would
  burn the rate limit.

One-time Chrome + PAT setup (full instructions in
`docs/figma/README.md#figma--code-extract-a-spec-from-a-live-figma-file`).

**Chrome ≥136 gotcha (silent failure mode you'll otherwise hit)**:
the launch command MUST include `--user-data-dir` pointing to a
non-default profile, or Chrome silently drops the debug port.
Renderer processes still inherit the flag (so `ps aux | grep
remote-debugging-port` shows hits, looks fine), but `lsof -nP
-i:9222` returns empty and `curl http://localhost:9222/json/version`
hangs/empty. The canonical command is:

```bash
osascript -e 'quit app "Google Chrome"'   # Cmd+Q is not enough
sleep 2 && pgrep -if "Google Chrome"      # confirm empty
mkdir -p "$HOME/.chrome-debug-profile"

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-debug-profile" &

sleep 3 && lsof -nP -i:9222 | head        # expect TCP *:9222 (LISTEN)
```

The profile is dedicated + persistent — Figma login survives across
sessions. Don't delete `~/.chrome-debug-profile`. CVE mitigation
context + Linux/Windows variants in `docs/figma/README.md`.

After setup:

```bash
pnpm figma:spec chrome-morph --node-id=12:106
# → captures WebSocket frames, decodes scenegraph, filters to node
#   subtree, writes docs/figma/spec-chrome-morph.json
```

Pipeline (each step is a separate pnpm script for debugging):

```
pnpm figma:capture        →  $FIGMA_KIWI_DIR/frame_NNNN_{recv,sent}_*.bin
pnpm figma:decode --write →  $FIGMA_KIWI_DIR/scenegraph.json
pnpm figma:spec <name> --node-id=...  →  docs/figma/spec-<name>.json
```

### Path C — `.fig` file at rest (when the user attaches a zip)

A `.fig` is a ZIP containing `canvas.fig` (kiwi-encoded binary, magic
header `fig-kiwi`), `meta.json`, `thumbnail.png`, `images/`. Decoding
the binary requires `kiwi-schema` + `pako` (deflate) + `fzstd` (zstd
chunk). The dedicated npm package `fig-kiwi` (v0.0.1) is **dead** —
last published 2023, three reverse dependents. Skip it.

If you must parse `.fig` files at rest, two options:
1. Adapt `figma-kiwi-protocol` (Path B) — the wire format is the same.
2. Roll your own minimal parser using the underlying stack. References:
   - `references/fig-binary-format.md` — what's in canvas.fig
   - <https://albertsikkema.com/ai/development/tools/reverse-engineering/2026/01/23/reverse-engineering-figma-make-files.html>
     (parsing approach reference; targets `fig-makee` not `fig-kiwi`)

For most cases, ask the user for the Figma URL instead and use Path A.

### Path D — Figma Dev Mode MCP (the official path)

What you used in B.PT127. Still useful for first-look enrichment
(returns React+Tailwind hints, screenshots, computed CSS):

- Starter View/Collab seats: **6 calls/month** — burn fast.
- Starter Dev/Full seats: 10/min.
- Pro Dev/Full: 15-20/min, 200 calls/day.
- Enterprise: 600/day.

Use Path D ONLY for the initial exploratory pass. Cache the
`get_design_context` JSON to disk on first call (`.figma-cache/<file-key>/<node-id>.json`)
so the second iteration doesn't burn another quota point.

### Path E — Variables / DTCG token export

Use when the design has a Variables collection and you want token-only
sync (colors, type sizes). NOT useful for layout.

- **REST `variables/local`** endpoint requires the calling user on an
  **Enterprise plan**. Skip on free/Pro tiers.
- **`tokens-bruecke`** plugin v2.14.5 (Apr 2026, 242 commits): only
  DTCG exporter with a CLI for CI. Run: `tokens-bruecke --api-key=...`.
- The repo already has `docs/figma/oh-tokens.css` for the reverse path
  (code → Figma). Symmetric flow.

### Skip list (don't reach for these)

- **`fig-kiwi` (npm)** — dead since 2023.
- **Builder.io Visual Copilot / Locofy / Anima** — one-shot
  Figma→Tailwind generators. Output is black-box code that drifts
  from the project's conventions immediately. Useful for a quick
  prototype, not for in-tree work.
- **Native Figma DTCG export** — announced but rollout incomplete
  as of May 2026.
- **`framer-motion` (npm package)** — superseded by `motion`. Same
  API, smaller, MIT, post-rebrand. The project uses `motion@^12`
  (B.PT158); don't add `framer-motion` alongside.

### Animation library decisions

The project uses **`motion@^12` + `gsap@^3` together** (since
B.PT158). Pick per-element, not per-page:

| Use case | Lib |
|---|---|
| Spring-physics transitions (Smart Animate parity) | `motion` |
| Layout-shared element tweens between states | `motion` `<motion.div layout>` |
| Multi-element timelines, FLIP, ScrollTrigger | GSAP |
| Procedural / continuous (marquees, parallax) | GSAP |
| CSS-only hover variants | Tailwind `hover:` |

**Don't combine `motion`'s `layout` prop with GSAP transforms on the
same element** — both rewrite `transform` and clash. Pick one per
element.

### Smart Animate stretch vs no-stretch internals

When translating Figma Smart Animate into Motion shared-layout code,
decide per layer whether children should stretch with the resized
container:

- **Stretch with parent**: keep children as normal DOM, or only give
  the outer frame a `layoutId`.
- **Resize child container but preserve child paint**: give the direct
  child `layout` and forward the same `transition`.
- **Move text/images without scaling**: give the wrapper
  `layout="position"`, forward the same `transition`, pin
  `initial` / `animate` / `exit` opacity to `1`, and use stable child
  `layoutId`s when source and destination both render the child.

For the canonical `/h/[handle]` chip morph, see
`.claude/rules/motion-shared-layout.md` before changing
`SlotRow`, `oh-identity-*`, or any other nested shared-layout node.

### Pipeline bug history (don't regress)

Three bugs in the figma:spec / figma:anim pipeline went live before
the bugs were caught. If you see the symptom, the root cause is
known:

| Symptom | Likely regression |
|---|---|
| `figma:spec` writes a 0-node scenegraph or "Node not found" with valid captures | **B.PT153** — `figma-decode.mjs` not zstd-decompressing data frames |
| `INSTANCE` nodes in spec have no visible content | **B.PT154** — `figma-spec.mjs` not following `INSTANCE.symbolID` references |
| App code reads `prototypeInteractions` directly from `spec-*.json` | **B.PT158** — missing the `figma:anim` extraction step; run `pnpm figma:anim <feature>` |

All three fixed in their respective commits. If you find yourself
debugging similar symptoms, check those commits first.

## Phase 1.5 — Extract animations (when the design has prototype interactions)

Path B already captures `prototypeInteractions` per node (Smart Animate
triggers + spring params + state swaps), but app code shouldn't read
that tree directly. Run the extractor once, commit the artifact:

```bash
pnpm figma:anim <feature>
# → docs/figma/anim-<feature>.json
```

The extractor (B.PT158, `scripts/figma-extract-anim.mjs`) does three
things app code can't easily redo per render:

1. Walks every node's `prototypeInteractions`, classifies each action
   (SMART_ANIMATE / INSTANT_TRANSITION / state-swap / unhandled).
2. For SMART_ANIMATE — matches layers between source + destination
   frames by **relative name path** (the same algorithm Figma uses)
   and emits property deltas (position / size / opacity /
   cornerRadius / fillPaints) only for layers that actually change.
3. Decodes SPRING easingFunction tuples as
   `{ mass, stiffness, damping, velocity }` while keeping the raw
   array — drops directly into `motion`'s spring API.

Full schema + recipes: `references/animation-spec-format.md`.

**Skip this phase only if** the design has zero prototype
interactions (rare — even hover variants count). When in doubt, run
the extractor; an empty `anim-*.json` is the trivial case.

## Phase 2 — Implement against the spec

Standard implementation rules apply (`oh-ui.md`, `dashboard-forms.md`,
the project's "Always do" / "Never do" lists). One Figma-specific
addition:

**Always paint backgrounds with project tokens, not hex.** When the
spec gives you `#eee7d5`, write `bg-oh-bg` or `bg-[color:var(--oh-paper)]`,
not `bg-[#eee7d5]`. Hex literals decouple the surface from theme/dark
mode and break invisibly. The CSS-var cheatsheet lives in
`.claude/rules/oh-css-vars.md` — consult it for the canonical names
and which Tailwind shorthands exist.

## Phase 3 — Verify with pixels, not eyes

This is the F2/F6 fix. Before declaring "matches the design":

### Sample pixels at known coordinates

```bash
# in a debug Playwright spec or Node script:
node -e "
const r = require('child_process').execSync(
  'pngtopnm < baseline.png | pamcut -left=400 -top=10 -width=1 -height=1'
);
"
```

Three samples, then check:
1. Outer chrome bg matches expected `--oh-frame` ≈ `(211, 204, 189)`.
2. Inner panel bg matches expected `--oh-paper` = `(238, 231, 213)`.
3. A specific accent (active-row tint, status dot) matches its hex.

If any disagree with the spec, **stop and re-check the implementation
before regenerating baselines**. Don't trust visual perception on 10%
contrast diffs.

### Diff against the Figma exported PNG

Use `odiff` v4.3.8+ (Zig+SIMD, ~6.7× faster than `pixelmatch` on
fullpage screenshots):

```bash
pnpm add -D odiff-bin
npx odiff baseline.png figma-export.png diff.png \
  --threshold=0.1 --diff-color=#ff00ff
# exits 0 on match, 21 on diff with diff.png written
```

Region-based comparison (only check the rounded panel area, not the
chrome) reduces aliasing noise to acceptable levels.

### Avoid the `expect.toHaveScreenshot --update-snapshots` trap

In B.PT131, that incantation produced inverted-color baselines despite
the live page rendering correctly (verified via in-page canvas
readback of `getComputedStyle`). Root cause never pinned; suspected:
HMR race against the screenshot capture's stability detection.

**Instead**, write baselines via direct `page.screenshot()`:

```typescript
test("regen chrome-morph baselines", async ({ page }) => {
  const fs = await import("node:fs/promises");
  for (const r of ROUTES) {
    await page.goto(r.url, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const buf = await page.screenshot({
      fullPage: true,
      animations: "disabled",
      type: "png",
    });
    await fs.writeFile(`e2e/<spec>.spec.ts-snapshots/${r.file}`, buf);
  }
});
```

Then run the regular `expect.toHaveScreenshot()` test on subsequent
runs — it compares correctly, only the `--update-snapshots` write path
was broken. (Files an investigation follow-up; remedy is the bypass.)

## Phase 4 — Always pre-flight before regen

```bash
# kill any stale dev server (F4 fix)
lsof -i :3001 -sTCP:LISTEN -t | xargs -r kill
# nuke .next cache
rm -rf .next
# run the regen
pnpm exec playwright test e2e/<spec>.spec.ts -g "regen <feature>"
# verify by pixel sample, NOT by viewing the PNG
node scripts/sample-pixels.mjs <baseline-path>
```

## Phase 5 — Commit shape

One commit per fidelity-correction round. Body must include:
- The spec source (path to the Figma JSON / `.fig` file used)
- Which paths verified the implementation (pixel samples, odiff %)
- Any deltas accepted vs flagged for follow-up

Reference the relevant friction code (F1-F6) when a known trap was
avoided ("verified --oh-frame resolves on :root before using
arbitrary class — F3 prevention").

---

## Tools to invest in (build vs buy)

The B.PT127→B.PT131 incident recovered ~3 hours of debugging time.
Same incident repeated 4×/year = 12 hours/year. Worth investing in:

### Worth building (one-time, ~4-6 hours total)

1. **`scripts/figma-spec.mjs`** — wraps Path A (REST + cache) +
   Path B (figma-kiwi-protocol) behind a single `pnpm figma:spec
   <node-id>` command. Outputs `docs/figma/spec-<feature>.json`,
   commits it. ~2 hours.
2. **`scripts/sample-pixels.mjs`** — Node-only PNG decoder + named
   region sampling. Output: "outer (400,10): rgb(211, 204, 189) ✓
   matches --oh-frame". ~1 hour.
3. **`scripts/baseline-regen.mjs`** — pre-flight ritual (kill 3001 +
   nuke .next) + direct-write screenshot capture. Eliminates F4 + F5
   classes entirely. ~1 hour.
4. **`pnpm odiff:figma <route> <figma-png>`** — pixel-diff harness
   wired to odiff with project-default thresholds. ~1 hour.

### Worth buying

- **Figma Pro plan** ($15/user/month) — 200 MCP calls/day vs Starter's
  6/month. Removes F1 friction for any solo-dev workflow.

### Skip (sounds good, doesn't pay back)

- **Live side-by-side dev route.** Was on the brainstorm list. Builds
  in ~2 hours but only catches issues for the route you're staring at;
  the pixel-diff harness covers more ground.
- **Spec-first commits as a hard rule.** Useful pattern but doesn't
  warrant enforcement; soft preference is enough.

---

## File index

- `references/fig-binary-format.md` — what's in `canvas.fig` (zip
  layout, kiwi magic, compression scheme, image references). Read
  before writing a custom parser.
- `references/friction-incident.md` — verbatim post-mortem of
  B.PT127→B.PT131. The closest thing to a regression test for the
  next port.
- `references/css-var-pitfalls.md` — duplicate of the always-loaded
  cheatsheet at `.claude/rules/oh-css-vars.md` for offline reference.
