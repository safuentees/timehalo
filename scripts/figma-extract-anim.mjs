#!/usr/bin/env node
// Extract Figma prototype animations into a code-friendly JSON.
//
// Reads a spec produced by `pnpm figma:spec` and:
//   1. Walks `prototypeInteractions` on every node (frames, components,
//      instances) — captures triggers (ON_CLICK / ON_HOVER / etc.) +
//      destination + transition type + duration + easing.
//   2. For SMART_ANIMATE transitions specifically: matches layers by
//      NAME between the source frame's subtree and the destination
//      frame's subtree (Figma's actual algorithm — Smart Animate
//      auto-tweens any layer whose name+type match across frames),
//      then computes property deltas (transform/size/opacity/fillPaints/
//      cornerRadius). Output is what an animation library needs to
//      reproduce the transition without re-inventing the matching.
//   3. Emits `docs/figma/anim-<feature>.json` next to the spec.
//
// Spring physics encoding: Figma's `easingFunction` array for SPRING
// types is 4 numbers. Order observed in captured Smart Animate
// transitions is `[mass, stiffness, damping, initialVelocity]` —
// values like `[1, 247, 23.58, 0]` and `[1, 330.6, 27.27, 0]` are
// underdamped GENTLE_SPRING values that map cleanly to the Motion /
// framer-motion API's `{ mass, stiffness, damping, velocity }` defaults.
// The output keeps both `spring` (named) and `easingFunction` (raw
// array) so consumers can swap interpretation if a future Figma
// release changes the order.
//
// Usage:
//   pnpm figma:anim <feature>
//
// Reads:  docs/figma/spec-<feature>.json
// Writes: docs/figma/anim-<feature>.json

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const feature = args.find((a) => !a.startsWith('-'));
if (!feature) {
  console.error('Usage: pnpm figma:anim <feature>');
  process.exit(1);
}

const specPath = join(REPO_ROOT, 'docs/figma', `spec-${feature}.json`);
const outPath = join(REPO_ROOT, 'docs/figma', `anim-${feature}.json`);

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const nodes = spec.nodeChanges || [];

const idOf = (g) => `${g?.sessionID || 0}:${g?.localID || 0}`;
const byId = new Map();
const childrenByParent = new Map();
for (const n of nodes) {
  const id = idOf(n.guid);
  byId.set(id, n);
  const p = n.parentIndex?.guid ? idOf(n.parentIndex.guid) : null;
  if (p) {
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p).push(n);
  }
}

// Walk a subtree starting at rootId, returning a flat list with
// path strings RELATIVE TO the root so we can match layers across
// frames whose root names differ ("handle" vs "handle-detail"). The
// root itself gets path "" (empty) so two roots match each other
// even when named differently — Smart Animate cares about within-
// frame structure, not the frame name. (Figma's actual algorithm
// matches by sibling-position + name within the same parent chain;
// relative-path matching is a faithful approximation.)
function walk(rootId) {
  const out = [];
  const recurse = (nid, relPath) => {
    const node = byId.get(nid);
    if (!node) return;
    out.push({
      id: nid,
      type: node.type,
      namePath: relPath,
      name: node.name || '?',
      node,
    });
    for (const c of childrenByParent.get(nid) || []) {
      const cName = c.name || '?';
      const cPath = relPath ? `${relPath}/${cName}` : cName;
      recurse(idOf(c.guid), cPath);
    }
  };
  recurse(rootId, '');
  return out;
}

// Compute pixel deltas + categorical changes between two matched
// nodes. Only emit a delta entry if at least one property differs
// — quiet the output for the 80%+ of layers that don't move.
function nodeDelta(from, to) {
  const changes = {};
  // Position (transform m02/m12 = translate x/y).
  const ft = from.transform || {};
  const tt = to.transform || {};
  if (ft.m02 !== tt.m02 || ft.m12 !== tt.m12) {
    changes.position = {
      from: { x: ft.m02 ?? 0, y: ft.m12 ?? 0 },
      to: { x: tt.m02 ?? 0, y: tt.m12 ?? 0 },
      delta: { x: (tt.m02 ?? 0) - (ft.m02 ?? 0), y: (tt.m12 ?? 0) - (ft.m12 ?? 0) },
    };
  }
  // Size.
  const fs = from.size || {};
  const ts = to.size || {};
  if (fs.x !== ts.x || fs.y !== ts.y) {
    changes.size = {
      from: { x: fs.x ?? 0, y: fs.y ?? 0 },
      to: { x: ts.x ?? 0, y: ts.y ?? 0 },
    };
  }
  // Opacity.
  if ((from.opacity ?? 1) !== (to.opacity ?? 1)) {
    changes.opacity = { from: from.opacity ?? 1, to: to.opacity ?? 1 };
  }
  // Corner radius.
  if ((from.cornerRadius ?? 0) !== (to.cornerRadius ?? 0)) {
    changes.cornerRadius = {
      from: from.cornerRadius ?? 0,
      to: to.cornerRadius ?? 0,
    };
  }
  // Fill paints — compare as JSON for simplicity. Most Smart Animate
  // color tweens are single SOLID changes; arrays of stops + image
  // fills are out of scope (they'd render as instant swaps in
  // Figma anyway unless the user sets specific easing per stop).
  const ffJson = JSON.stringify(from.fillPaints || []);
  const tfJson = JSON.stringify(to.fillPaints || []);
  if (ffJson !== tfJson) {
    changes.fillPaints = {
      from: from.fillPaints || [],
      to: to.fillPaints || [],
    };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

// Match layers by namePath across two frame subtrees. Within each
// path, prefer same-type matches (a FRAME named "Frame 2" doesn't
// match a TEXT named "Frame 2").
function matchLayers(fromTree, toTree) {
  const fromByPath = new Map();
  for (const f of fromTree) {
    const key = `${f.type}::${f.namePath}`;
    if (!fromByPath.has(key)) fromByPath.set(key, []);
    fromByPath.get(key).push(f);
  }
  const matches = [];
  const used = new Set();
  for (const t of toTree) {
    const key = `${t.type}::${t.namePath}`;
    const candidates = fromByPath.get(key) || [];
    for (const f of candidates) {
      if (used.has(f.id)) continue;
      used.add(f.id);
      matches.push({ from: f, to: t });
      break;
    }
  }
  return matches;
}

// Decode a SPRING easingFunction array. Per observed Figma payloads
// (B.PT155): order is [mass, stiffness, damping, initialVelocity].
// If a future Figma release changes the order, swap interpretation
// without modifying captures — output keeps the raw array too.
function decodeSpring(easingType, easingFunction) {
  if (!Array.isArray(easingFunction) || easingFunction.length !== 4) return null;
  if (
    easingType !== 'GENTLE_SPRING' &&
    easingType !== 'QUICK_SPRING' &&
    easingType !== 'BOUNCY_SPRING' &&
    easingType !== 'SLOW_SPRING' &&
    !easingType?.includes('SPRING')
  ) {
    return null;
  }
  const [mass, stiffness, damping, velocity] = easingFunction;
  return { mass, stiffness, damping, velocity };
}

// Resolve an interaction's transitionNodeID to a frame entry. If
// the destination isn't in our captured spec (e.g., a hover-state
// variant of a Component that lives outside the spec subtree), we
// still emit the destination ID + a `notInSpec: true` flag so the
// caller doesn't silently lose the interaction. Cross-spec layer-
// name matching is impossible without the dest tree, so deltas[]
// will be empty for those — the trigger record is still useful for
// state-swap callers (variant lookup) and instant transitions.
function resolveDestFrame(transitionNodeID) {
  if (!transitionNodeID) return null;
  const destId = idOf(transitionNodeID);
  const dest = byId.get(destId);
  if (!dest) {
    return { id: destId, name: null, type: null, node: null, notInSpec: true };
  }
  return { id: destId, name: dest.name, type: dest.type, node: dest };
}

// Collect prototype interactions across the spec.
const transitions = [];
const stateSwaps = [];

for (const n of nodes) {
  const interactions = n.prototypeInteractions || n.reactions || [];
  if (!Array.isArray(interactions) || interactions.length === 0) continue;
  for (const inter of interactions) {
    if (inter.isDeleted) continue;
    const event = inter.event || {};
    for (const action of inter.actions || []) {
      const dest = resolveDestFrame(action.transitionNodeID);
      if (!dest) continue;
      const base = {
        triggerNodeId: idOf(n.guid),
        triggerNodeName: n.name,
        triggerNodeType: n.type,
        event: event.interactionType || 'UNKNOWN',
        transitionType: action.transitionType,
        navigationType: action.navigationType,
        connectionType: action.connectionType,
        from: { id: idOf(n.guid), name: n.name },
        to: { id: dest.id, name: dest.name, type: dest.type },
      };
      if (action.transitionType === 'SMART_ANIMATE') {
        const duration = action.transitionDuration ?? 0;
        const easingType = action.easingType;
        const easingFunction = action.easingFunction;
        const spring = decodeSpring(easingType, easingFunction);
        // Walk source + destination subtrees and match by name.
        // The trigger node IS the source frame for top-level frame
        // transitions (handle → handle-detail), or its enclosing
        // frame for sub-element triggers. Use the trigger node
        // itself as the source root if it's a FRAME or SECTION;
        // otherwise walk up to the nearest enclosing frame.
        let sourceFrameId = idOf(n.guid);
        if (n.type !== 'FRAME' && n.type !== 'SECTION') {
          // climb to nearest FRAME ancestor
          let cur = n;
          while (cur) {
            if (cur.type === 'FRAME' || cur.type === 'SECTION') {
              sourceFrameId = idOf(cur.guid);
              break;
            }
            const pid = cur.parentIndex?.guid ? idOf(cur.parentIndex.guid) : null;
            cur = pid ? byId.get(pid) : null;
          }
        }
        const fromTree = walk(sourceFrameId);
        const toTree = walk(dest.id);
        const matches = matchLayers(fromTree, toTree);
        const deltas = [];
        for (const { from, to } of matches) {
          const d = nodeDelta(from.node, to.node);
          if (!d) continue;
          deltas.push({
            namePath: to.namePath,
            type: to.type,
            fromId: from.id,
            toId: to.id,
            changes: d,
          });
        }
        transitions.push({
          ...base,
          duration,
          easingType,
          easingFunction,
          spring,
          sourceFrameId,
          matchedLayers: matches.length,
          deltaCount: deltas.length,
          deltas,
        });
      } else if (
        action.transitionType === 'INSTANT_TRANSITION' ||
        action.navigationType === 'SWAP_STATE'
      ) {
        stateSwaps.push({
          ...base,
          duration: 0,
        });
      } else {
        // Unknown transition type — keep the raw record so the
        // implementer sees it without it silently disappearing.
        transitions.push({
          ...base,
          duration: action.transitionDuration ?? 0,
          easingType: action.easingType,
          easingFunction: action.easingFunction,
          unhandled: true,
        });
      }
    }
  }
}

const output = {
  meta: {
    feature,
    sourceSpec: `spec-${feature}.json`,
    extractedAt: new Date().toISOString(),
    transitionCount: transitions.length,
    stateSwapCount: stateSwaps.length,
  },
  transitions,
  stateSwaps,
};

writeFileSync(outPath, JSON.stringify(output, null, 2));
console.error(
  `Wrote ${outPath}: ${transitions.length} transitions, ${stateSwaps.length} state swaps`,
);
for (const t of transitions) {
  if (t.unhandled) {
    console.error(
      `  UNHANDLED ${t.event} on ${JSON.stringify(t.triggerNodeName)} -> ${t.to.name} (${t.transitionType})`,
    );
  } else if (t.transitionType === 'SMART_ANIMATE') {
    const dur = (t.duration ?? 0).toFixed(3);
    console.error(
      `  SMART_ANIMATE ${t.from.name} → ${t.to.name}: ${dur}s ${t.easingType} ${t.deltaCount}/${t.matchedLayers} layers changed`,
    );
  } else {
    const dur = (t.duration ?? 0).toFixed(3);
    console.error(
      `  ${t.transitionType} ${t.from.name} → ${t.to.name}: ${dur}s`,
    );
  }
}
for (const s of stateSwaps) {
  console.error(`  STATE_SWAP ${s.event} on ${s.triggerNodeName} (variant)`);
}
