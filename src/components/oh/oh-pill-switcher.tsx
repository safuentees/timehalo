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
          // paper + ~8% ink in oklab). Replaces the earlier paper bg
          // so the track contrasts against the paper-colored page,
          // and the active pill (now paper) reads as the LIGHTER /
          // recessed-feeling element. Same two-tone the auth shell
          // uses, just inverted to match the visual ref.
          // Outer radius: `--oh-r-sm` (6px) — matches the app's
          // canonical structural radius (per oh-ui.md "Radius scale:
          // one structural token"). Drops the previous rounded-full
          // pill which read as "stock shadcn" rather than the
          // project's tighter chrome vocabulary.
          // Drop shadow same vocabulary as `oh` / `ohGhost` button
          // variants in `button.tsx` so the track sits as a chrome
          // layer floating above the page.
          "h-auto gap-0 rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px] text-foreground",
          "shadow-[0_3px_12px_rgba(0,0,0,0.22)]",
          className,
        )}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
          return (
            <TabsTrigger
              key={opt.value}
              value={opt.value}
              className={cn(
                // Strip shadcn's pre-baked: flex-1 (we want auto-width),
                // rounded-sm + h-[calc(100%-1px)] (we want rounded-[10px]
                // + content-driven height), data-active:bg-background +
                // data-active:shadow-sm (we paint the active pill via
                // the motion.span beneath instead). after:hidden kills
                // the line-variant underline pseudo.
                "relative h-auto flex-none rounded-(--oh-r-xs) border-0 px-4 py-[7px]",
                "font-sans text-[14px] leading-none",
                "transition-colors duration-200 outline-none",
                "data-active:!bg-transparent data-active:!shadow-none after:hidden",
                isActive
                  ? "font-semibold text-[color:var(--oh-ink)]"
                  : "font-medium text-[rgba(10,10,10,0.55)] hover:text-[rgba(10,10,10,0.75)]",
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
                  // tone). With the track now on `--oh-bg-muted`
                  // (the darker main), the pill is the lighter
                  // contrast — matches the visual ref and mirrors
                  // the auth shell's outer-muted / inner-paper
                  // vocabulary. Inner radius `--oh-r-xs` (2px) per
                  // the app's chip / segment radius token (smaller
                  // than the `--oh-r-sm` structural outer = clean
                  // concentric).
                  className="absolute inset-0 rounded-(--oh-r-xs) bg-oh-paper shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
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
