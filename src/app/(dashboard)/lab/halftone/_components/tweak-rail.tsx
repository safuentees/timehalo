"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  PANEL_KEYS,
  PANEL_META,
  PRESETS,
  SLIDERS,
  formatVal,
} from "../_lib/constants";
import { useHalftoneLab } from "../_lib/use-halftone-state";

export function TweakRail() {
  const { state, dispatch } = useHalftoneLab();

  return (
    <aside
      aria-label="shared parameters"
      className="flex h-auto w-full shrink-0 flex-col overflow-y-auto border-b border-border bg-card/40 @md:sticky @md:top-0 @md:h-[calc(100vh-1px)] @md:w-72 @md:border-b-0 @md:border-r"
    >
      <div className="flex items-baseline justify-between px-5 py-4">
        <div>
          <div className="font-semibold tracking-tight">halftone.lab</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            shader walkthrough
          </div>
        </div>
      </div>

      <Separator />

      <SectionLabel>pipeline</SectionLabel>
      <div className="grid grid-cols-2 gap-1 px-3 pb-3">
        {PANEL_KEYS.map((k) => {
          const active = state.activeCode === k;
          return (
            <button
              key={k}
              type="button"
              data-active={active}
              onClick={() => dispatch({ type: "SET_ACTIVE_CODE", v: k })}
              className="group/p flex flex-col items-start gap-0.5 border border-border px-2.5 py-2 text-left transition-colors hover:bg-muted data-[active=true]:border-[var(--halftone-accent)] data-[active=true]:bg-[var(--halftone-accent-soft)]"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-data-[active=true]/p:text-[var(--halftone-accent)]">
                panel {k}
              </span>
              <span className="text-[11px] leading-snug text-foreground/80">
                {PANEL_META[k].title}
              </span>
            </button>
          );
        })}
      </div>

      <Separator />

      <SectionLabel>shared parameters</SectionLabel>
      <div className="flex flex-col gap-3 px-5 pb-4">
        {SLIDERS.map((s) => {
          const value = state.tweaks[s.k];
          return (
            <div key={s.k} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <label htmlFor={`sl-${s.k}`}>{s.label}</label>
                <span
                  aria-live="polite"
                  className="tabular-nums text-foreground/80"
                >
                  {formatVal(value, s.step)}
                </span>
              </div>
              <Slider
                id={`sl-${s.k}`}
                aria-label={s.label}
                aria-valuetext={formatVal(value, s.step)}
                value={[value]}
                min={s.min}
                max={s.max}
                step={s.step}
                onValueChange={(next) => {
                  const n = Array.isArray(next) ? next[0] : next;
                  dispatch({ type: "SET_TWEAK", k: s.k, v: n });
                }}
              />
            </div>
          );
        })}
      </div>

      <Separator />

      <SectionLabel>overlays</SectionLabel>
      <div className="flex flex-wrap gap-2 px-5 pb-4">
        <Toggle
          size="sm"
          variant="outline"
          pressed={state.overlays.enabled}
          onPressedChange={(v: boolean) =>
            dispatch({ type: "SET_OVERLAY", enabled: v })
          }
          className="rounded-none border-border data-[state=on]:border-[var(--halftone-accent)] data-[state=on]:bg-[var(--halftone-accent-soft)] data-[state=on]:text-[var(--halftone-accent)]"
        >
          axes + mouse + drift
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={state.perPanel.B.showWarp}
          onPressedChange={(v: boolean) =>
            dispatch({
              type: "SET_PANEL_OPT",
              payload: { panel: "B", key: "showWarp", value: v },
            })
          }
          className="rounded-none border-border data-[state=on]:border-[var(--halftone-accent)] data-[state=on]:bg-[var(--halftone-accent-soft)] data-[state=on]:text-[var(--halftone-accent)]"
        >
          warp vectors (B)
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={state.perPanel.C.showVignette}
          onPressedChange={(v: boolean) =>
            dispatch({
              type: "SET_PANEL_OPT",
              payload: { panel: "C", key: "showVignette", value: v },
            })
          }
          className="rounded-none border-border data-[state=on]:border-[var(--halftone-accent)] data-[state=on]:bg-[var(--halftone-accent-soft)] data-[state=on]:text-[var(--halftone-accent)]"
        >
          vignette (C)
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={state.perPanel.A.showCurrentOnly}
          onPressedChange={(v: boolean) =>
            dispatch({
              type: "SET_PANEL_OPT",
              payload: { panel: "A", key: "showCurrentOnly", value: v },
            })
          }
          className="rounded-none border-border data-[state=on]:border-[var(--halftone-accent)] data-[state=on]:bg-[var(--halftone-accent-soft)] data-[state=on]:text-[var(--halftone-accent)]"
        >
          single layer (A)
        </Toggle>
      </div>

      <Separator />

      <SectionLabel>presets</SectionLabel>
      <div className="flex flex-wrap gap-2 px-5 pb-6">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none border-border font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted"
            onClick={() =>
              dispatch({
                type: "SET_TWEAKS",
                v: p.apply(state.tweaks),
              })
            }
          >
            {p.label}
          </Button>
        ))}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pb-1.5 pt-4 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">
      {children}
    </div>
  );
}
