// Paste in DevTools Console while on /h/<handle>?debug=1.
//
// Sets up a per-frame tracer for Frame 9 (the lime flex container)
// and its children (cyan text, pink duration). Records:
//   - getBoundingClientRect() (visible visual rect, includes
//     parent transforms — the actual screen position)
//   - getComputedStyle.transform (the actual rendered transform
//     after motion's projection)
//   - inline style.transform / opacity
//   - parent's getBoundingClientRect (so we can see if Frame 9 is
//     interpolating or snapping relative to the chip)
//
// Workflow:
//   1. Open /h/<handle>?debug=1 with mode=inspect, Spring tuning
//      duration ~1.5s (slow-mo), and layer-1 chips visible.
//   2. Click a chip to open the modal; let the morph settle.
//   3. Paste this script. It will find the FIRST chip's Frame 9
//      under the modal phantom subtree.
//   4. Call `__startFrame9Trace()`, then click the close X (or
//      whatever closes the modal). Tracer captures 5 s.
//   5. Inspect `window.__frame9Trace` (or
//      `console.table(window.__frame9Trace.frames)`).
//
// What to look for:
//   - If `frame9.bcr.width` jumps from ~303 to ~668 in the FIRST
//     frame, motion isn't applying its transform — the element's
//     CSS layout has been rendered at the destination size from
//     frame 0 and the rect is locked there.
//   - If `frame9.bcr.width` smoothly interpolates 668 → 303 over
//     the 5 s window, motion's FLIP is doing its job.
//   - Compare `frame9.transform` (the inline transform motion
//     sets, like `translate3d(0,0,0) scale(0.45,0.18)`) vs
//     `frame9.computedTransform` (the resolved transform after
//     compositing with parent).
//   - `text.bcr.left` and `duration.bcr.right` tell you whether
//     the inner spans are riding the chip or sliding independently.

(() => {
  const PHANTOM_ROOT_SELECTOR =
    "body div.oh-root .fixed.inset-0.z-50 article > div.pointer-events-none.absolute.inset-0.z-20";
  const root = document.querySelector(PHANTOM_ROOT_SELECTOR);
  if (!root) {
    console.warn(
      "[frame9-trace] phantom container not found. Make sure modal is open."
    );
    return;
  }

  // The phantom slot-list contains slot-stack which contains 4 slot
  // wrappers. Each slot wrapper > SlotRow's motion element > Frame 9
  // (lime bg).
  const slotList = root.querySelector("div.bg-\\[\\#F5EFDF\\]");
  const slotStack = slotList?.firstElementChild;
  const firstSlotWrap = slotStack?.firstElementChild;
  const slotRow = firstSlotWrap?.firstElementChild;
  const frame9 = slotRow?.querySelector("span.flex.items-center.justify-between");
  if (!frame9) {
    console.warn(
      "[frame9-trace] Frame 9 not found. Selectors may have shifted."
    );
    console.log({ root, slotList, slotStack, firstSlotWrap, slotRow });
    return;
  }

  const text = frame9.querySelector("span.flex-col") ?? frame9.children[0];
  const duration = frame9.children[frame9.children.length - 1];

  console.log("[frame9-trace] tracking:", { slotRow, frame9, text, duration });

  function snapshot(el) {
    if (!el) return null;
    const bcr = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      bcr: {
        x: Math.round(bcr.x),
        y: Math.round(bcr.y),
        w: Math.round(bcr.width),
        h: Math.round(bcr.height),
        right: Math.round(bcr.right),
      },
      transform: el.style.transform || "·",
      computedTransform: cs.transform.startsWith("matrix")
        ? cs.transform.slice(0, 60)
        : cs.transform,
      opacity: cs.opacity,
      visibility: cs.visibility,
    };
  }

  const frames = [];
  let start = null;

  function tick(ts) {
    if (start === null) start = ts;
    const t = Math.round(ts - start);

    const slotRowSnap = snapshot(slotRow);
    const frame9Snap = snapshot(frame9);
    const textSnap = snapshot(text);
    const durationSnap = snapshot(duration);

    frames.push({
      t,
      slotRow_w: slotRowSnap?.bcr.w,
      slotRow_x: slotRowSnap?.bcr.x,
      frame9_w: frame9Snap?.bcr.w,
      frame9_x: frame9Snap?.bcr.x,
      frame9_right: frame9Snap?.bcr.right,
      frame9_xform: frame9Snap?.transform,
      text_x: textSnap?.bcr.x,
      text_w: textSnap?.bcr.w,
      duration_right: durationSnap?.bcr.right,
      duration_w: durationSnap?.bcr.w,
      duration_xform: durationSnap?.transform,
    });

    if (ts - start < 5000) requestAnimationFrame(tick);
    else {
      window.__frame9Trace = {
        frames,
        sample(every = 5) {
          return frames.filter((_, i) => i % every === 0);
        },
        first(n = 10) {
          return frames.slice(0, n);
        },
        deltas() {
          if (frames.length < 2) return [];
          const out = [];
          for (let i = 1; i < frames.length; i++) {
            const a = frames[i - 1];
            const b = frames[i];
            out.push({
              t: b.t,
              dt: b.t - a.t,
              dFrame9_w: b.frame9_w - a.frame9_w,
              dFrame9_x: b.frame9_x - a.frame9_x,
              dDuration_right: b.duration_right - a.duration_right,
            });
          }
          return out;
        },
      };
      console.log(
        `[frame9-trace] done. ${frames.length} frames captured.`,
        "\nQuick views:",
        "\n  console.table(window.__frame9Trace.first(20))   ← first 20 frames",
        "\n  console.table(window.__frame9Trace.sample(3))   ← every 3rd frame",
        "\n  console.table(window.__frame9Trace.deltas())    ← per-frame deltas"
      );
    }
  }

  window.__startFrame9Trace = () => {
    start = null;
    frames.length = 0;
    requestAnimationFrame(tick);
    console.log("[frame9-trace] recording 5 s — trigger close NOW.");
  };

  console.log(
    "[frame9-trace] ready. Call `__startFrame9Trace()` then click close."
  );
})();
