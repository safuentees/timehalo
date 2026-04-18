"use client";

import { WavePlot } from "./wave-plot";
import { Histogram } from "./histogram";
import { CodeView } from "./code-view";

export function AuxRow() {
  return (
    <section
      aria-label="Aux views"
      className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.2fr]"
    >
      <figure className="flex flex-col border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--halftone-accent)]">
              1d
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              wave function
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            v(k) = sin(a*3 − t + sin(k−t)*2.5)*0.1*d + (d − k*0.4)
          </p>
        </header>
        <div className="relative h-44 bg-muted/40">
          <WavePlot />
        </div>
      </figure>

      <figure className="flex flex-col border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--halftone-accent)]">
              h
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              field histogram
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            distribution of composite — accent line marks contrast cutoff
          </p>
        </header>
        <div className="relative h-44 bg-muted/40">
          <Histogram />
        </div>
      </figure>

      <div className="min-h-[260px] lg:min-h-[360px]">
        <CodeView />
      </div>
    </section>
  );
}
