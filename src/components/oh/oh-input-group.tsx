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
 * Oh-themed wrappers around shadcn's InputGroup primitives.
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

function OhInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      data-slot="brutalist-input-group"
      className={cn(
        // structure + base brutalist look. Outer radius + overflow-hidden
        // lets the rounded-none addon + input stay flush against each other
        // while the shell matches the --oh-r-xs scale used by other inputs.
        "h-auto items-stretch overflow-hidden rounded-(--oh-r-xs) border-[1.5px] border-(--oh-ink) bg-(--oh-paper)",
        // brutalist focus effect, kills shadcn's ring
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--oh-ink)]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-(--oh-ink) has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        // keep ink border when the nested input is aria-invalid; FieldError communicates the actual error
        "has-[[data-slot][aria-invalid=true]]:border-(--oh-ink) has-[[data-slot][aria-invalid=true]]:ring-0",
        className,
      )}
      {...props}
    />
  );
}

function OhInputGroupAddon({
  className,
  align,
  ...props
}: React.ComponentProps<typeof InputGroupAddon>) {
  // Quieter prefix label: paper bg matches the input recess, the
  // separation between addon and input is a 1px paper-soft hairline
  // (`--oh-line-default`, ~22% ink) — softened in B.PT303 from the
  // earlier 1.5px ink rule, which read as a brutalist hard wall
  // against the borderless-depth chrome the rest of the app shifted
  // to in B.PT284. The hairline gives just enough typographic
  // separation between the prefix and the value without re-introducing
  // a contrasting border on a recessed paper surface.
  const sideRule =
    align === "inline-end"
      ? "border-l border-[color:var(--oh-line-default)]"
      : "border-r border-[color:var(--oh-line-default)]";
  return (
    <InputGroupAddon
      data-slot="brutalist-input-group-addon"
      align={align}
      className={cn(
        "rounded-none bg-transparent px-3 py-0",
        sideRule,
        className,
      )}
      {...props}
    />
  );
}

function OhInputGroupText({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupText>) {
  return (
    <InputGroupText
      data-slot="brutalist-input-group-text"
      className={cn(
        // Match the oh-eyebrow vocabulary used elsewhere (mono caps,
        // 11px, 1.5px tracking). 55% opacity so the prefix sits as a
        // quiet label rather than competing with the input value.
        "font-[family-name:var(--oh-mono)] text-[11px] font-extrabold tracking-[1.5px] uppercase text-(color:--oh-ink) opacity-55",
        className,
      )}
      {...props}
    />
  );
}

function OhInputGroupInput({
  className,
  ...props
}: React.ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroupInput
      data-slot="brutalist-input-group-input"
      className={cn(
        "px-3 py-2.5 text-[15px] text-(color:--oh-ink) placeholder:text-(color:--oh-placeholder)",
        className,
      )}
      {...props}
    />
  );
}

export {
  OhInputGroup,
  OhInputGroupAddon,
  OhInputGroupText,
  OhInputGroupInput,
};
