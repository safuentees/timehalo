"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Boolean on/off switcher — visually a 2-segment pill (OFF / ON)
// with a motion-animated indicator that slides between sides.
//
// Architecture: Base UI's `SwitchPrimitive.Root` from
// `@base-ui/react/switch` (same primitive shadcn's `<Switch>` is
// built on). The Root is a single accessible `<button>` with
// `role="switch"` + `aria-checked` — keyboard handling, focus,
// disabled state all come for free. We render the two visible
// segments (OFF / ON) as content INSIDE the root; the click-to-
// toggle behavior on the whole button means the user can click
// either segment to flip state, and the visual immediately
// confirms which side is now active.
//
// Visual: borrowed wholesale from `OhPillSwitcher` — paper-on-
// muted track with a 3px inset shadow recess + a paper pill with
// drop shadow for the active segment. The pill is rendered as a
// child motion.span with `layoutId`; when `checked` flips, the
// old pill unmounts and the new one mounts in the opposite
// segment, and motion's shared-layout animation slides the pill
// across (same FLIP technique used by the bookings tab
// underline). Per `motion-shared-layout.md`, transition is
// forwarded so the spring honors callsite intent rather than
// motion's 0.45s default.
//
// API mirrors `<Switch>` exactly so this is a drop-in replacement
// where the visual fits — `checked`, `onCheckedChange`,
// `disabled`, `aria-label`, plus optional custom labels for
// non-English ON/OFF copy.

type Labels = {
  on: ReactNode;
  off: ReactNode;
};

const DEFAULT_LABELS: Labels = {
  on: "ON",
  off: "OFF",
};

type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /**
   * Accessible label. Reads as the switch's announced name to assistive
   * tech — should describe what flipping the switch does. The OFF / ON
   * segments themselves are decorative for sighted users; the SR text
   * comes from this prop.
   */
  ariaLabel?: string;
  /** Override the visible OFF / ON copy. Defaults to "OFF" / "ON". */
  labels?: Labels;
  /** Optional id for label association. */
  id?: string;
  className?: string;
};

export function OhPillSwitch({
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  labels = DEFAULT_LABELS,
  id,
  className,
}: Props) {
  // Per-instance namespace so two switches on the same page don't
  // share a layoutId and morph their pills into each other.
  const layoutId = useId();

  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        // Track — same recipe as OhPillSwitcher: muted-paper bg with
        // an inset 3px recess shadow. Inset matches the pill-switcher
        // exactly so the chrome reads as "the project's segmented
        // control" not as a one-off.
        "oh-focus-ring relative inline-flex h-auto items-stretch gap-0 rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px] text-foreground transition-all outline-none",
        "[box-shadow:inset_0_3px_10px_rgba(0,0,0,0.22)]",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
    >
      <PillSegment
        active={!checked}
        layoutId={layoutId}
        label={labels.off}
      />
      <PillSegment
        active={checked}
        layoutId={layoutId}
        label={labels.on}
      />
    </SwitchPrimitive.Root>
  );
}

// Each segment carries its own label + (when active) the sliding
// motion pill. Same dimensional formula as the OhPillSwitcher
// trigger: outer track 6px radius with 3px padding → inner radius
// 3px (Apple HIG concentric formula), text styles match the
// reference component so the two segmented controls look like
// siblings.

function PillSegment({
  active,
  layoutId,
  label,
}: {
  active: boolean;
  layoutId: string;
  label: ReactNode;
}) {
  return (
    <span
      className={cn(
        "relative flex h-auto flex-none items-center rounded-[3px] border-0 px-4 py-[7px]",
        "font-sans text-[14px] leading-none transition-colors duration-200",
        active
          ? "font-semibold text-[color:var(--oh-ink)]"
          : "font-medium text-[color:var(--oh-content-muted)]",
      )}
      style={{
        transitionTimingFunction:
          "var(--ease-oh, cubic-bezier(0.16, 1, 0.3, 1))",
      }}
    >
      {active ? (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          // Active pill — paper bg + canonical resting drop shadow.
          // Theme-aware via the token. Dimensional formula matches
          // OhPillSwitcher's pill exactly.
          className="absolute inset-0 rounded-[3px] bg-oh-paper shadow-[var(--oh-shadow-resting)]"
          transition={{
            type: "spring",
            duration: 0.22,
            bounce: 0,
          }}
        />
      ) : null}
      <span className="relative z-10">{label}</span>
    </span>
  );
}
