import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Native <select> wrapped with the canonical oh-input look. Mobile
// a11y wins (system picker on iOS / Android beats every JS-driven
// select for thumb input + screen-reader announce); we keep that and
// just unify the styling so callsites don't keep redefining bespoke
// border / padding / mono-text combos.
//
// Audit `§4.6` flagged 15 native selects across the codebase with
// drift in className modifiers. This component swallows the chevron
// + border + focus ring; bespoke needs (mono numerals, narrow width)
// stay composable via the `className` prop merged with `cn()`.
//
// Pattern:
//   <OhSelect value={tz} onChange={(e) => setTz(e.target.value)}>
//     <option value="UTC">UTC</option>
//   </OhSelect>
//
// The chevron is a positioned lucide ChevronDown over the select's
// pr-9 reservation. `pointer-events-none` on the chevron keeps the
// click target on the select itself (matters for native picker open).

export type OhSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /**
   * Override the default `relative inline-block w-full` wrapper
   * classes. Use when the select sits inside `inline-flex` chrome that
   * shouldn't expand to full width (e.g. an inline label "Priority
   * <select>" row in host-pool-dialog).
   */
  wrapperClassName?: string;
};

export function OhSelect({
  className,
  wrapperClassName,
  children,
  ...rest
}: OhSelectProps) {
  return (
    <span className={cn("relative inline-block w-full", wrapperClassName)}>
      <select
        {...rest}
        className={cn(
          // oh-input gives the border, padding, paper bg, focus outline.
          // appearance-none kills the native dropdown arrow so the
          // sibling chevron can take over. pr-9 reserves space so the
          // value text doesn't run under the chevron.
          "oh-input appearance-none pr-9",
          className,
        )}
        // Chrome's built-in autofill / form-discovery scanner runs in
        // the page lifecycle BEFORE React hydration on slower first
        // loads. It tags every `<select>` (and credit-card / address
        // `<input>`) with `__gcruniqueid="N"` so its scanner can
        // correlate the field across reflows. The attribute is added
        // to the live DOM, NOT the server-rendered HTML — so React's
        // hydration pass sees a tree that doesn't match the SSR
        // payload and surfaces the "tree hydrated but some attributes
        // didn't match" warning. Standard React 19 escape hatch:
        // suppressHydrationWarning on the specific element. Per Next
        // docs (nextjs.org/docs/messages/react-hydration-error), this
        // is the recommended fix for browser-injected attributes.
        // Reload makes it disappear because the scanner runs after
        // hydration on warm caches.
        suppressHydrationWarning
      >
        {children}
      </select>
      {/* Solid ink color + opacity-0.55 (matches `--oh-content-muted`'s
          rendered dimness) so the chevron's stroke intersections at
          the V-vertex don't compose double-alpha and look darker
          than the rest of the lines. CSS opacity flattens internal
          stroke compositing before applying the dim factor. */}
      <ChevronDown
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-[color:var(--oh-ink)] opacity-[0.55]"
      />
    </span>
  );
}
