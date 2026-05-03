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

function filterOutOriginalCheckbox(children: ReactNode): ReactNode {
  return Children.toArray(children).filter((child) => {
    if (!isValidElement(child)) return true;
    const props = child.props as { type?: string };
    return !(child.type === "input" && props.type === "checkbox");
  });
}

function storageKeysFor(scope: string | undefined) {
  const suffix = scope ? `-${scope}` : "";
  return {
    state: `oh-dev-checklist${suffix}-v1`,
    scroll: `oh-dev-checklist${suffix}-scroll-v1`,
  };
}

function djb2(input: string): string {
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
  }
}

export function DevChecklistContent({
  markdown,
  storageScope,
}: {
  markdown: string;
  storageScope?: string;
}) {
  const { state: stateKey, scroll: scrollKey } = useMemo(
    () => storageKeysFor(storageScope),
    [storageScope],
  );

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
            {filterOutOriginalCheckbox(children)}
          </li>
        );
      },
    }),
    [markdown, checked, toggle],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
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
