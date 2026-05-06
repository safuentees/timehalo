// Paste in DevTools Console while on /h/<handle>?debug=1.
//
// Tracks BOTH the landing-side and phantom-side chip subtrees in
// parallel so we can see which one is interpolating and which one
// is snapping. Records per-frame:
//   - getBoundingClientRect (visual, includes ancestor transforms)
//   - inline style.transform (motion's FLIP transform)
//   - computed style.visibility (catches layoutCrossfade hide())
//   - computed style.opacity
//
// Workflow:
//   1. Open /h/<handle>?debug=1 with mode=inspect, Spring tuning
//      duration ~1.5s for slow-mo.
//   2. PASTE THIS WHILE MODAL IS CLOSED (so we capture the OPEN
//      animation correctly). Modal can also be open if you want
//      to capture close.
//   3. Call `__startBothTrace()` immediately, then click a chip
//      (open) or click close X.
//   4. After 5s, inspect:
//        console.table(window.__bothTrace.first(20))
//        console.table(window.__bothTrace.sample(3))
//
// What to look for:
//   - landing.frame9_w should interpolate from landing-rect (~303)
//     to modal-rect (~668) on OPEN, and reverse on CLOSE.
//   - phantom.frame9_w should mirror that (or be inverse).
//   - If ONE side stays at a fixed value while the other
//     interpolates, that side is the snap source.
//   - landing.visibility / phantom.visibility tell us which side
//     is hidden via layoutCrossfade={false}.

(() => {
  const ROOT_VISITOR = "body div.oh-root";
  const visitor = document.querySelector(ROOT_VISITOR);
  if (!visitor) {
    console.warn("[both-trace] visitor root not found");
    return;
  }

  // Landing-side chip is inside the landing card (motion.article
  // with layoutId="handle-card", outside the modal wrapper).
  // It's typically inside the OhVisitorShell main column.
  const landingArticle = visitor.querySelector(
    "main > div:nth-child(2) article, main article"
  );
  // Or the slot row inside landing's slot list:
  const landingSlotList = landingArticle?.querySelector(
    "div.bg-\\[\\#F5EFDF\\]"
  );
  const landingSlotStack = landingSlotList?.querySelector("ul, [data-oh-slot-stack], div");
  const landingFirstSlot =
    landingSlotStack?.querySelector("li, button, div");
  const landingChipEl =
    landingFirstSlot?.tagName === "LI"
      ? landingFirstSlot.firstElementChild
      : landingFirstSlot;
  const landingFrame9 = landingChipEl?.querySelector(
    "span.flex.items-center.justify-between"
  );

  // Phantom-side chip subtree (inside the modal's phantom container).
  const phantomRoot = visitor.querySelector(
    ".fixed.inset-0.z-50 article > div.pointer-events-none.absolute.inset-0.z-20"
  );
  const phantomSlotList = phantomRoot?.querySelector(
    "div.bg-\\[\\#F5EFDF\\]"
  );
  const phantomSlotStack = phantomSlotList?.firstElementChild;
  const phantomFirstWrap = phantomSlotStack?.firstElementChild;
  const phantomChipEl = phantomFirstWrap?.firstElementChild;
  const phantomFrame9 = phantomChipEl?.querySelector(
    "span.flex.items-center.justify-between"
  );

  const probes = {
    landingChip: landingChipEl,
    landingFrame9,
    phantomChip: phantomChipEl,
    phantomFrame9,
  };

  const missing = Object.entries(probes)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.warn(
      "[both-trace] could not find:",
      missing,
      "— available probes:",
      probes
    );
  } else {
    console.log("[both-trace] tracking probes:", probes);
  }

  function snap(el) {
    if (!el) return null;
    const bcr = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(bcr.x),
      w: Math.round(bcr.width),
      h: Math.round(bcr.height),
      right: Math.round(bcr.right),
      xform: el.style.transform || "·",
      vis: cs.visibility,
      op: cs.opacity,
    };
  }

  const frames = [];
  let start = null;

  function tick(ts) {
    if (start === null) start = ts;
    const t = Math.round(ts - start);
    const lc = snap(landingChipEl);
    const lf9 = snap(landingFrame9);
    const pc = snap(phantomChipEl);
    const pf9 = snap(phantomFrame9);
    frames.push({
      t,
      // Landing side
      lc_w: lc?.w,
      lc_x: lc?.x,
      lc_vis: lc?.vis,
      lf9_w: lf9?.w,
      lf9_xform: lf9?.xform,
      // Phantom side
      pc_w: pc?.w,
      pc_x: pc?.x,
      pc_vis: pc?.vis,
      pf9_w: pf9?.w,
      pf9_xform: pf9?.xform,
    });
    if (ts - start < 5000) requestAnimationFrame(tick);
    else {
      window.__bothTrace = {
        frames,
        first: (n = 30) => frames.slice(0, n),
        last: (n = 30) => frames.slice(-n),
        sample: (every = 5) => frames.filter((_, i) => i % every === 0),
        // Find the frame where landing chip width starts changing
        landingStartsAt() {
          const init = frames[0]?.lc_w;
          for (let i = 1; i < frames.length; i++) {
            if (frames[i].lc_w !== init) return frames[i].t;
          }
          return null;
        },
        phantomStartsAt() {
          const init = frames[0]?.pc_w;
          for (let i = 1; i < frames.length; i++) {
            if (frames[i].pc_w !== init) return frames[i].t;
          }
          return null;
        },
      };
      console.log(
        `[both-trace] done. ${frames.length} frames captured. ` +
          `Landing changed at: ${window.__bothTrace.landingStartsAt()}ms, ` +
          `Phantom changed at: ${window.__bothTrace.phantomStartsAt()}ms.`,
        "\nQuick views:",
        "\n  console.table(window.__bothTrace.first(30))",
        "\n  console.table(window.__bothTrace.sample(5))",
        "\n  console.table(window.__bothTrace.last(30))"
      );
    }
  }

  window.__startBothTrace = () => {
    start = null;
    frames.length = 0;
    requestAnimationFrame(tick);
    console.log(
      "[both-trace] recording 5 s — trigger your animation NOW (open OR close)."
    );
  };

  console.log(
    "[both-trace] ready. Call `__startBothTrace()` then click chip (open) or close X."
  );
})();
