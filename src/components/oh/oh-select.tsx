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

export type OhSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function OhSelect({ className, children, ...rest }: OhSelectProps) {
  return (
    <span className="relative inline-block w-full">
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
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        strokeWidth={1.75}
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-[color:var(--oh-content-muted)]"
      />
    </span>
  );
}
