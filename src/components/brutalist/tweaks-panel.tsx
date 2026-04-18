"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HalftoneTweaks } from "@/lib/halftone-defaults";

type Typeface = "grotesk" | "serif" | "mono";
type Density = "airy" | "dense";

type Props = {
  theme: string | undefined;
  setTheme: (v: string) => void;
  typeface: Typeface;
  setTypeface: (v: Typeface) => void;
  density: Density;
  setDensity: (v: Density) => void;
  motion: boolean;
  setMotion: (v: boolean) => void;
  tweaks: HalftoneTweaks;
  onTweaksChange: (patch: Partial<HalftoneTweaks>) => void;
};

export function TweaksPanel({
  theme,
  setTheme,
  typeface,
  setTypeface,
  density,
  setDensity,
  motion,
  setMotion,
  tweaks,
  onTweaksChange,
}: Props) {
  const params = useSearchParams();
  const enabled =
    process.env.NODE_ENV === "development" || params.get("tune") === "1";

  const [dismissed, setDismissed] = useState(false);

  if (!enabled || dismissed) return null;

  return (
    <div className="bru-tweaks" role="region" aria-label="Tweaks">
      <div className="bru-tweaks-head">
        <span>TWEAKS</span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Close tweaks"
        >
          ×
        </button>
      </div>

      <SegRow label="THEME">
        <Seg
          value={theme === "dark" ? "dark" : "light"}
          onChange={(v) => setTheme(v)}
          opts={[
            ["light", "LIGHT"],
            ["dark", "DARK"],
          ]}
        />
      </SegRow>
      <SegRow label="TYPEFACE">
        <Seg
          value={typeface}
          onChange={(v) => setTypeface(v as Typeface)}
          opts={[
            ["grotesk", "GROT"],
            ["serif", "SERIF"],
            ["mono", "MONO"],
          ]}
        />
      </SegRow>
      <SegRow label="DENSITY">
        <Seg
          value={density}
          onChange={(v) => setDensity(v as Density)}
          opts={[
            ["airy", "AIRY"],
            ["dense", "DENSE"],
          ]}
        />
      </SegRow>
      <SegRow label="MOTION">
        <Seg
          value={motion ? "on" : "off"}
          onChange={(v) => setMotion(v === "on")}
          opts={[
            ["on", "ON"],
            ["off", "OFF"],
          ]}
        />
      </SegRow>

      <div className="bru-twdivider">RIPPLES</div>

      <TweakSlider
        label="RIPPLE MIX"
        value={tweaks.rippleMix}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onTweaksChange({ rippleMix: v })}
      />
      <TweakSlider
        label="BASE NOISE"
        value={tweaks.baseMix}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onTweaksChange({ baseMix: v })}
      />
      <TweakSlider
        label="PULSE RATE"
        value={tweaks.rippleSpeed}
        min={0.1}
        max={2.5}
        step={0.01}
        onChange={(v) => onTweaksChange({ rippleSpeed: v })}
      />
      <TweakSlider
        label="RING DENS."
        value={tweaks.rippleFreq}
        min={3}
        max={30}
        step={0.5}
        onChange={(v) => onTweaksChange({ rippleFreq: v })}
      />
      <TweakSlider
        label="SWIRL"
        value={tweaks.swirl}
        min={0}
        max={0.8}
        step={0.01}
        onChange={(v) => onTweaksChange({ swirl: v })}
      />
      <TweakSlider
        label="ORBITS"
        value={tweaks.orbitCount}
        min={1}
        max={10}
        step={1}
        onChange={(v) => onTweaksChange({ orbitCount: v })}
      />
      <TweakSlider
        label="ORBIT SPD"
        value={tweaks.orbitSpeed}
        min={0}
        max={1.5}
        step={0.01}
        onChange={(v) => onTweaksChange({ orbitSpeed: v })}
      />
      <TweakSlider
        label="ORBIT RAD."
        value={tweaks.orbitRadius}
        min={0}
        max={0.6}
        step={0.01}
        onChange={(v) => onTweaksChange({ orbitRadius: v })}
      />
      <TweakSlider
        label="CONTRAST"
        value={tweaks.contrast}
        min={0.05}
        max={0.5}
        step={0.01}
        onChange={(v) => onTweaksChange({ contrast: v })}
      />
    </div>
  );
}

function SegRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bru-twrow">
      <div className="bru-twlabel">{label}</div>
      {children}
    </div>
  );
}

function Seg({
  value,
  onChange,
  opts,
}: {
  value: string;
  onChange: (v: string) => void;
  opts: Array<[string, string]>;
}) {
  return (
    <div className="bru-seg">
      {opts.map(([v, l]) => (
        <button
          key={v}
          type="button"
          className={v === value ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function TweakSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const fmt = (n: number) => (step >= 1 ? String(n) : Number(n).toFixed(2));
  return (
    <div className="bru-twrow bru-twslider">
      <div className="bru-twlabel">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <div className="bru-twvalue">{fmt(value)}</div>
    </div>
  );
}
