"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Strip the original disabled-checkbox that remark-gfm injects as the
// first child of a task-list-item. Our `li` override renders its own
// interactive checkbox before the children; without this filter the
// disabled one would still render alongside, leaving two boxes per row.
function filterOutOriginalCheckbox(children: ReactNode): ReactNode {
  return Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true;
    const props = child.props as { type?: string };
    return !(child.type === "input" && props.type === "checkbox");
  });
}

// Dev checklist content (B.PT75). Renders a markdown doc as interactive
// checkboxes whose state persists in localStorage. Per-checkbox key is
// a stable hash of the surrounding line text so a markdown edit that
// adds or removes unrelated rows doesn't shuffle the saved checks.
//
// Why react-markdown + remark-gfm:
//   - remark-gfm adds GitHub Flavored Markdown task lists (the
//     `- [x] thing` syntax) to the parser; without it task items
//     parse as plain "- [x] text" with no checkbox.
//   - react-markdown's `components` prop lets us swap the rendered
//     `<input type="checkbox">` for a controlled element bound to
//     localStorage. The default is disabled+readonly per GFM spec.
//
// State shape: `Record<key, boolean>` in localStorage under a per-tab
// key. Hashed line content is the row key. New unchecked items
// automatically join the map on first toggle. Per-tab keys (instead
// of one shared map) so the "Reset all" affordance only wipes the
// active tab — without isolation, resetting "recent changes" would
// also wipe accumulated progress on the long-form features-and-tests
// checklist (and vice versa).

// Per-tab key suffix → full storage keys. The default (no suffix)
// matches the original B.PT75 schema so existing user state survives
// the introduction of tabs.
function storageKeysFor(scope: string | undefined) {
  const suffix = scope ? `-${scope}` : "";
  return {
    state: `oh-dev-checklist${suffix}-v1`,
    scroll: `oh-dev-checklist${suffix}-scroll-v1`,
  };
}

function djb2(input: string): string {
  // Tiny non-cryptographic hash (djb2). Stable across page reloads
  // and across Node + browser. Output base36 to keep the storage key
  // compact (`features-and-tests.md` has ~150 task items; the JSON
  // blob stays well under localStorage's 5MB ceiling).
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

type CheckedMap = Record<string, boolean>;

function readStorage(stateKey: string): CheckedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(stateKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as CheckedMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeStorage(stateKey: string, map: CheckedMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(stateKey, JSON.stringify(map));
  } catch {
    // Quota / privacy mode — fail silently. The UI keeps the in-memory
    // state for the current session.
  }
}

export function DevChecklistContent({
  markdown,
  storageScope,
}: {
  markdown: string;
  // Optional namespace suffix for the per-tab storage keys. Omit (or
  // pass undefined) to use the original B.PT75 keys so the long-form
  // features-and-tests checklist preserves any existing saved state.
  storageScope?: string;
}) {
  const { state: stateKey, scroll: scrollKey } = useMemo(
    () => storageKeysFor(storageScope),
    [storageScope],
  );

  // Lazy initializer reads localStorage on first render. Safe across
  // SSR boundary because this component is lazy-loaded by
  // <DevChecklistLauncher /> only after the modal opens (purely client-
  // side render path), so there's no SSR/CSR mismatch to manage. Avoids
  // the React 19 `react-hooks/set-state-in-effect` rule that the prior
  // `useEffect(() => setChecked(...))` shape would have tripped.
  // `readStorage` guards `typeof window === "undefined"` and returns
  // empty {} on the server side as a defensive fallback.
  const [checked, setChecked] = useState<CheckedMap>(() =>
    readStorage(stateKey),
  );

  const toggle = useCallback(
    (key: string) => {
      setChecked((prev) => {
        const next: CheckedMap = { ...prev, [key]: !prev[key] };
        writeStorage(stateKey, next);
        return next;
      });
    },
    [stateKey],
  );

  const reset = useCallback(() => {
    setChecked({});
    writeStorage(stateKey, {});
  }, [stateKey]);

  const completed = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  // Per-checkbox storage key derivation. react-markdown v10 doesn't
  // populate `node.position` on the inline `input` override
  // (verified empirically — the prior position-based scheme made
  // every checkbox derive the SAME line text → SAME djb2 hash →
  // toggling one checkbox toggled all of them). The block-level
  // `li` override DOES receive `node.position` reliably because
  // listItem is a block node in unified's mdast/hast spec.
  //
  // Fix: override `li` instead of `input`. If the li is a task list
  // item (remark-gfm sets `properties.className: ["task-list-item"]`
  // on the rendered hast node + adds `<input type="checkbox">` as
  // the first child), slice the source markdown by the li's
  // position offset to get the line text, hash it for the storage
  // key, and render our own interactive checkbox + the rest of the
  // li's text content. Non-task li's pass through unchanged.
  //
  // If a line's text changes (user edits the source markdown), its
  // hash changes → its prior checked state is lost. That's the
  // right behavior — the row is no longer the same row. Inserting a
  // NEW task above existing ones doesn't shuffle the others' keys
  // because we hash by content, not by source-index.
  const components = useMemo<Components>(
    () => ({
      li(props) {
        const { node, children, className, ...rest } = props;
        const classNames = Array.isArray(node?.properties?.className)
          ? (node.properties.className as Array<string | number>)
          : [];
        const isTaskItem = classNames.includes("task-list-item");

        if (!isTaskItem) {
          return (
            <li className={className} {...rest}>
              {children}
            </li>
          );
        }

        // Block-level li node has reliable position info. Slice the
        // source markdown by the li's offset to get the row text;
        // hash that for the storage key.
        const start = node?.position?.start?.offset ?? 0;
        const end = node?.position?.end?.offset ?? start;
        const lineText = markdown.slice(start, end).trim();
        const key = djb2(lineText);
        const isChecked = !!checked[key];
        const ariaLabel = lineText
          .replace(/^\s*-\s*\[[ xX]\]\s*/, "")
          .split("\n")[0]
          .trim();

        return (
          <li className={className} {...rest}>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggle(key)}
              aria-label={ariaLabel}
              className="oh-dev-checklist-box"
            />
            {/* react-markdown's default rendering of a task-list-item
                emits the disabled checkbox as children[0]. We're
                already rendering our own interactive checkbox above,
                so filter out the original. The remaining children are
                the row's text + any trailing nodes. */}
            {filterOutOriginalCheckbox(children)}
          </li>
        );
      },
    }),
    [markdown, checked, toggle],
  );

  // Scroll preservation (B.PT76). The modal mounts this component
  // fresh every time the user opens the FAB → without restore, every
  // open lands at the top regardless of where they last paused. Save
  // the scrollTop to localStorage on scroll (throttled to once per
  // animation frame so a fast-flick doesn't write 60×/sec) and
  // restore it on first paint after the layout settles.
  //
  // Scoped per-tab via `scrollKey` so the "recent changes" tab keeps
  // its own scroll position separate from the long-form features-and-
  // tests checklist. Without isolation, scrolling one tab would
  // re-position the other on next open.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Restore once on mount. requestAnimationFrame defers the
  // scrollTop write until the markdown has been painted — without
  // that delay the assignment lands before the children have heights
  // and the browser clamps it to 0.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(scrollKey);
    if (!stored) return;
    const target = Number(stored);
    if (!Number.isFinite(target) || target <= 0) return;
    requestAnimationFrame(() => {
      node.scrollTop = target;
    });
  }, [scrollKey]);

  // rAF-throttled save. The pending flag suppresses redundant writes
  // when the user fires a wheel-burst — at most one localStorage
  // write per paint frame.
  const pendingFrameRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (pendingFrameRef.current !== null) return;
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      const node = scrollRef.current;
      if (!node || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(scrollKey, String(node.scrollTop));
      } catch {
        // Quota / privacy mode — fail silently.
      }
    });
  }, [scrollKey]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="oh-eyebrow opacity-65 tabular-nums">{completed} done</p>
        <button
          type="button"
          onClick={reset}
          className="oh-eyebrow opacity-55 transition-opacity hover:opacity-100"
        >
          Reset all
        </button>
      </header>

      {/* Scroll container — owns max-h + overflow-y so the saved
          scrollTop lives on this exact element. `overscroll-contain`
          stops a fast inner-flick from chaining out to the page
          underneath the modal. */}
      <article
        ref={scrollRef}
        onScroll={handleScroll}
        className="oh-dev-checklist-prose max-h-[75vh] overflow-y-auto overscroll-contain pr-1 sm:max-h-[70vh]"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
