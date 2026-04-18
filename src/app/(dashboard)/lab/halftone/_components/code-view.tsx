"use client";

import { useMemo, useState } from "react";
import { PANEL_FRAG } from "../_lib/shaders";
import { PANEL_ANNOTATIONS } from "../_lib/annotations";
import { PANEL_META, type PanelKey } from "../_lib/constants";
import { useHalftoneLab } from "../_lib/use-halftone-state";

const GLSL_KW =
  /\b(attribute|varying|uniform|void|if|else|for|break|return|const)\b/g;
const GLSL_TY = /\b(vec2|vec3|vec4|mat2|mat3|mat4|float|int|bool|sampler2D)\b/g;
const GLSL_FN =
  /\b(sin|cos|tan|atan|exp|log|pow|sqrt|abs|floor|fract|mod|mix|step|smoothstep|clamp|length|dot|cross|normalize|max|min|fwidth|snoise|fbm)\b/g;
const GLSL_NUM = /\b(\d+\.\d*|\.\d+|\d+)\b/g;
const GLSL_COM = /(\/\/[^\n]*)/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(line: string): string {
  let esc = escapeHtml(line);
  // sentinel comments first (contain slashes and other syntax)
  esc = esc.replace(GLSL_COM, (m) => `\u0001C\u0002${m}\u0001D\u0002`);
  // NUM runs before class-bearing replacements so digit-free class attrs
  // inserted later aren't re-matched. Keep all class names digit-free.
  esc = esc.replace(GLSL_NUM, '<span class="text-muted-foreground">$1</span>');
  esc = esc.replace(GLSL_KW, '<span class="text-[var(--halftone-accent)]">$1</span>');
  esc = esc.replace(GLSL_TY, '<span class="text-foreground font-medium">$1</span>');
  esc = esc.replace(GLSL_FN, '<span class="text-foreground">$1</span>');
  esc = esc.replace(
    /\u0001C\u0002([\s\S]*?)\u0001D\u0002/g,
    '<span class="text-muted-foreground italic">$1</span>',
  );
  return esc;
}

export function CodeView() {
  const { state } = useHalftoneLab();
  const active = state.activeCode;
  const shader = PANEL_FRAG[active];
  const annotations = PANEL_ANNOTATIONS[active];

  // Adjusting state during render — reset openLine when active panel changes.
  // See https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-when-a-prop-changes
  const [selection, setSelection] = useState<{
    active: PanelKey;
    line: number | null;
  }>({ active, line: null });
  if (selection.active !== active) {
    setSelection({ active, line: null });
  }
  const openLine = selection.line;
  const setOpenLine = (fn: (cur: number | null) => number | null) =>
    setSelection((s) => ({ active: s.active, line: fn(s.line) }));

  const lines = useMemo(() => shader.split("\n"), [shader]);
  const notes = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of annotations) m.set(a.line, a.note);
    return m;
  }, [annotations]);

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-baseline gap-2">
          <span className="font-bold text-[var(--halftone-accent)]">
            panel {active}
          </span>
          <span className="text-foreground/80 normal-case tracking-normal text-xs font-medium">
            {PANEL_META[active].title}
          </span>
        </div>
        <span className="hidden sm:inline">
          click any line with a bar for commentary
        </span>
      </header>
      <ol className="flex-1 overflow-y-auto px-4 pt-3 pb-4 font-mono text-[12px] leading-[1.55] tabular-nums">
        {lines.map((line, i) => {
          const ln = i + 1;
          const note = notes.get(ln);
          const isOpen = openLine === ln;
          return (
            <li key={ln} className="flex flex-col">
              <button
                type="button"
                data-has-note={note ? "true" : "false"}
                data-active={isOpen ? "true" : "false"}
                onClick={
                  note
                    ? () => setOpenLine((cur) => (cur === ln ? null : ln))
                    : undefined
                }
                disabled={!note}
                className="group/line relative flex w-full items-start gap-3 border-l-2 border-transparent pl-2 text-left transition-colors data-[has-note=true]:cursor-pointer data-[has-note=true]:border-[var(--halftone-accent)] data-[has-note=true]:hover:bg-[var(--halftone-accent-soft)] data-[active=true]:bg-[var(--halftone-accent-soft)]"
              >
                <span className="w-6 shrink-0 select-none text-right text-muted-foreground/50">
                  {ln}
                </span>
                <code
                  className="min-w-0 flex-1 whitespace-pre"
                  dangerouslySetInnerHTML={{
                    __html: highlight(line) || "&nbsp;",
                  }}
                />
              </button>
              {note && isOpen ? (
                <div className="ml-9 mb-2 mt-1 border-l-2 border-[var(--halftone-accent)] bg-[var(--halftone-accent-soft)] px-3 py-2 font-sans text-[12px] leading-relaxed text-foreground/90">
                  {note}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
