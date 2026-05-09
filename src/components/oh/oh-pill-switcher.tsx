"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// B.PT286 — Generic segmented pill switcher built on top of shadcn's
// `<Tabs>` primitive (which wraps base-ui's tablist). Keyboard nav,
// roving tabindex, ARIA roles all come from base-ui — no need to roll
// our own. We override the chrome via className to match the spec:
//
//   - track: warm paper bg + full pill radius + 3px inset
//   - active option: white pill with soft drop shadow, slid between
//     segments via motion's `layoutId`
//   - inactive option: muted ink text, transparent bg
//
// Per project's `motion-shared-layout.md`: forward `transition` to the
// motion.span so spring duration honors callsite intent rather than
// motion's 0.45s default.
//
// Per shadcn `<Tabs>` (motion.dev/docs/react-layout-group +
// base-ui Tabs.Root): controlled via `value` / `onValueChange`. Each
// `<TabsTrigger>` carries `value="..."`; the active one gets
// `data-active=""` automatically.

type Option<T extends string> = {
  value: T;
  // ReactNode (not string) so callers can compose richer labels — e.g.
  // "Upcoming <span class="opacity-65">3</span>" with primary label +
  // muted count for the bookings list-view tab bar.
  label: ReactNode;
  // CSS-driven responsive hide. When set, the option is `display:none`
  // below the named breakpoint and reveals at it. Hydration-safe (no
  // SSR/client divergence) and zero layout shift on mount, unlike
  // useState-driven option filtering. Use for view-mode switchers
  // where some options don't fit narrower viewports — e.g. month grid
  // is desktop-only in the bookings page (`hiddenAtBelow: "md"`).
  hiddenAtBelow?: "sm" | "md" | "lg" | "xl";
};

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  className?: string;
};

export function OhPillSwitcher<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: Props<T>) {
  // Unique per instance so two switchers on the same page don't share
  // a layoutId namespace and morph into each other.
  const layoutId = useId();

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList
        aria-label={ariaLabel}
        className={cn(
          // Track: muted paper (the project's "darker main" tone —
          // paper + ~8% ink in oklab) with a softened inset shadow.
          // `inset 0 3px 10px rgba(0,0,0,0.22)` — same shape as
          // `--oh-focus-shadow-input` (defined in `globals.css:215`
          // as `inset 0 3px 10px rgba(0,0,0,0.32)`) but with the
          // opacity dropped 0.32 → 0.22 to match the project's
          // canonical drop-shadow opacity (the `oh` / `ohGhost`
          // button shadow uses 0.22 too — keeps the depth intensity
          // consistent across inset / outset directions). Inline
          // value rather than the token because the input focus
          // state intentionally stays at 0.32 (stronger to signal
          // "actively engaged with this control"); the pill switcher
          // wants a calmer recess at rest.
          // Outer radius: `--oh-r-sm` (6px) — canonical structural
          // radius per `oh-ui.md`.
          // `items-stretch` so children fill the track height. Lets a
          // caller set a fixed-height track (e.g. `className="h-9"`)
          // and have the buttons + active pill expand to match —
          // useful when the switcher sits next to fixed-height
          // siblings (e.g. AM/PM next to 36px hour/minute spinner
          // inputs in the time picker). Default `h-auto` track means
          // children inherit content-height; the items-stretch is a
          // no-op there.
          "h-auto items-stretch gap-0 rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px] text-foreground",
          "[box-shadow:inset_0_3px_10px_rgba(0,0,0,0.22)]",
          className,
        )}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
          // Tailwind responsive hide-classes paired explicitly so the
          // tree-shaker doesn't drop them. Keep verbatim — Tailwind's
          // JIT only emits classes it sees as literal strings.
          const responsiveHide =
            opt.hiddenAtBelow === "sm"
              ? "hidden sm:inline-flex"
              : opt.hiddenAtBelow === "md"
                ? "hidden md:inline-flex"
                : opt.hiddenAtBelow === "lg"
                  ? "hidden lg:inline-flex"
                  : opt.hiddenAtBelow === "xl"
                    ? "hidden xl:inline-flex"
                    : null;
          return (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              className={cn(
                // Strip shadcn's pre-baked: flex-1 (we want auto-width),
                // rounded-sm + h-[calc(100%-1px)] (we want rounded-[3px]
                // + content-driven height), data-active:bg-background +
                // data-active:shadow-sm (we paint the active pill via
                // the motion.span beneath instead). after:hidden kills
                // the line-variant underline pseudo.
                // Inner radius = 3px per Apple HIG concentric formula
                // (`inner = outer - padding`): track is `--oh-r-sm`
                // (6px) with `p-[3px]` → button bounds inset 3px from
                // the outer edge, so the inner radius that traces a
                // perfectly concentric arc is 6 - 3 = 3px. Neither
                // `--oh-r-xs` (2px) nor `--oh-r-sm` (6px) matches the
                // exact 3px value, so we use a literal arbitrary
                // class for this one Apple-HIG-derived measurement.
                "relative h-auto flex-none rounded-[3px] border-0 px-4 py-[7px]",
                "font-sans text-[14px] leading-none",
                "transition-colors duration-200 outline-none",
                "data-active:!bg-transparent data-active:!shadow-none after:hidden",
                isActive
                  ? "font-semibold text-[color:var(--oh-ink)]"
                  : "font-medium text-[rgba(10,10,10,0.55)] hover:text-[rgba(10,10,10,0.75)]",
                responsiveHide,
              )}
              style={{
                transitionTimingFunction:
                  "var(--ease-oh, cubic-bezier(0.16, 1, 0.3, 1))",
              }}
            >
              {isActive ? (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  // Active pill = `--oh-paper` (the LIGHTER main
                  // tone). Outer drop shadow matching the `oh` /
                  // `ohGhost` button variants
                  // (`0 3px 12px rgba(0,0,0,0.22)`) so the pill
                  // reads as floating ABOVE the recessed track.
                  // Radius = 3px per Apple HIG concentric formula:
                  // outer track is `--oh-r-sm` (6px) with `p-[3px]`,
                  // so a perfectly concentric inner arc is at
                  // `outer - padding = 6 - 3 = 3px`. WWDC22 "What's
                  // new in SwiftUI" calls this out as the canonical
                  // way to nest rounded rects. Tracks the
                  // TabsTrigger's `rounded-[3px]` above so the pill
                  // and its containing button share bounds + radius
                  // exactly.
                  className="oh-sheen absolute inset-0 rounded-[3px] bg-oh-paper shadow-[var(--oh-shadow-resting)]"
                  transition={{
                    type: "spring",
                    duration: 0.22,
                    bounce: 0,
                  }}
                />
              ) : null}
              <span className="relative z-10">{opt.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
