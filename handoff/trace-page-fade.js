// Paste in DevTools Console while on /h/<handle>?debug=1.
// Inspect mode, modal CLOSED.
//
// Traces the whole document tree for opacity changes during the
// open animation. Captures body, .oh-root, main, modal wrapper,
// modal article, phantom container, slot-list phantom, calendar
// wrapper — everything that could plausibly cause a "page fades
// in" symptom. Records per RAF frame for 1.5s after a chip click.
//
// Workflow:
//   1. Make sure modal is CLOSED.
//   2. Paste this script.
//   3. Call __armPageFadeTrace() once.
//   4. Click a chip. Trace records 1.5s of post-click frames.
//   5. Inspect:
//        console.table(window.__pageFadeTrace.first(20))
//        window.__pageFadeTrace.findOpacityDip(0.95)  // any field < 0.95?

(() => {
  // Find the elements likely to be the culprit. Re-query each frame
  // since some only mount once the modal opens.
  function findElements() {
    const body = document.body;
    const root = document.querySelector(".oh-root");
    const main = root?.querySelector("main");
    const modalWrapper = document.querySelector(
      ".fixed.inset-0.z-50",
    );
    const modalArticle = modalWrapper?.querySelector("article");
    const phantomContainer = modalArticle?.querySelector(
      "div.pointer-events-none.absolute.inset-0",
    );
    const slotListPhantom = phantomContainer?.querySelector(
      "div.bg-\\[\\#F5EFDF\\]",
    );
    const calendarWrapper = modalArticle?.querySelector(
      "div.relative.z-10",
    );
    return {
      body,
      root,
      main,
      modalWrapper,
      modalArticle,
      phantomContainer,
      slotListPhantom,
      calendarWrapper,
    };
  }

  function snap(el, label) {
    if (!el) return [`${label}_op`, undefined];
    const cs = getComputedStyle(el);
    return [
      `${label}_op`,
      cs.opacity,
      `${label}_vis`,
      cs.visibility,
      `${label}_xform`,
      el.style.transform || (cs.transform.startsWith("matrix") ? cs.transform.slice(0, 50) : cs.transform),
    ];
  }

  const frames = [];
  let start = null;

  function tick(ts) {
    if (start === null) start = ts;
    const t = Math.round(ts - start);
    const els = findElements();
    const row = { t };
    for (const [label, el] of Object.entries(els)) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      row[`${label}_op`] = cs.opacity;
      row[`${label}_vis`] = cs.visibility;
    }
    frames.push(row);
    if (ts - start < 1500) requestAnimationFrame(tick);
    else {
      window.__pageFadeTrace = {
        frames,
        first: (n = 30) => frames.slice(0, n),
        findOpacityDip(threshold = 0.95) {
          // Returns frames where ANY field's opacity is below threshold
          return frames.filter((row) =>
            Object.entries(row).some(
              ([k, v]) =>
                k.endsWith("_op") &&
                v !== undefined &&
                parseFloat(v) < threshold,
            ),
          );
        },
        // Show only the labels (drops _vis/_xform for compactness)
        opacityOnly: () =>
          frames.map((row) => {
            const out = { t: row.t };
            for (const [k, v] of Object.entries(row)) {
              if (k.endsWith("_op")) out[k.replace("_op", "")] = v;
            }
            return out;
          }),
      };
      console.log(
        `[page-fade] done. ${frames.length} frames captured.`,
        `\n  console.table(window.__pageFadeTrace.opacityOnly().slice(0, 30))  ← compact view`,
        `\n  window.__pageFadeTrace.findOpacityDip(0.95)  ← any opacity < 0.95?`,
      );
    }
  }

  // Arm: starts trace on next chip click.
  window.__armPageFadeTrace = (selector = "main button.oh-focus-ring") => {
    const el = document.querySelector(selector);
    if (!el) {
      console.warn("[page-fade] element not found:", selector);
      return;
    }
    el.addEventListener(
      "click",
      () => {
        console.log("[page-fade] click — recording 1.5s of opacity data.");
        start = null;
        frames.length = 0;
        requestAnimationFrame(tick);
      },
      { once: true },
    );
    console.log(
      `[page-fade] armed on ${selector}. Click it to start the trace.`,
    );
  };

  console.log(
    "[page-fade] ready. __armPageFadeTrace() to arm on the first landing chip.",
  );
})();
