"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Brutalist "input group" primitive. Pattern mirrors shadcn's
 * <InputGroup> / <InputGroupAddon> / <InputGroupInput>, but styled
 * for the paper-and-ink aesthetic used across the dashboard:
 *
 *   ┌─────┬────────────────────┐
 *   │ /h/ │ alex               │
 *   └─────┴────────────────────┘
 *    ^ prefix   ^ input
 *
 * Focus state triggers the 3px ink shadow offset used throughout the
 * brutalist theme (see .bru-input:focus in globals.css).
 *
 * All three pieces forward `className` through the shadcn `cn()` util,
 * so consumers can override any utility without losing the base styles.
 */

function BrutalistInputGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="brutalist-input-group"
      className={cn(
        "flex items-stretch border-[1.5px] border-(--bru-ink) bg-(--bru-paper)",
        "transition-shadow duration-75 [transition-timing-function:steps(1)]",
        "focus-within:shadow-[3px_3px_0_var(--bru-ink)]",
        className,
      )}
      {...props}
    />
  );
}

function BrutalistInputGroupPrefix({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="brutalist-input-group-prefix"
      className={cn(
        "flex items-center bg-(--bru-ink) px-2.5",
        "font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] uppercase",
        "text-(color:--bru-paper)",
        className,
      )}
      {...props}
    />
  );
}

function BrutalistInputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="brutalist-input-group-input"
      type={props.type ?? "text"}
      className={cn(
        "min-w-0 flex-1 bg-transparent px-3 py-2.5",
        "text-[15px] text-(color:--bru-ink) outline-none",
        "placeholder:text-(color:--bru-placeholder)",
        className,
      )}
      {...props}
    />
  );
}

export {
  BrutalistInputGroup,
  BrutalistInputGroupPrefix,
  BrutalistInputGroupInput,
};
