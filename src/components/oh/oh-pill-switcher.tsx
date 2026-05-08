"use client";

import { motion } from "motion/react";
import { useId } from "react";
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
  label: string;
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
          // Override shadcn's defaults: rounded-sm → rounded-full,
          // bg-muted → paper, h-8 → h-auto (active pill content drives
          // height), gap-0 to keep buttons flush so the active pill
          // morphs without intermediate gaps.
          // Drop shadow matches the app-wide button vocabulary
          // (`0 3px 12px rgba(0,0,0,0.22)` — same as `oh` / `ohGhost`
          // variants in `button.tsx`). The track is paper-colored AND
          // sits on a paper page bg, so without a shadow it would
          // visually disappear; the shadow gives the track presence
          // as a chrome layer floating above the page.
          "h-auto gap-0 rounded-full bg-[color:var(--oh-paper)] p-[3px] text-foreground",
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
                "relative h-auto flex-none rounded-[10px] border-0 px-4 py-[7px]",
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
                  // Active pill = `--oh-bg-muted` (the project's
                  // "other" main paper variant — paper darkened ~8%
                  // ink in oklab). On a paper-colored track, a
                  // darker pill creates the same two-tone
                  // vocabulary the auth shell uses (just inverted —
                  // here the LIGHTER one is the outer / track and
                  // the DARKER one is the inner / active pill). Soft
                  // outer shadow preserves the floating-pill depth.
                  className="absolute inset-0 rounded-[10px] bg-oh-bg-muted shadow-[0_1px_2px_rgba(0,0,0,0.06),0_1px_3px_rgba(0,0,0,0.04)]"
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
