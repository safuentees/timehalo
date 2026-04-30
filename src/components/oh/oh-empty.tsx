import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Composable empty state — shadcn `<Empty>` slot model
// (`<EmptyHeader><EmptyMedia/><EmptyTitle/><EmptyDescription/></EmptyHeader>
// <EmptyContent/>`), oh-themed.
//
// Default = NO border. The dashed-frame look the audit flagged as
// "reads as a popping placeholder against a sparse page" was the old
// default; shadcn's own Empty primitive ships borderless and only
// adds the dashed border in the explicit `empty-outline` variant. We
// follow. Consumers who genuinely want the framed look can compose
// with the soft placeholder token (~12% ink, fades into the bg):
//
//   <OhEmpty className="border border-dotted border-[var(--oh-line-placeholder)]">
//
// Pattern reference: shadcn `registry/new-york-v4/ui/empty.tsx` +
// `examples/empty-{demo,outline,icon,background}.tsx`. Note: shadcn
// defaults to dashed; we use dotted because it pairs better with the
// soft placeholder color and reads as a hint, not a CTA outline.

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

// Icon container. Bare-flow, no halo / ring / muted-grey tile —
// `oh-ui.md` *Empty states + icons* explicitly bans the stock-shadcn
// "rounded grey background" treatment. The lucide line icon sits
// directly in the column; `text-content-subtle` (35% ink) is the
// canonical empty-icon color the rule names. Single variant for now;
// a `media-image` shape would slot in later if a thumbnail-empty
// surfaces.
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
