"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Option<T extends string> = {
  value: T;
  label: ReactNode;
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
  const layoutId = useId();

  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList
        aria-label={ariaLabel}
        className={cn(
          "h-auto items-stretch gap-0 rounded-(--oh-r-sm) bg-oh-bg-muted p-[3px] text-foreground",
          "[box-shadow:inset_0_3px_10px_rgba(0,0,0,0.22)]",
          className,
        )}
      >
        {options.map((opt) => {
          const isActive = opt.value === value;
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
                  className="absolute inset-0 rounded-[3px] bg-oh-paper shadow-[0_3px_12px_rgba(0,0,0,0.22)]"
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
