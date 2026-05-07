# Schedule-your-meeting chip variants — code recipe

Spec: `docs/figma/spec-schedule-chips.json` (28 nodes from Figma file `oMqBS70mJBO6jBfWHRnbZt`, node `6:162`).
Anim: none captured (no prototype interactions on these chips).

## What's in the spec

Two horizontal sliders inside the modal body, three chip variants each:

```
Frame 1 (343×211, paper bg, INNER_SHADOW radius=14.9 black α0.25)
└─ div.oh-drawer-body (343×211)
   └─ chips (303×171.5)
      ├─ div.oh-day-strip-track  (303×91.5) — DAY chips
      │   ├─ disabled  91.5×91.5  M  4
      │   ├─ selected  91.5×91.5  T  5
      │   └─ enabled   91.5×91.5  W  6
      └─ div.oh-time-band-chips (303×50)    — TIME chips
          ├─ disabled  89×50
          ├─ selected  97×50  (Component 3 instance)
          └─ enabled   97×50  (Component 3 instance)
```

The Component 3 symbol (`6:136`, 88×48): paper bg, 1px ink stroke, cornerRadius 2.

## Outer container — INNER_SHADOW

The Figma `Frame 1` (343×211) has an INNER_SHADOW: `radius=14.9 spread=0 offset=(0,0) color=#000000 α0.25`. Round to 15 for cleaner CSS. This **is** the shadow the user already approximated in `HANDLE_CARD_RADIUS_STYLE`:

```tsx
// 1-to-1 match (Figma radius=14.9 ≈ 15):
style={{ boxShadow: "inset 0 0 15px rgba(0,0,0,0.25)" }}

// OR Tailwind v4 arbitrary:
className="inset-shadow-[0_0_15px_rgba(0,0,0,0.25)]"
```

Both work. Project token if you want to add one in `globals.css`:

```css
--oh-shadow-inset-card: inset 0 0 15px rgba(0, 0, 0, 0.25);
```

Then: `style={{ boxShadow: "var(--oh-shadow-inset-card)" }}`.

## DAY chips (3 variants, all 91.5×91.5, cornerRadius 2)

Common: drop-shadow halo `0 0 6px rgba(0,0,0,0.25)`, cornerRadius 2 (project's `--oh-r-xs`), no border.

| Variant | Background | Text color | Element opacity |
|---|---|---|---|
| `disabled` | `var(--oh-paper)` `#EEE7D5` | `var(--oh-ink)` | **0.32** |
| `enabled` | `var(--oh-paper)` `#EEE7D5` | `var(--oh-ink)` | 1 |
| `selected` | `var(--oh-ink)` `#0A0A0A` | `var(--oh-paper)` | 1 |

```tsx
type DayChipState = "disabled" | "enabled" | "selected";

function DayChip({ state, weekday, date }: {
  state: DayChipState;
  weekday: string; // "M" / "T" / "W"
  date: number;
}) {
  return (
    <button
      type="button"
      disabled={state === "disabled"}
      aria-pressed={state === "selected"}
      data-state={state}
      style={{ boxShadow: "0 0 6px rgba(0,0,0,0.25)" }}
      className={cn(
        "size-[91.5px] flex flex-col items-center justify-center gap-1",
        "rounded-(--oh-r-xs)",
        "transition-opacity duration-150",
        state === "selected"
          ? "bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)]"
          : "bg-[color:var(--oh-paper)] text-[color:var(--oh-ink)]",
        state === "disabled" && "opacity-[0.32] pointer-events-none",
      )}
    >
      <span className="oh-day-strip-weekday text-[10px] leading-4 font-mono uppercase">
        {weekday}
      </span>
      <span className="oh-day-strip-date text-[24px] leading-[31px] font-bold tabular-nums">
        {date}
      </span>
    </button>
  );
}
```

Sizes: weekday text `10×16` → `text-[10px] leading-4`. Date text `19×31` → `text-[24px] leading-[31px]` (the 19px width is just the visible glyph; container slot is taller).

## TIME chips (3 variants, ~88-97×50, cornerRadius 2)

The wrapper FRAME has no fill/stroke — the chip is the `Component 3` instance inside. Symbol data: paper bg, 1px ink stroke, cornerRadius 2. The instance overrides drop-shadow to `radius=5` (slightly tighter than day-strip's 6).

| Variant | Width | Background | Border | Text | Opacity |
|---|---|---|---|---|---|
| `disabled` | 89 | `var(--oh-paper)` | 1px `var(--oh-ink)` | `var(--oh-ink)` | **0.32** |
| `enabled` | 97 | `var(--oh-paper)` | 1px `var(--oh-ink)` | `var(--oh-ink)` | 1 |
| `selected` | 97 | (spec-data-equals enabled — see note below) | | | 1 |

**Note on time-band SELECTED**: the captured spec shows the same `Component 3` instance (paper bg, ink border) for both selected + enabled. The visual difference between "selected" and "enabled" in the time-band may live in a Component VARIANT outside the captured subtree (Figma stores variants as separate children of the same parent FRAME). Three options for implementation:

1. Mirror day-strip pattern — selected = ink fill, paper text. Most ergonomic, matches the day-strip's selected look.
2. Add an underline / 2px bottom border under selected (cal.com pattern).
3. Re-extract with a wider node-id to capture the full Component 3 variant set.

Recommended: option 1 unless the user signals option 2/3.

The 89 vs 97 width difference between disabled and enabled/selected in spec is real — likely intentional for the disabled variant's cropping. Keep the 8px difference if you want the 1-to-1 vibe; collapse to a fixed width if responsive matters more.

```tsx
type TimeChipState = "disabled" | "enabled" | "selected";

function TimeChip({ state, label }: { state: TimeChipState; label: string }) {
  return (
    <button
      type="button"
      disabled={state === "disabled"}
      aria-pressed={state === "selected"}
      data-state={state}
      style={{ boxShadow: "0 0 5px rgba(0,0,0,0.25)" }}
      className={cn(
        "h-[50px] px-[14px] inline-flex items-center justify-center",
        "rounded-(--oh-r-xs) border border-[color:var(--oh-ink)]",
        "font-mono text-[14px] tabular-nums",
        "transition-opacity duration-150",
        // option 1 — selected swaps to ink fill (matches day-strip):
        state === "selected"
          ? "bg-[color:var(--oh-ink)] text-[color:var(--oh-paper)]"
          : "bg-[color:var(--oh-paper)] text-[color:var(--oh-ink)]",
        state === "disabled" && "opacity-[0.32] pointer-events-none",
      )}
    >
      {label}
    </button>
  );
}
```

## Layout (the two slider tracks)

```tsx
<div className="oh-drawer-body flex flex-col gap-[30px] p-[20px]"
     style={{ boxShadow: "inset 0 0 15px rgba(0,0,0,0.25)", background: "var(--oh-paper)" }}>
  <div className="oh-day-strip-track flex gap-[10px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <DayChip state="disabled" weekday="M" date={4} />
    <DayChip state="selected" weekday="T" date={5} />
    <DayChip state="enabled" weekday="W" date={6} />
    {/* … rest of the week */}
  </div>
  <div className="oh-time-band-chips flex gap-[10px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <TimeChip state="disabled" label="9:00 AM" />
    <TimeChip state="selected" label="9:30 AM" />
    <TimeChip state="enabled" label="10:00 AM" />
    {/* … rest */}
  </div>
</div>
```

Padding measured from spec: outer Frame 1 `343×211.5` minus chips parent `303×171.5` = 40 width, 40 height = **20px on each side** (top/right/bottom/left).

Gap between day strip and time strip: 91.5 + 50 = 141.5; chips parent = 171.5; → 30px gap. Matches.

Gap inside each track between chips: spec doesn't carry the inter-item position deltas in the captured subset (the chips are positioned directly via parent flex auto-layout). Default to 10px and verify visually against Figma.

## Effects translation summary

| Figma effect | CSS |
|---|---|
| `INNER_SHADOW radius=14.9 spread=0 offset=(0,0) #000@0.25` (outer frame) | `box-shadow: inset 0 0 15px rgba(0,0,0,0.25)` |
| `DROP_SHADOW radius=6 spread=0 offset=(0,0) #000@0.25` (day chips) | `box-shadow: 0 0 6px rgba(0,0,0,0.25)` |
| `DROP_SHADOW radius=5 spread=0 offset=(0,0) #000@0.25` (time chips) | `box-shadow: 0 0 5px rgba(0,0,0,0.25)` |
| Element `opacity: 0.32` (disabled) | `opacity-[0.32]` |
| `cornerRadius: 2` | `rounded-(--oh-r-xs)` |
| Fill `#EEE7D5` | `bg-[color:var(--oh-paper)]` |
| Fill `#0A0A0A` | `bg-[color:var(--oh-ink)]` |

**Backdrop blur**: not captured in spec — no `BACKGROUND_BLUR` or `LAYER_BLUR` effect on any node. The user's mention of "backdrop effects" maps to the INNER_SHADOW above (which is what their `HANDLE_CARD_RADIUS_STYLE` snippet already encodes). If a future Figma revision adds `BACKGROUND_BLUR`, it'd surface in the spec's `effects[]` array and Tailwind v4 has `backdrop-blur-[…]` arbitrary for it.

## Wiring the chip variants to state

Day chips: state = `disabled | enabled | selected`. The disabled state means "no slots available that day". Map from upcoming-slots query: a day is `disabled` if no open slots exist for it. Day-of-week `selected` = active picker date (URL `?date=`). Else `enabled`.

Time chips: state = `disabled | enabled | selected`. `disabled` = booked-conflict on that slot. `selected` = active picker time (URL `?slot=`). Else `enabled`.

The horizontal-scroll wrappers should snap-scroll on touch:

```tsx
className="… snap-x snap-mandatory"
// each chip:
className="… snap-start"
```

## What to defer

- The 89 vs 97 width asymmetry on time-band disabled — visually subtle, may not be intentional. Verify with Figma directly before pixel-pinning.
- The "selected" time-band visual — best-guess option 1 (ink fill) above; confirm with the user once the parallel agent ships.
- Hover states — not captured here (no prototype interactions on these chips). The day-strip in `bookings-list.tsx` uses `hover:bg-oh-tint-hover` as the convention; same applies.
