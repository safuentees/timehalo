"use client";

import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useHalftoneLab } from "../_lib/use-halftone-state";
import { mapLayers } from "../_lib/constants";
import { ShaderPanel } from "./shader-panel";
import { DotPanel } from "./dot-panel";

export function PanelGrid() {
  return (
    <section
      aria-label="Shader panels"
      className="grid grid-cols-1 gap-3 @lg:grid-cols-2 [&>figure]:min-h-[320px]"
    >
      <ShaderPanel panelKey="A" footContent={<LayerScrubberFoot />} />
      <ShaderPanel panelKey="B" footContent={<PanelBFoot />} />
      <ShaderPanel panelKey="C" footContent={<PanelCFoot />} />
      <DotPanel footContent={<PanelDFoot />} />
    </section>
  );
}

function LayerScrubberFoot() {
  const { state, dispatch } = useHalftoneLab();
  const baseLayers = mapLayers(state.tweaks.orbitCount);
  const override = state.perPanel.A.layerOverride;
  const layers = override ?? baseLayers;

  return (
    <div className="flex w-full items-center gap-3">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        layers
      </span>
      <Slider
        aria-label="layer scrubber"
        value={[layers]}
        min={1}
        max={128}
        step={1}
        onValueChange={(value) => {
          const next = Array.isArray(value) ? value[0] : value;
          dispatch({ type: "SET_LAYER_OVERRIDE", v: next });
        }}
        className="flex-1"
      />
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/80">
        {layers} / 128
      </span>
      {override !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 rounded-none px-2 font-mono text-[10px] uppercase tracking-wider text-[var(--halftone-accent)] hover:bg-[var(--halftone-accent-soft)]"
          onClick={() => dispatch({ type: "SET_LAYER_OVERRIDE", v: null })}
        >
          release
        </Button>
      ) : null}
    </div>
  );
}

function PanelBFoot() {
  const { state } = useHalftoneLab();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>fbm octaves = 4</span>
      <span className="text-muted-foreground/40">·</span>
      <span>warp = swirl × 4</span>
      <span className="text-muted-foreground/40">·</span>
      <span>
        viewing:{" "}
        <strong className="text-foreground/80">
          {state.perPanel.B.showWarp ? "warp vectors" : "warped fbm"}
        </strong>
      </span>
    </div>
  );
}

function PanelCFoot() {
  const { state } = useHalftoneLab();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>field = wave × rippleMix + n × baseMix</span>
      <span className="text-muted-foreground/40">·</span>
      <span>
        viewing:{" "}
        <strong className="text-foreground/80">
          {state.perPanel.C.showVignette ? "vignette only" : "composite"}
        </strong>
      </span>
    </div>
  );
}

function PanelDFoot() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>grid = 14 px</span>
      <span className="text-muted-foreground/40">·</span>
      <span>dots below contrast cut are skipped</span>
    </div>
  );
}
