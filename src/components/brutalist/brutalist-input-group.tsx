"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

function BrutalistInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      data-slot="brutalist-input-group"
      className={cn(
        "h-auto items-stretch overflow-hidden rounded-(--bru-r-xs) border-[1.5px] border-(--bru-ink) bg-(--bru-paper)",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--bru-ink)]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-(--bru-ink) has-[[data-slot=input-group-control]:focus-visible]:ring-0",
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
