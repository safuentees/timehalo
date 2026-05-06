// Paste in DevTools Console while on /h/<handle>?debug=1
// then: 1) set duration override to ~1.5s in the Spring tuning folder,
// 2) call `__startTrace()` then trigger the close animation.
//
// Records computed opacity/visibility/inline opacity/transform of every
// chip in the shared-layout subtree, plus the inner Frame 9, text, and
// duration spans, every animation frame for 5 seconds.
//
// After: pretty table in `console.table(window.__chipTrace.flat())` and
// a human-readable progress curve in `window.__chipTrace`.

(() => {
  const CHIP_SELECTOR =
    "body div.oh-root .fixed.inset-0.z-50 article > div.pointer-events-none.absolute.inset-0.z-20";
  const root = document.querySelector(CHIP_SELECTOR);
  if (!root) {
    console.warn(
      "[trace] phantom container not found. Make sure the modal is open."
    );
    return;
  }

  // Find every motion-tracked node beneath the phantom container.
  const elements = [
    ...Array.from(root.querySelectorAll("[data-projection-id]")),
    // belt-and-suspenders: also catch motion elements without the data-attr
    ...Array.from(root.querySelectorAll("button, div, span, header")),
  ];
  const tracked = elements.slice(0, 40);

  console.log("[trace] tracking", tracked.length, "elements under", CHIP_SELECTOR);

  const samples = [];
  let start = null;

  function tick(ts) {
    if (start === null) start = ts;
    const t = Math.round(ts - start);

    const row = { t };
    tracked.forEach((el, i) => {
      const cs = getComputedStyle(el);
      const tag = el.tagName.toLowerCase();
      const cls = el.className.toString().split(/\s+/)[0] || "(no-class)";
      const key = `${i}:${tag}.${cls}`;
      row[key] = `op=${cs.opacity} vis=${cs.visibility} inOp=${
        el.style.opacity || "·"
      }`;
    });
    samples.push(row);

    if (ts - start < 5000) requestAnimationFrame(tick);
    else {
      window.__chipTrace = samples;
      console.log(
        "[trace] done. window.__chipTrace has",
        samples.length,
        "frames. Inspect with `console.table(window.__chipTrace)`."
      );
    }
  }

  window.__startTrace = () => {
    start = null;
    samples.length = 0;
    requestAnimationFrame(tick);
    console.log("[trace] recording 5 s — trigger your animation NOW.");
  };

  console.log("[trace] ready. Call `__startTrace()` then trigger close.");
})();
