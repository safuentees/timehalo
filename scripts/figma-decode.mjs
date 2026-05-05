#!/usr/bin/env node
// Decode captured Figma WebSocket binary frames into a JSON scenegraph.
//
// Replaces the upstream `figma-kiwi-protocol/bin/decode.mjs` which does
// `git clone evanw/kiwi` + `npm install fzstd` + `npx tsx` at runtime.
// This version uses npm-published `kiwi-schema` (by Evan Wallace himself,
// the same library the runtime-cloned repo would build) + `fzstd` as
// devDeps. No runtime code execution from external sources.
//
// Pipeline:
//   1. Read frames written by `vendor/figma-kiwi/bin/capture.mjs` from
//      $FIGMA_KIWI_DIR (default /tmp/figma_kiwi).
//   2. Find the fig-wire schema frame (magic "fig-wire" + version +
//      zstd-compressed kiwi schema). Decompress with fzstd.
//   3. Compile the schema with kiwi-schema -> JS decoder.
//   4. Decode each non-fig-wire RECV frame as a kiwi Message ->
//      scenegraph node tree.
//   5. Merge all decoded pages into one scenegraph and emit as JSON
//      to stdout (or $FIGMA_KIWI_DIR/scenegraph.json with --write).

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decompress as fzstdDecompress } from 'fzstd';
import {
  decodeBinarySchema,
  compileSchema,
} from 'kiwi-schema';
import {
  isFigWireFrame,
  extractCompressedSchema,
  isZstdCompressed,
} from '../vendor/figma-kiwi/lib/kiwi.mjs';
import {
  decodePage,
  mergePages,
  serializeScenegraph,
  countByType,
} from '../vendor/figma-kiwi/lib/scenegraph.mjs';

const DIR = process.env.FIGMA_KIWI_DIR || '/tmp/figma_kiwi';
const argv = process.argv.slice(2);
const writeToDisk = argv.includes('--write');

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.bin'))
  .sort();

if (!files.length) {
  console.error(`No frame files in ${DIR}. Run \`pnpm figma:capture\` first.`);
  process.exit(1);
}

// 1. Find the fig-wire schema frame
let schema = null;
for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  if (isFigWireFrame(new Uint8Array(buf))) {
    const compressed = extractCompressedSchema(new Uint8Array(buf));
    const rawSchema = fzstdDecompress(compressed);
    schema = decodeBinarySchema(rawSchema);
    console.error(`Schema: ${f} (${schema.definitions.length} types)`);
    break;
  }
}

if (!schema) {
  console.error('No fig-wire schema frame found. Capture the initial reload.');
  process.exit(1);
}

// 2. Compile schema -> decoder
const decoder = compileSchema(schema);

// 3. Decode every non-schema RECV frame.
//
// B.PT153: scenegraph data frames arrive zstd-compressed (raw zstd
// magic 28 B5 2F FD at byte 0 — no fig-wire header). Schema frames
// are framed by `fig-wire` + version + zstd. Both need fzstd
// decompression before kiwi-decode; the bug was that data frames
// were passed straight to kiwi which then failed with "invalid
// message" on every payload, producing a 0-node scenegraph.
const pages = [];
for (const f of files) {
  if (!f.includes('_recv_')) continue;
  const buf = readFileSync(join(DIR, f));
  const u8 = new Uint8Array(buf);
  if (isFigWireFrame(u8)) continue; // schema frame, already handled
  try {
    // Raw zstd payload → decompress, then kiwi-decode. The
    // `isZstdCompressed` helper has lived in `vendor/figma-kiwi/
    // lib/kiwi.mjs` since the original vendor pull — wiring it here
    // is the one-line fix.
    const payload = isZstdCompressed(u8) ? fzstdDecompress(u8) : u8;
    const page = decodePage(payload, decoder);
    if (page?.nodeChanges?.length) {
      pages.push(page);
    }
  } catch (err) {
    console.error(`  skip ${f}: ${err.message}`);
  }
}

console.error(`Decoded ${pages.length} pages`);

// 4. Merge + serialize
const scenegraph = mergePages(pages);
const json = serializeScenegraph(scenegraph);
const counts = countByType(scenegraph);

console.error(`Total nodes: ${scenegraph.nodeChanges.length}`);
console.error('By type:', counts);

if (writeToDisk) {
  const outPath = join(DIR, 'scenegraph.json');
  writeFileSync(outPath, json);
  console.error(`Wrote ${outPath}`);
} else {
  process.stdout.write(json);
  process.stdout.write('\n');
}
