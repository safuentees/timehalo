"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

/**
 * Brutalist-themed wrappers around shadcn's InputGroup primitives.
 * Each wrapper just forwards to the shadcn component with brutalist
 * overrides pre-applied (rounded-none, ink border, paper bg, 3px ink
 * focus shadow, mono typography on the prefix, etc).
 *
 * Inheriting from shadcn gets us for free:
 *   - click-on-addon focuses the sibling input
 *   - aria-invalid + focus wiring via `has-[...]:` selectors
 *   - built-in InputGroupButton / InputGroupTextarea / block addons
 *     if we want them later
 *
 * Usage follows shadcn's DOM order — place the input first, the
 * addon after, and let `align="inline-start"` handle visual position.
 */

function BrutalistInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      data-slot="brutalist-input-group"
      className={cn(
        // structure + base brutalist look. Outer radius + overflow-hidden
        // lets the rounded-none addon + input stay flush against each other
        // while the shell matches the --bru-r-xs scale used by other inputs.
        "h-auto items-stretch overflow-hidden rounded-(--bru-r-xs) border-[1.5px] border-(--bru-ink) bg-(--bru-paper)",
        // brutalist focus effect, kills shadcn's ring
        "transition-shadow duration-75 [transition-timing-function:steps(1)] focus-within:shadow-[3px_3px_0_var(--bru-ink)]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-(--bru-ink) has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        // keep ink border when the nested input is aria-invalid; FieldError communicates the actual error
        "has-[[data-slot][aria-invalid=true]]:border-(--bru-ink) has-[[data-slot][aria-invalid=true]]:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function BrutalistInputGroupAddon({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  return (
    <InputGroupAddon
      data-slot="brutalist-input-group-addon"
      className={cn(
        "rounded-none bg-(--bru-ink) px-2.5 py-0",
        className,
      )}
      {...props}
    />
  );
}

function BrutalistInputGroupText({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupText>) {
  return (
    <InputGroupText
      data-slot="brutalist-input-group-text"
      className={cn(
        "font-[family-name:var(--bru-mono)] text-[10px] font-extrabold tracking-[1.5px] text-(color:--bru-paper) uppercase",
        className,
      )}
      {...props}
    />
  );
}

function BrutalistInputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroupInput
      data-slot="brutalist-input-group-input"
      className={cn(
        "px-3 py-2.5 text-[15px] text-(color:--bru-ink) placeholder:text-(color:--bru-placeholder)",
        className,
      )}
      {...props}
    />
  );
}

export {
  BrutalistInputGroup,
  BrutalistInputGroupAddon,
  BrutalistInputGroupText,
  BrutalistInputGroupInput,
};
