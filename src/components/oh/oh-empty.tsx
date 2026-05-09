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
// follow. Consumers who genuinely want a framed look reach for the
// project's depth-driven well chrome — a recessed surface that fits
// the borderless / shadow-led vocabulary:
//
//   <OhEmpty className="oh-empty-surface rounded-(--oh-r-sm)">
//
// The earlier dotted-border pattern (`border border-dotted
// border-[var(--oh-line-placeholder)]`) was retired on 2026-05-09 —
// it read as a CTA outline against the otherwise borderless panel
// chrome. The well replaces it with the same surface-elevation
// language the rest of the chrome speaks.
//
// Pattern reference: shadcn `registry/new-york-v4/ui/empty.tsx` +
// `examples/empty-{demo,outline,icon,background}.tsx`.

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
// directly in the column.
//
// Color strategy: SOLID `--oh-ink` color on the SVG strokes, with
// `opacity: 0.35` on the SVG itself. Equivalent rendered dimness to
// the `--oh-content-subtle` color (35% ink) but without the stroke-
// overlap artifact: `currentColor` set to a color WITH alpha makes
// each lucide stroke render at 35% alpha, and stroke intersections
// composite to 1 − (1 − 0.35)² ≈ 58% — visibly darker than the rest
// of the lines (the user-flagged "see-through traces, opaque at
// intersections" issue). CSS `opacity` flattens the SVG to an
// offscreen buffer at full alpha first, then multiplies the whole
// result — overlaps never compose. Same final dimness, no artifact.
function OhEmptyMedia({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="oh-empty-media"
      className={cn(
        "flex items-center justify-center text-[color:var(--oh-ink)] [&_svg]:size-8 [&_svg]:opacity-[0.35] [&_svg:not([class*='stroke-'])]:[stroke-width:1.5]",
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
