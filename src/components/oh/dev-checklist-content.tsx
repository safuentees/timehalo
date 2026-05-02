"use client";

import { useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const STORAGE_KEY = "oh-dev-checklist-v1";

function djb2(input: string): string {
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
  }
}

export function DevChecklistContent({ markdown }: { markdown: string }) {
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

  const components = useMemo<Components>(
    () => ({
      input(props) {
        if (props.type !== "checkbox") {
          return <input {...props} />;
        }
        const start = props.node?.position?.start?.offset ?? 0;
        const end = props.node?.position?.end?.offset ?? start;
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
