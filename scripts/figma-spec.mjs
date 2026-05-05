#!/usr/bin/env node
// Project orchestrator: extract a Figma spec for a specific node into
// docs/figma/spec-<feature>.json. Wraps the capture + decode pipeline
// with project conventions (output paths, env validation, single-frame
// filtering).
//
// Usage:
//   pnpm figma:spec <feature> --node-id=12:106
//   pnpm figma:spec --help
//
// Required environment (one-time setup, see docs/figma/README.md):
//   CDP_WS_URL    Chrome DevTools Browser WebSocket URL.
//                 Get from `curl http://localhost:9222/json/version` after
//                 launching Chrome with `--remote-debugging-port=9222`.
//   FIGMA_TOKEN   Personal Access Token (scope: file_content:read).
//                 Only used for page discovery, not for fetching scenegraph.
//
// Optional environment:
//   FIGMA_KIWI_DIR   Frame capture directory. Default: /tmp/figma_kiwi
//
// What this does:
//   1. Validate env. Print actionable setup instructions on miss.
//   2. Run vendored `bin/capture.mjs` (Chrome must already be open on
//      the Figma file you want to spec).
//   3. Run `figma-decode.mjs` to produce a scenegraph JSON.
//   4. Filter the scenegraph to the requested node + its descendants
//      and emit a spec to `docs/figma/spec-<feature>.json` (commit it).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const HELP = `figma-spec — extract a Figma node's spec into docs/figma/

Usage:
  pnpm figma:spec <feature> --node-id=<sessionID:localID>

Arguments:
  <feature>         Filename slug (writes to docs/figma/spec-<feature>.json)
  --node-id=N:M     Figma node id (e.g. 12:106 for the chrome-morph frame)

Environment (set before running):
  CDP_WS_URL        Chrome DevTools Browser WebSocket URL
  FIGMA_TOKEN       Personal Access Token (file_content:read scope)
  FIGMA_KIWI_DIR    Frame capture dir (default: /tmp/figma_kiwi)

One-time Chrome setup:
  1. Quit Chrome.
  2. Relaunch with: chrome --remote-debugging-port=9222
  3. Open the Figma file you want to spec.
  4. curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl
  5. export CDP_WS_URL="<that url>"
  6. Generate a PAT at https://www.figma.com/developers/api -> account
     settings -> personal access tokens. Scope: file_content:read.
  7. export FIGMA_TOKEN="figd_..."

Then:
  pnpm figma:spec chrome-morph --node-id=12:106

See .claude/skills/figma-to-code/SKILL.md for the full workflow.`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP + '\n');
  process.exit(args.length === 0 ? 1 : 0);
}

const feature = args.find((a) => !a.startsWith('-'));
const nodeIdArg = args.find((a) => a.startsWith('--node-id='))?.split('=')[1];

if (!feature) {
  console.error('Missing <feature> argument. See --help.');
  process.exit(1);
}
if (!nodeIdArg || !/^\d+:\d+$/.test(nodeIdArg)) {
  console.error(`Missing or invalid --node-id (got "${nodeIdArg}"). Format: sessionID:localID, e.g. 12:106`);
  process.exit(1);
}

if (!process.env.CDP_WS_URL) {
  console.error('CDP_WS_URL not set. See pnpm figma:spec --help for one-time Chrome setup.');
  process.exit(1);
}

const FIGMA_KIWI_DIR = process.env.FIGMA_KIWI_DIR || '/tmp/figma_kiwi';
mkdirSync(FIGMA_KIWI_DIR, { recursive: true });

// Step 1: capture
console.error(`[1/3] Capturing Figma WebSocket frames into ${FIGMA_KIWI_DIR} ...`);
const captureResult = spawnSync(
  'node',
  [join(REPO_ROOT, 'vendor/figma-kiwi/bin/capture.mjs')],
  {
    stdio: 'inherit',
    env: { ...process.env, FIGMA_KIWI_DIR },
  },
);
if (captureResult.status !== 0) {
  console.error('Capture failed.');
  process.exit(captureResult.status || 1);
}

// Step 2: decode
console.error(`[2/3] Decoding scenegraph ...`);
const decodeResult = spawnSync(
  'node',
  [join(REPO_ROOT, 'scripts/figma-decode.mjs'), '--write'],
  {
    stdio: 'inherit',
    env: { ...process.env, FIGMA_KIWI_DIR },
  },
);
if (decodeResult.status !== 0) {
  console.error('Decode failed.');
  process.exit(decodeResult.status || 1);
}

// Step 3: filter to node subtree + write spec
const scenegraphPath = join(FIGMA_KIWI_DIR, 'scenegraph.json');
if (!existsSync(scenegraphPath)) {
  console.error(`Decoder did not produce ${scenegraphPath}.`);
  process.exit(1);
}

console.error(`[3/3] Filtering to node ${nodeIdArg} subtree ...`);
const scenegraph = JSON.parse(readFileSync(scenegraphPath, 'utf8'));
const nodes = scenegraph.nodeChanges || [];
const byId = new Map();
for (const nc of nodes) {
  const id = `${nc.guid?.sessionID || 0}:${nc.guid?.localID || 0}`;
  byId.set(id, nc);
}

const root = byId.get(nodeIdArg);
if (!root) {
  console.error(`Node ${nodeIdArg} not found in captured scenegraph.`);
  console.error(`Available top-level frames:`);
  for (const nc of nodes.slice(0, 40)) {
    if (nc.type === 'FRAME' || nc.type === 'CANVAS') {
      const id = `${nc.guid?.sessionID || 0}:${nc.guid?.localID || 0}`;
      console.error(`  ${id}  ${nc.name || '(unnamed)'}`);
    }
  }
  process.exit(1);
}

// Walk the parent-pointer tree to collect descendants
const collected = new Map([[nodeIdArg, root]]);
let changed = true;
while (changed) {
  changed = false;
  for (const nc of nodes) {
    const id = `${nc.guid?.sessionID || 0}:${nc.guid?.localID || 0}`;
    if (collected.has(id)) continue;
    const parentId = nc.parentIndex?.guid
      ? `${nc.parentIndex.guid.sessionID || 0}:${nc.parentIndex.guid.localID || 0}`
      : null;
    if (parentId && collected.has(parentId)) {
      collected.set(id, nc);
      changed = true;
    }
  }
}

// B.PT154 — follow INSTANCE.symbolID references and include the
// referenced SYMBOL subtrees. Without this, a 1-to-1 port loses the
// actual visual content of every component instance — the bounding-
// box geometry travels via INSTANCE nodes but the rendered children
// (icons, button bodies, list-item innards) live under SYMBOL nodes
// that are descendants of OTHER frames in the same Figma file.
//
// Symbols can contain nested instances, so this is a fixed-point
// loop: keep adding symbols until no new INSTANCE.symbolID references
// surface a not-yet-included symbol.
//
// Variables (oh-token references) are NOT followed — TEXT and
// fillPaints carry their concrete values inline, so the port can
// derive token mappings from those + the project's existing token
// table without a separate VARIABLE collection.
function collectReferencedSymbols(initialMap, allNodes) {
  const idOf = (g) => `${g?.sessionID || 0}:${g?.localID || 0}`;
  const byIdLookup = new Map();
  for (const nc of allNodes) byIdLookup.set(idOf(nc.guid), nc);

  let added = true;
  while (added) {
    added = false;
    const newSymbolIds = new Set();
    for (const nc of initialMap.values()) {
      if (nc.type !== 'INSTANCE') continue;
      const sid = nc.symbolData?.symbolID;
      if (!sid) continue;
      const symId = idOf(sid);
      if (initialMap.has(symId)) continue;
      newSymbolIds.add(symId);
    }
    for (const symId of newSymbolIds) {
      const sym = byIdLookup.get(symId);
      if (!sym) continue;
      initialMap.set(symId, sym);
      added = true;
      // Add the symbol's whole subtree by re-running the parent walk.
      let inner = true;
      while (inner) {
        inner = false;
        for (const nc of allNodes) {
          const id = idOf(nc.guid);
          if (initialMap.has(id)) continue;
          const parentId = nc.parentIndex?.guid ? idOf(nc.parentIndex.guid) : null;
          if (parentId && initialMap.has(parentId)) {
            initialMap.set(id, nc);
            inner = true;
          }
        }
      }
    }
  }
}
const beforeSymCount = collected.size;
collectReferencedSymbols(collected, nodes);
const symAdded = collected.size - beforeSymCount;
if (symAdded > 0) {
  console.error(
    `       + ${symAdded} nodes from referenced SYMBOL subtrees (B.PT154)`,
  );
}

const spec = {
  meta: {
    feature,
    nodeId: nodeIdArg,
    capturedAt: new Date().toISOString(),
    nodeCount: collected.size,
  },
  nodeChanges: [...collected.values()],
};

const outDir = join(REPO_ROOT, 'docs/figma');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `spec-${feature}.json`);
writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.error(`Wrote ${outPath} (${collected.size} nodes)`);
