# Vendor audit — figma-kiwi-protocol

**Vendored from.** <https://github.com/allan-simon/figma-kiwi-protocol>
**Commit reference.** Master branch as of 2026-04-29 (last upstream
update timestamp at audit time)
**Vendored on.** 2026-05-03
**License.** MIT (copy in `LICENSE` alongside this file)
**Vendor scope.** Read-path only (binary capture + decode). Write-path
(`session.mjs`, `clone.mjs`, `builder.mjs`) **not vendored** — would
let mutations propagate live to other Figma collaborators, which we
don't want.

## Audit method

Each file was fetched directly from GitHub via `gh api .../contents/<path>`,
read in full, and inspected for the following risk patterns:

- `child_process.exec` / `execSync` / `spawn` (shell-out)
- `fs.write*` / `fs.unlink*` outside expected output paths
- `eval()` / `new Function()` / dynamic code execution
- `require()` of paths derived from runtime data
- Network calls (`fetch`, `http`, `net`, `WebSocket`) to non-localhost
  destinations
- `import()` of remote URLs
- Postinstall / lifecycle script behavior

## File-by-file verdicts

### `lib/kiwi.mjs` — SAFE, vendored

3 pure functions: `isFigWireFrame`, `extractCompressedSchema`,
`isZstdCompressed`. Just buffer inspection (`TextDecoder`,
`subarray`, byte comparison). **Zero imports.** No I/O, no network,
no shell. Clean.

### `lib/scenegraph.mjs` — SAFE, vendored

5 pure functions: `decodePage`, `nodeId`, `mergePages`, `buildTree`,
`countByType`, `serializeScenegraph`. Map/Array/JSON manipulation.
**Zero imports.** Operates on pre-decoded objects passed in. Clean.

### `lib/css.mjs` — SAFE, vendored

3 pure functions: `rgbaToCSS`, `extractCSSFromKiwi`,
`extractCSSFromAPI`. Math + string formatting. **Zero imports.**
Takes a node object, returns a CSS property map. Clean.

### `lib/index.mjs` — SAFE (after trim), vendored as `index.mjs`

Re-export barrel. **Trimmed** — removed re-exports from `svg.mjs`
(which we did not vendor — 26KB of vector geometry decoding we don't
need). Re-exports only the three lib modules above.

### `bin/capture.mjs` — SAFE, vendored

Captures Figma WebSocket binary frames via Chrome DevTools Protocol.
Imports: `fs.writeFileSync` + `fs.mkdirSync` (to write captured bin
files into `FIGMA_KIWI_DIR`, default `/tmp/figma_kiwi`), and our
local `kiwi.mjs`. Network: `fetch(localhost:9222/json)` to discover
Chrome tabs (URL derived from `CDP_WS_URL` env var, scoped to
localhost CDP port). Opens a `WebSocket` to the Chrome debug port
(also localhost). **No `child_process`, no `eval`, no remote network
calls, no destination outside `FIGMA_KIWI_DIR`.** Clean.

## Files NOT vendored (and why)

| Upstream file | Reason for exclusion |
|---|---|
| `lib/svg.mjs` (26KB) | SVG path extraction we don't need yet. Trim now, audit + add later if a use case appears. |
| `lib/session.mjs` (11KB) | Write path — opens a standalone WebSocket to Figma's multiplayer endpoint and pushes mutations. Out of scope. |
| `lib/clone.mjs` (10KB) | Deep-clone subtree mutation. Write path. |
| `lib/builder.mjs` (4KB) | Frame builder for write path. |
| `bin/decode.mjs` (4.2KB) | **UNSAFE** — runs `git clone https://github.com/evanw/kiwi.git` AND `npm install fzstd` AND `npx tsx cli.ts` at runtime. Replaced with our own `scripts/figma-decode.mjs` that uses npm-published `kiwi-schema` + `fzstd` as devDeps. |
| `bin/decode-frames.mjs`, `bin/extract-svgs.mjs`, `bin/figma-clone.mjs`, `bin/figma-write.mjs`, `bin/recon-handshake.mjs`, `bin/standalone-client.mjs`, `bin/build-footer-fresh.mjs`, `bin/flatten.mjs`, `bin/footer-responsive-fix.mjs`, `bin/inject-test.mjs`, `bin/quality.mjs`, `bin/to-html.mjs`, `bin/cli.mjs` | Out of scope (write path / additional features). Ours `scripts/figma-spec.mjs` orchestrates capture + decode in 100 LOC without these. |

## Replacement for the unsafe `decode.mjs`

`scripts/figma-decode.mjs` (in this repo) does the same job using
**npm-published, no-deps** packages:

- `kiwi-schema@0.5.0` — published by Evan Wallace himself, MIT, no
  runtime dependencies. Provides `decodeBinarySchema` + `compileSchema`
  (the same primitives the upstream `decode.mjs` runtime-installs via
  `git clone evanw/kiwi`).
- `fzstd@0.1.1` — by 101arrowz, MIT, no runtime dependencies. Pure-JS
  zstd decompression.

Both go through normal `pnpm add -D` (no postinstall scripts that
modify system state).

## Update protocol

When upstream changes need pulling:

1. Re-fetch each vendored file via `gh api repos/allan-simon/figma-kiwi-protocol/contents/<path> -H "Accept: application/vnd.github.raw"` into `/tmp/`.
2. Diff `/tmp/<file>` against `vendor/figma-kiwi/<path>`.
3. Re-audit any new lines for the risk patterns listed above.
4. Update this file's "Vendored on" timestamp + "Commit reference".
5. Bump the relevant changelog (`BACKLOG.md` row, fresh row preferred
   over editing in place).

## Last verification run

- 2026-05-03 — initial vendoring from `master` branch (last upstream
  update 2026-04-29).
