"use client";

import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Dev checklist content (B.PT75). Renders the project's
// `docs/features-and-tests.md` as interactive checkboxes whose state
// persists in localStorage. Per-checkbox key is a stable hash of the
// surrounding line text so a markdown edit that adds or removes
// unrelated rows doesn't shuffle the saved checks.
//
// Why react-markdown + remark-gfm:
//   - remark-gfm adds GitHub Flavored Markdown task lists (the
//     `- [x] thing` syntax) to the parser; without it task items
//     parse as plain "- [x] text" with no checkbox.
//   - react-markdown's `components` prop lets us swap the rendered
//     `<input type="checkbox">` for a controlled element bound to
//     localStorage. The default is disabled+readonly per GFM spec.
//
// State shape: `Record<key, boolean>` in localStorage under a single
// key. Hashed line content is the row key. New unchecked items
// automatically join the map on first toggle.

const STORAGE_KEY = "oh-dev-checklist-v1";

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

function readStorage(): CheckedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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

function writeStorage(map: CheckedMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / privacy mode — fail silently. The UI keeps the in-memory
    // state for the current session.
  }
}

export function DevChecklistContent({ markdown }: { markdown: string }) {
  // Lazy initializer reads localStorage on first render. Safe across
  // SSR boundary because this component is lazy-loaded by
  // <DevChecklistLauncher /> only after the modal opens (purely client-
  // side render path), so there's no SSR/CSR mismatch to manage. Avoids
  // the React 19 `react-hooks/set-state-in-effect` rule that the prior
  // `useEffect(() => setChecked(...))` shape would have tripped.
  // `readStorage` guards `typeof window === "undefined"` and returns
  // empty {} on the server side as a defensive fallback.
  const [checked, setChecked] = useState<CheckedMap>(() => readStorage());

  const toggle = useCallback((key: string) => {
    setChecked((prev) => {
      const next: CheckedMap = { ...prev, [key]: !prev[key] };
      writeStorage(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setChecked({});
    writeStorage({});
  }, []);

  const completed = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  // Custom renderer for the GFM `<input type="checkbox">` that
  // remark-gfm emits for `- [ ]` / `- [x]` lines. We hash the parent
  // <li>'s text content as the storage key. react-markdown passes the
  // checkbox's parent node info via the `node` prop on every component
  // override; we walk that to extract the line text.
  const components = useMemo<Components>(
    () => ({
      input(props) {
        if (props.type !== "checkbox") {
          return <input {...props} />;
        }
        // `node.position` gives us byte offsets back into the source
        // markdown — far more stable than walking sibling text nodes
        // (which can change shape if a line gets bolded). Slice the
        // raw markdown by position, hash it.
        const start = props.node?.position?.start?.offset ?? 0;
        const end = props.node?.position?.end?.offset ?? start;
        // For the checkbox itself the position covers `[ ]` / `[x]`
        // only — too short to be unique. Walk up to the parent line:
        // the parent <li>'s position covers the full row. We don't
        // have direct parent access here so we widen the slice to the
        // start of the surrounding line and the next newline.
        const lineStart = markdown.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = markdown.indexOf("\n", end);
        const lineText = markdown.slice(
          lineStart,
          lineEnd === -1 ? markdown.length : lineEnd,
        );
        const key = djb2(lineText);
        const isChecked = !!checked[key];
        return (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => toggle(key)}
            // Override remark-gfm's default `disabled` so the box is
            // actually interactive. aria-label points at the row text
            // for screen readers.
            disabled={false}
            aria-label={lineText.replace(/^\s*-\s*\[[ xX]\]\s*/, "")}
            className="oh-dev-checklist-box"
          />
        );
      },
    }),
    [markdown, checked, toggle],
  );

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

      <article className="oh-dev-checklist-prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
