# Figma workflow

Two complementary directions, both documented here:

- **Figma → code** — extract a spec from a live Figma file. Used when
  porting a design into the codebase. New as of B.PT132.
- **Code → Figma** — port the dashboard into Figma so animations can
  be designed there. Original setup (Figtail + html.to.design + token
  sync). Useful for designers iterating on motion before code lands.

The first one is the one most agent sessions need. Read it first.

## Files

- **`oh-tokens.css`** — flat list of every `--oh-*` token + Tailwind
  theme var, with `color-mix()` expressions resolved to literal
  rgba/hex. Used by the **code → Figma** direction (Figtail plugin
  imports it to populate Figma Variables).
- **`spec-<feature>.json`** — generated artifacts from the **Figma →
  code** pipeline. One per feature you've ported (e.g.
  `spec-chrome-morph.json`). Commit these — they make design drift
  visible in `git diff`.

## Figma → code: extract a spec from a live Figma file

The pipeline is `pnpm figma:spec <feature> --node-id=N:M`. It:

1. Captures the binary WebSocket frames Figma's editor sends to the
   server (via Chrome DevTools Protocol — no Figma API rate limits).
2. Decodes the Kiwi-encoded binary into a JSON scenegraph using
   `kiwi-schema` (Evan Wallace's own lib, normal npm devDep) +
   `fzstd` (zstd decompression).
3. Filters the scenegraph to the requested node and its descendants,
   writes `docs/figma/spec-<feature>.json`.

Code lives in:

- `vendor/figma-kiwi/` — audited subset of
  `allan-simon/figma-kiwi-protocol`. See `vendor/figma-kiwi/AUDIT.md`
  for what was vendored / what was excluded / why.
- `scripts/figma-decode.mjs` — our replacement for the upstream's
  unsafe `bin/decode.mjs`. Same job, normal npm deps, no runtime
  `git clone` or `npm install`.
- `scripts/figma-spec.mjs` — orchestrator (env validation → capture
  → decode → filter → spec emit).

### One-time Chrome + PAT setup

You only do this once per machine. Takes ~5 minutes.

#### 1. Generate a Figma Personal Access Token

- Go to <https://www.figma.com/developers/api>, sign in, **Account
  settings → Personal access tokens → Generate new token**.
- Scope: `file_content:read` (no other scopes needed for the read
  pipeline).
- Copy the `figd_…` value and add it to your `.env`:

  ```
  FIGMA_TOKEN=figd_your_token_here
  ```

  This is only used by the upstream MCP server's page-discovery flow
  if you adopt it later — the kiwi pipeline itself doesn't need it
  but the env var is harmless to set now.

#### 2. Launch Chrome with the remote-debugging port open

Quit Chrome fully first (`osascript -e 'quit app "Google Chrome"'`
+ confirm `pgrep -if "Google Chrome"` returns empty — closing the
window is NOT enough; the browser process must exit).

Then create a dedicated debug-profile directory once and launch
with both flags:

```bash
mkdir -p "$HOME/.chrome-debug-profile"

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-debug-profile" &
```

(Linux: `google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-debug-profile"`.
Windows: `chrome.exe --remote-debugging-port=9222 --user-data-dir=%USERPROFILE%\.chrome-debug-profile`.)

**Why `--user-data-dir` is required (Chrome ≥136)**: Google
mitigated a CVE class where a malicious site could attach to the
default profile via the debug port and exfiltrate cookies / session
tokens. The mitigation rejects `--remote-debugging-port` unless the
flag is paired with a non-default `--user-data-dir`. Without it,
Chrome silently launches without the dev-tools server (you'll see
`DevTools remote debugging requires a non-default data directory`
in stderr) and `lsof -nP -i:9222` returns empty.

The dedicated profile is one-time setup: log into Figma once in
that fresh window, then the profile persists at
`~/.chrome-debug-profile` for every future capture session. Don't
delete it — re-runs reuse the cached login.

Verify the port is listening before continuing:

```bash
lsof -nP -i:9222 | head
# Expect a line containing "TCP *:9222 (LISTEN)"
```

The browser otherwise looks identical. `http://localhost:9222/json`
now lists open tabs and exposes a WebSocket per tab + one for the
browser itself.

#### 3. Open the Figma file you want to spec

Navigate to the file in the same Chrome instance you just launched.
Wait for it to fully load (sidebar populated, canvas visible). The
pipeline reloads the tab to capture the initial scenegraph sync, so
make sure you're on the right page first.

#### 4. Capture the CDP browser WebSocket URL

```bash
CDP_WS_URL=$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl)
echo "$CDP_WS_URL"
# → ws://localhost:9222/devtools/browser/<uuid>
```

Add it to your shell:

```bash
export CDP_WS_URL="ws://localhost:9222/devtools/browser/<uuid>"
```

(Or put it in `.env.local` and `direnv allow`. Whatever's idiomatic
for your shell.)

### Run the pipeline

Once the env is set:

```bash
pnpm figma:spec chrome-morph --node-id=12:106
```

You'll see:

```
[1/3] Capturing Figma WebSocket frames into /tmp/figma_kiwi ...
Target: <Figma file name>
Reloading page...
Capture done. 47 binary frames.
  /tmp/figma_kiwi/frame_0000_recv_2419b.bin (2419 bytes) [RECV] [SCHEMA]
  /tmp/figma_kiwi/frame_0001_recv_15728b.bin (15728 bytes) [RECV]
  ...
[2/3] Decoding scenegraph ...
Schema: frame_0000_recv_2419b.bin (558 types)
Decoded 12 pages
Total nodes: 5247
By type: { CANVAS: 3, FRAME: 142, TEXT: 821, RECTANGLE: 1024, ... }
[3/3] Filtering to node 12:106 subtree ...
Wrote /Users/.../docs/figma/spec-chrome-morph.json (217 nodes)
```

### What's in the spec JSON

```json
{
  "meta": {
    "feature": "chrome-morph",
    "nodeId": "12:106",
    "capturedAt": "2026-05-03T20:15:00.000Z",
    "nodeCount": 217
  },
  "nodeChanges": [
    {
      "guid": { "sessionID": 12, "localID": 106 },
      "type": "FRAME",
      "name": "Dashboard / Normal",
      "size": { "x": 2560, "y": 1271 },
      "fillPaints": [{ "type": "SOLID", "color": { "r": 0.83, "g": 0.80, "b": 0.74 } }],
      ...
    },
    ...216 more...
  ]
}
```

Use `extractCSSFromKiwi(nodeChange)` from `vendor/figma-kiwi/lib/css.mjs`
to convert any node's properties into a CSS map (width, height,
display, padding, background, border-radius, font-family, etc.).
Pure function, no I/O.

### Debugging the pipeline

If `pnpm figma:spec` fails, the three sub-steps run independently:

```bash
# 1. Capture only — verifies Chrome connection
pnpm figma:capture
ls /tmp/figma_kiwi    # should have frame_*.bin files, including one [SCHEMA]

# 2. Decode only — verifies kiwi-schema + fzstd work on the captures
pnpm figma:decode --write
cat /tmp/figma_kiwi/scenegraph.json | jq '.nodeChanges | length'

# 3. Filter only — read scenegraph.json, filter to a node
node scripts/figma-spec.mjs <feature> --node-id=N:M
# (will skip steps 1+2 if FIGMA_KIWI_DIR already has frames + scenegraph.json)
```

Common failure modes:

- **`No Figma design tab found in Chrome`** — open the Figma file in
  the Chrome instance you launched with `--remote-debugging-port=9222`.
  If you have multiple Figma tabs, use `--match <substring>` (passed
  through to `vendor/figma-kiwi/bin/capture.mjs`).
- **`No fig-wire schema frame found`** — the capture didn't include
  the initial scenegraph sync. The capture window is 20s by default;
  bump it with `pnpm figma:capture 60` if your file is large.
- **`Node N:M not found`** — the node ID format is `sessionID:localID`,
  visible in the Figma URL after `?node-id=` (replace `-` with `:`).
  The error message lists available top-level frames as a hint.

### Where this caches

`$FIGMA_KIWI_DIR` (default `/tmp/figma_kiwi`) holds:

- `frame_NNNN_{recv,sent}_*.bin` — raw WebSocket frames. Safe to
  delete; will be re-captured on next `pnpm figma:capture`.
- `scenegraph.json` — decoded full scenegraph. Re-emitted on every
  `pnpm figma:decode --write`.

If you're iterating on the same Figma file across multiple specs
(e.g. extracting `--node-id=12:106` then `13:1121`), set
`FIGMA_KIWI_DIR=docs/figma/.cache/<file-key>` so the captures persist
in the repo (gitignored). Re-running just the third step (filter) is
~50ms vs the full pipeline's ~25 seconds.

## Code → Figma: port the dashboard into a Figma file

The reverse direction. Used to seed a Figma file from production so a
designer can iterate on motion in Figma's prototype panel before code
lands.

### One-time setup (~4 hours)

#### Phase 1 — Variables (~15 min)

1. In Figma: install **Figtail** plugin
   ([Community link](https://www.figma.com/community/plugin/1605825399470035343)).
2. Run plugin → **Import CSS file** → upload `oh-tokens.css`.
3. Figtail creates a Variables collection named `oh` with ~30 typed
   variables (colors, font sizes, radii, focus shadows).
4. Manually add the ~8 motion tokens (`--ease-oh`, `--oh-t-*`) as
   `STRING` Variables — Figma has no native cubic-bezier type, so they
   live as documentation strings. ~5 min.

#### Phase 2 — Port routes (~2-3 hrs)

1. Subscribe to **html.to.design PRO** ($12/mo annual) OR use the free
   tier (10 imports / 30 days, no signup).
2. `pnpm dev` locally; sign in once so authed routes render.
3. Run html.to.design plugin → enter URL → set widths to `400, 768, 1280`.
4. Routes worth porting:
   - `/bookings` — canonical authed page
   - `/availability` — single-form dashboard
   - `/profile`
   - `/settings/general`
   - `/h/[handle]` — visitor surface (use the seeded test user handle)
5. ~15 imports total (5 routes × 3 widths).
6. Plugin prompts for Space Grotesk + JetBrains Mono — one click each
   from Google Fonts.

#### Phase 3 — Rebind tokens (~60-90 min)

html.to.design captures **computed CSS**, not your source classes.
Colors come in as inline hex literals (e.g. `#eee7d5`). Sweep each
imported frame and rebind:

- Fills + strokes → bind to the matching Figma Variable from the `oh`
  collection (created in Phase 1)
- Border-radius → bind to `--oh-r-sm` / `--oh-r-xs` / `--oh-r-window`
- Typography → create Figma Text Styles named `oh-legend`,
  `oh-description`, `oh-eyebrow`, `oh-h1`-`oh-h3`. Apply to imported
  text layers.

#### Phase 4 — Components (~30 min)

After rebinding, promote repeating elements to Figma Components:

- `BookingRow` (the `/bookings` row pattern)
- `EventTypeRow`
- The dashboard chrome (bar + sidebar) — useful as a single Component
  for the chrome-morph animation specs

Variants inherit the rebound tokens automatically.

### Designing animations

1. Build two frames on the same artboard:
   `chrome-morph/normal` and `chrome-morph/preview`.
2. Layout the SAME components in both, with the destination geometry
   (bar height / sidebar width / panel size) reflecting the morph
   end-state.
3. Connect with an interaction:
   - Trigger: `On click` (the prototype toggle)
   - Action: `Smart Animate`
   - Easing: `Custom (cubic-bezier)` — set `x1, y1, x2, y2`
   - Duration: integer ms

4. Hit Play in Figma's prototype panel. The morph plays; tweak until
   it feels right.

### Sending the spec back to code

Paste this shape into chat:

```
Smart Animate: chrome-morph/normal → chrome-morph/preview
Duration: 280ms
Easing: CUSTOM_CUBIC_BEZIER { x1: 0.32, y1: 0.72, x2: 0, y2: 1 }
Properties: bar.height (40 → 0), sidebar.width (200 → 0), panel.area (1fr fills freed space)
```

I'll convert to Tailwind v4 + CSS transitions, GSAP timeline, or
Framer Motion props depending on the property mix. For springs, I need
`mass / stiffness / damping` — Figma's `BOUNCY` / `GENTLE` / `QUICK`
presets are opaque numerics; click **Custom** to read out the
parameters before sending.

### Maintenance

- Re-run Figtail on `oh-tokens.css` when tokens change in code.
- Don't try to keep imported Figma frames in lockstep with code — the
  port is one-directional and re-imports overwrite hand-edits. Treat
  Figma as a **design-iteration sandbox seeded from prod**, not a
  living spec.
- Re-import a route only when its chrome changes structurally; the
  10-min rebind ritual after each re-import is the maintenance cost.
