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
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--bru-ink)]",
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
  align,
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  // Quieter prefix label: paper bg matches the input surface, the
  // separation between addon and input comes from a 1.5px ink rule
  // (right edge for inline-start, left edge for inline-end) instead
  // of an inverted ink block. Reads as one continuous paper input
  // with a typographically distinct prefix — matches the rest-of-app
  // input vocabulary (`.bru-input` is paper-on-ink throughout).
  const sideRule =
    align === "inline-end"
      ? "border-l-[1.5px] border-(--bru-ink)"
      : "border-r-[1.5px] border-(--bru-ink)";
  return (
    <InputGroupAddon
      data-slot="brutalist-input-group-addon"
      align={align}
      className={cn(
        "rounded-none bg-(--bru-paper) px-3 py-0",
        sideRule,
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
        // Match the bru-eyebrow vocabulary used elsewhere (mono caps,
        // 11px, 1.5px tracking). 55% opacity so the prefix sits as a
        // quiet label rather than competing with the input value.
        "font-[family-name:var(--bru-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase text-(color:--bru-ink) opacity-55",
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
