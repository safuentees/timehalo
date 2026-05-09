"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

function OhInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      data-slot="brutalist-input-group"
      className={cn(
        "h-auto items-stretch overflow-hidden rounded-(--oh-r-xs) border-[1.5px] border-(--oh-ink) bg-(--oh-paper)",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--oh-ink)]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-(--oh-ink) has-[[data-slot=input-group-control]:focus-visible]:ring-0",
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
