"use client";

import { forwardRef, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type ViewMode = "day" | "week" | "month" | "list";

const LABELS: Record<ViewMode, string> = {
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  list: "LIST",
};

export function BookingsViewSwitcher({
  value,
  onValueChange,
  ariaLabel = "View mode",
}: {
  value: ViewMode;
  onValueChange: (next: ViewMode) => void;
  ariaLabel?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLButtonElement>(null);
  const weekRef = useRef<HTMLButtonElement>(null);
  const monthRef = useRef<HTMLButtonElement>(null);
  const listBtnRef = useRef<HTMLButtonElement>(null);
  const prevValueRef = useRef<ViewMode>(value);

  const refFor = (mode: ViewMode): HTMLButtonElement | null => {
    switch (mode) {
      case "day":
        return dayRef.current;
      case "week":
        return weekRef.current;
      case "month":
        return monthRef.current;
      case "list":
        return listBtnRef.current;
    }
  };

  useGSAP(
    () => {
      const prev = prevValueRef.current;
      if (prev === value) return;
      prevValueRef.current = value;

      const fromEl = refFor(prev);
      const toEl = refFor(value);
      if (!fromEl || !toEl) return;

      const newUnderline = toEl.querySelector<HTMLSpanElement>(
        "[data-view-underline]",
      );
      if (!newUnderline) return;

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      gsap.from(newUnderline, {
        x: fromRect.left - toRect.left,
        scaleX: fromRect.width / toRect.width,
        transformOrigin: "left center",
        duration: 0.35,
        ease: "power3.inOut",
        overwrite: true,
      });
    },
    { scope: listRef, dependencies: [value] },
  );

  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as ViewMode)}>
      <TabsList
        ref={listRef}
        aria-label={ariaLabel}
        variant="line"
        className="h-auto w-fit gap-3 p-0"
      >
        <ViewTrigger
          ref={dayRef}
          mode="day"
          isActive={value === "day"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={weekRef}
          mode="week"
          isActive={value === "week"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={monthRef}
          mode="month"
          isActive={value === "month"}
        />
        <ViewSeparator />
        <ViewTrigger
          ref={listBtnRef}
          mode="list"
          isActive={value === "list"}
        />
      </TabsList>
    </Tabs>
  );
}

const ViewTrigger = forwardRef<
  HTMLButtonElement,
  { mode: ViewMode; isActive: boolean }
>(function ViewTrigger({ mode, isActive }, ref) {
  return (
    <TabsTrigger
      ref={ref}
      value={mode}
      aria-label={`Switch to ${LABELS[mode]} view`}
      className={cn(
        "group/view inline-flex items-center h-auto rounded-none border-0 bg-transparent p-0 py-1",
        "shadow-none data-active:shadow-none after:hidden",
        "oh-eyebrow text-foreground",
        isActive
          ? "opacity-100"
          : "opacity-70 hover:opacity-100 transition-opacity duration-200",
      )}
    >
      <span>{LABELS[mode]}</span>
      {isActive ? (
        <span
          data-view-underline
          aria-hidden
          className="pointer-events-none absolute -bottom-[5px] left-0 right-0 h-0.5 bg-[color:var(--oh-ink)]"
        />
      ) : null}
    </TabsTrigger>
  );
});

function ViewSeparator() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-px self-center bg-oh-line"
    />
  );
}
