"use client";

import { Switch } from "@/components/ui/switch";
import { HalftoneLabProvider, useHalftoneLab } from "../_lib/use-halftone-state";
import { TweakRail } from "./tweak-rail";
import { PanelGrid } from "./panel-grid";
import { AuxRow } from "./aux-row";

export function HalftoneLab() {
  return (
    <HalftoneLabProvider>
      <div
        data-halftone-lab
        className="flex w-full min-h-[calc(100vh-1px)]"
      >
        <TweakRail />
        <main className="flex min-w-0 flex-1 flex-col gap-4 px-6 py-5">
          <TopBar />
          <PanelGrid />
          <AuxRow />
        </main>
      </div>
    </HalftoneLabProvider>
  );
}

function TopBar() {
  const { state, dispatch } = useHalftoneLab();
  return (
    <div className="flex items-center justify-between border-b border-border pb-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        live pipeline
        <span className="mx-2 text-muted-foreground/40">/</span>
        4 panels
      </div>
      <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>sync code view</span>
        <Switch
          checked={state.syncCode}
          onCheckedChange={() => dispatch({ type: "TOGGLE_SYNC" })}
          aria-label="sync code view to hovered panel"
        />
      </label>
    </div>
  );
}
