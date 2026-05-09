"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

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
  ariaLabel?: string;
  labels?: Labels;
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
  const layoutId = useId();

  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
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
