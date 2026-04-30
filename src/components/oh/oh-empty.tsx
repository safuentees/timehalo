import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

function OhEmpty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="oh-empty"
      className={cn(
        "flex flex-col items-center justify-center gap-6 py-10 text-center",
        className,
      )}
      {...props}
    />
  );
}

function OhEmptyHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="oh-empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        className,
      )}
      {...props}
    />
  );
}

function OhEmptyMedia({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="oh-empty-media"
      className={cn(
        "flex items-center justify-center text-[color:var(--oh-content-subtle)] [&_svg]:size-8 [&_svg:not([class*='stroke-'])]:[stroke-width:1.5]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function OhEmptyTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="oh-empty-title"
      className={cn(
        "font-heading text-base font-bold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function OhEmptyDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="oh-empty-description"
      className={cn(
        "max-w-xs text-[13px] leading-relaxed text-[color:var(--oh-content-muted)]",
        className,
      )}
      {...props}
    />
  );
}

function OhEmptyContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="oh-empty-content"
      className={cn(
        "flex flex-wrap items-center justify-center gap-2",
        className,
      )}
      {...props}
    />
  );
}

export {
  OhEmpty,
  OhEmptyHeader,
  OhEmptyMedia,
  OhEmptyTitle,
  OhEmptyDescription,
  OhEmptyContent,
};

export type OhEmptyProps = ComponentProps<typeof OhEmpty> & {
  children?: ReactNode;
};
