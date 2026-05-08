import type { CSSProperties } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// B.PT270 — single source of truth for the visitor surface's host
// avatar visual treatment. Used by:
//   1. `/h/[handle]` landing + modal identity row (chip-morph
//      target — wrapper is motion.span with layoutId).
//   2. `/h/[handle]/booked/[uid]` receipt-modal host card (no
//      morph — wrapper is plain span).
//
// The visible look is identical at both callsites: a circular
// avatar with a 4px drop shadow, a 1px `#E5E5E5` ring overlay (the
// crisp paper-on-paper edge from Figma spec), and a mono-caps
// initials fallback against the surface's tint.
//
// Two exports:
//   - `HANDLE_AVATAR_PROJECTION_STYLE` — the inline style with
//     `borderRadius: 9999` + `boxShadow`. Apply to the wrapper
//     (motion.span at the morph callsite, plain span at the
//     receipt callsite). Inline `borderRadius: 9999` (not a
//     `rounded-full` class) is intentional: the host-profile
//     callsite needs the value as an inline style so motion's
//     layout projection animates the corner-radius alongside the
//     rect during the chip morph.
//   - `<HandleHostAvatarBody>` — the inner Avatar + ring overlay
//     fragment. The CALLER provides the wrapper so motion.span
//     (with layoutId / transition / initial-animate-exit) and
//     plain span variants share the same body.
//   - `<HandleHostAvatar>` — convenience wrapper for the non-
//     motion callsite (receipt-modal). Wraps `HandleHostAvatarBody`
//     in a plain span carrying `HANDLE_AVATAR_PROJECTION_STYLE`.

export const HANDLE_AVATAR_PROJECTION_STYLE: CSSProperties = {
  borderRadius: 9999,
  boxShadow: "0 4px 4px rgba(0,0,0,0.25)",
};

type HandleHostAvatarBodyProps = {
  src: string | null | undefined;
  alt: string;
  initials: string;
  /** Pixel size. Defaults to the Figma-spec 55px landing-card size. */
  size?: number;
};

export function HandleHostAvatarBody({
  src,
  alt,
  initials,
  size = 55,
}: HandleHostAvatarBodyProps) {
  return (
    <>
      <Avatar style={{ width: size, height: size }}>
        <AvatarImage src={src ?? undefined} alt={alt} />
        <AvatarFallback className="bg-[color:var(--oh-tint)] font-[family-name:var(--oh-mono)] text-[11px] font-extrabold uppercase tracking-[1px]">
          {initials}
        </AvatarFallback>
      </Avatar>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-[#E5E5E5]"
      />
    </>
  );
}

type HandleHostAvatarProps = HandleHostAvatarBodyProps & { className?: string };

export function HandleHostAvatar({
  src,
  alt,
  initials,
  size = 55,
  className,
}: HandleHostAvatarProps) {
  return (
    <span
      style={HANDLE_AVATAR_PROJECTION_STYLE}
      className={cn("relative inline-flex shrink-0", className)}
    >
      <HandleHostAvatarBody src={src} alt={alt} initials={initials} size={size} />
    </span>
  );
}
